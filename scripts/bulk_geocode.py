#!/usr/bin/env python3
"""
Bulk geocode Turkish districts using Open-Meteo geocoding API.

Usage:
  python scripts/bulk_geocode.py --data data/il-ilce.json --out data/il-ilce-with-loc.json --delay 1.0

The script saves a cache to `data/geocode-cache.json` so repeated runs reuse results.
Be polite with the API: use `--delay` (default 1s) and consider running in batches with `--start`/`--limit`.
"""
import argparse
import json
import time
import urllib.parse
import unicodedata
import sys
import os

try:
    import requests
    HAVE_REQUESTS = True
except Exception:
    import urllib.request as _urllib
    HAVE_REQUESTS = False


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def geocode_query(q):
    # request up to 5 candidates so we can try to match admin1 (province)
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(q)}&count=5&language=tr&format=json"
    headers = {'User-Agent': 'weather-app-bulk-geocode/1.0'}
    if HAVE_REQUESTS:
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return {}
    else:
        req = _urllib.Request(url, headers=headers)
        try:
            with _urllib.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except Exception:
            return {}


def normalize_text(s):
    if not s:
        return ''
    # replace common Turkish chars to ascii for comparison
    trans = str.maketrans({'İ':'I','ı':'i','Ç':'C','ç':'c','Ğ':'G','ğ':'g','Ö':'O','ö':'o','Ş':'S','ş':'s','Ü':'U','ü':'u'})
    try:
        s2 = s.translate(trans)
    except Exception:
        s2 = s
    # decompose accents and remove
    s2 = unicodedata.normalize('NFKD', s2)
    s2 = ''.join(c for c in s2 if not unicodedata.combining(c))
    return s2.strip().lower()


def main():
    parser = argparse.ArgumentParser(description="Bulk geocode Turkish districts")
    parser.add_argument("--data", default="data/il-ilce.json", help="input dataset path")
    parser.add_argument("--out", default="data/il-ilce-with-loc.json", help="output enriched dataset")
    parser.add_argument("--cache", default="data/geocode-cache.json", help="cache file path")
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    parser.add_argument("--start", type=int, default=0, help="start index for batching")
    parser.add_argument("--limit", type=int, default=0, help="max items to process (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="do not write output files")
    args = parser.parse_args()

    if not os.path.exists(args.data):
        print("Data file not found:", args.data, file=sys.stderr)
        sys.exit(1)

    data = load_json(args.data)
    cache = {}
    if os.path.exists(args.cache):
        try:
            cache = load_json(args.cache)
        except Exception:
            cache = {}

    # build unique query list: (province, district)
    uniq = []
    seen = set()
    for prov in data.get('data', []):
        province = prov.get('il_adi')
        for ilce in prov.get('ilceler', []):
            district = ilce.get('ilce_adi')
            key = f"{province}|||{district}"
            if key not in seen:
                seen.add(key)
                uniq.append((province, district))

    total = len(uniq)
    print(f"{total} unique district queries found.")

    start = args.start
    end = None if args.limit == 0 else start + args.limit
    slice_ = uniq[start:end]

    for idx, (province, district) in enumerate(slice_, start=start):
        key = f"{province}|||{district}"
        if key in cache:
            print(f"[{idx+1}/{total}] cached: {district} / {province} -> {cache[key].get('latitude')},{cache[key].get('longitude')}")
            continue

        # try multiple query patterns to increase match rate
        patterns = [
            f"{district}, {province}, Turkey",
            f"{district} {province} Turkey",
            f"{district}, {province}",
            f"{district} Turkey",
            f"{district}"
        ]

        chosen = None
        print(f"[{idx+1}/{total}] querying for: {district} / {province}")
        try:
            for q in patterns:
                print(f"  -> try: {q}")
                res = geocode_query(q)
                if not res or not res.get('results'):
                    print("    no candidates")
                    continue
                # prefer candidates whose admin1 matches the province
                candidates = res.get('results', [])
                prov_norm = normalize_text(province or '')
                best = None
                for c in candidates:
                    adm1 = c.get('admin1') or ''
                    if normalize_text(adm1) == prov_norm:
                        best = c
                        break
                if not best:
                    best = candidates[0]
                if best:
                    chosen = best
                    cache[key] = {
                        'latitude': best.get('latitude'),
                        'longitude': best.get('longitude'),
                        'name': best.get('name'),
                        'admin1': best.get('admin1'),
                        'country': best.get('country')
                    }
                    print(f"    -> match: {cache[key]['latitude']},{cache[key]['longitude']} ({best.get('name')})")
                    break

            if not chosen:
                cache[key] = {'latitude': None, 'longitude': None}
                print(" -> no result after tries")
        except Exception as e:
            print(" -> error:", e)

        # persist cache incrementally
        try:
            save_json(args.cache, cache)
        except Exception:
            pass
        time.sleep(max(0, args.delay))

    # enrich original data
    for prov in data.get('data', []):
        province = prov.get('il_adi')
        for ilce in prov.get('ilceler', []):
            district = ilce.get('ilce_adi')
            key = f"{province}|||{district}"
            if key in cache and cache[key].get('latitude') is not None:
                ilce['latitude'] = cache[key]['latitude']
                ilce['longitude'] = cache[key]['longitude']
                ilce['_geocoded_name'] = cache[key].get('name')
            else:
                ilce['latitude'] = ilce.get('latitude') or None
                ilce['longitude'] = ilce.get('longitude') or None

    if args.dry_run:
        print("Dry run complete — no files written.")
    else:
        save_json(args.out, data)
        save_json(args.cache, cache)
        print(f"Saved enriched dataset to {args.out}")


if __name__ == '__main__':
    main()
