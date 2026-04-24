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
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(q)}&count=1&language=tr&format=json"
    headers = {'User-Agent': 'weather-app-bulk-geocode/1.0'}
    if HAVE_REQUESTS:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.json()
    else:
        req = _urllib.Request(url, headers=headers)
        with _urllib.urlopen(req, timeout=30) as resp:
            return json.load(resp)


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
        q = f"{district}, {province}, Turkey"
        print(f"[{idx+1}/{total}] querying: {q}")
        try:
            res = geocode_query(q)
            if res and res.get('results'):
                r = res['results'][0]
                cache[key] = {
                    'latitude': r.get('latitude'),
                    'longitude': r.get('longitude'),
                    'name': r.get('name'),
                    'admin1': r.get('admin1'),
                    'country': r.get('country')
                }
                print(f" -> {cache[key]['latitude']},{cache[key]['longitude']} ({r.get('name')})")
            else:
                cache[key] = {'latitude': None, 'longitude': None}
                print(" -> no result")
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
