import json
import math
import unittest
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "il-ilce-with-loc.json"
INDEX_PATH = ROOT / "index.html"
SERVICE_WORKER_PATH = ROOT / "service-worker.js"
VERCEL_PATH = ROOT / "vercel.json"


def distance_km(lat1, lon1, lat2, lon2):
    radius = 6371
    lat_delta = math.radians(lat2 - lat1)
    lon_delta = math.radians(lon2 - lon1)
    value = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(lon_delta / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


class CoordinateQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        cls.rows = []
        for province in payload["data"]:
            for district in province["ilceler"]:
                cls.rows.append(
                    {
                        "province": province["il_adi"],
                        "district": district["ilce_adi"],
                        "latitude": float(district["latitude"]),
                        "longitude": float(district["longitude"]),
                    }
                )

    def test_expected_record_count(self):
        self.assertEqual(len(self.rows), 973)

    def test_all_coordinates_are_inside_turkey_bounds(self):
        invalid = [
            row
            for row in self.rows
            if not (35 <= row["latitude"] <= 43 and 25 <= row["longitude"] <= 45)
        ]
        self.assertEqual(invalid, [])

    def test_coordinates_are_not_shared_across_provinces(self):
        groups = defaultdict(list)
        for row in self.rows:
            groups[(row["latitude"], row["longitude"])].append(row)
        invalid = [
            rows
            for rows in groups.values()
            if len({row["province"] for row in rows}) > 1
        ]
        self.assertEqual(invalid, [])

    def test_districts_are_close_to_their_province_cluster(self):
        by_province = defaultdict(list)
        for row in self.rows:
            by_province[row["province"]].append(row)

        invalid = []
        for province, rows in by_province.items():
            latitudes = sorted(row["latitude"] for row in rows)
            longitudes = sorted(row["longitude"] for row in rows)
            middle = len(rows) // 2
            center = (latitudes[middle], longitudes[middle])
            for row in rows:
                distance = distance_km(
                    center[0], center[1], row["latitude"], row["longitude"]
                )
                if distance > 220:
                    invalid.append((province, row["district"], round(distance)))

        self.assertEqual(invalid, [])


class StaticQualityTests(unittest.TestCase):
    def test_vercel_applies_production_security_headers(self):
        config = json.loads(VERCEL_PATH.read_text(encoding="utf-8"))
        rules = {rule["source"]: rule["headers"] for rule in config["headers"]}
        headers = {item["key"].lower(): item["value"] for item in rules["/(.*)"]}

        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertEqual(headers["x-frame-options"], "DENY")
        self.assertEqual(headers["referrer-policy"], "no-referrer")
        self.assertEqual(
            headers["permissions-policy"],
            "camera=(), microphone=(), geolocation=(self)",
        )
        self.assertIn("frame-ancestors 'none'", headers["content-security-policy"])
        self.assertIn("https://api.open-meteo.com", headers["content-security-policy"])

        worker_headers = {
            item["key"].lower(): item["value"]
            for item in rules["/service-worker.js"]
        }
        self.assertEqual(
            worker_headers["cache-control"],
            "public, max-age=0, must-revalidate",
        )

    def test_social_preview_uses_a_supported_raster_image(self):
        index = INDEX_PATH.read_text(encoding="utf-8")
        preview = "docs/social-preview.jpg"
        self.assertEqual(index.count(preview), 2)
        self.assertTrue((ROOT / preview).is_file())

    def test_service_worker_does_not_mask_stale_weather_as_live_data(self):
        service_worker = SERVICE_WORKER_PATH.read_text(encoding="utf-8")
        self.assertNotIn("api.open-meteo.com", service_worker)
        self.assertNotIn("air-quality-api.open-meteo.com", service_worker)
        self.assertIn("key.startsWith(CACHE_PREFIX)", service_worker)

    def test_versioned_assets_match_service_worker_shell(self):
        index = INDEX_PATH.read_text(encoding="utf-8")
        service_worker = SERVICE_WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("style.css?v=20260825-1", index)
        self.assertIn("app.js?v=20260825-1", index)
        self.assertIn("style.css?v=20260825-1", service_worker)
        self.assertIn("app.js?v=20260825-1", service_worker)
        self.assertIn("js/weather-alerts.js", service_worker)

    def test_theme_is_initialized_before_the_stylesheet_loads(self):
        index = INDEX_PATH.read_text(encoding="utf-8")
        bootstrap = 'js/theme-init.js?v=20260825-1'
        stylesheet = 'style.css?v=20260825-1'
        self.assertIn(bootstrap, index)
        self.assertIn(bootstrap, SERVICE_WORKER_PATH.read_text(encoding="utf-8"))
        self.assertLess(index.index(bootstrap), index.index(stylesheet))

    def test_service_worker_waits_for_user_requested_updates(self):
        service_worker = SERVICE_WORKER_PATH.read_text(encoding="utf-8")
        self.assertIn("event.data?.type === 'SKIP_WAITING'", service_worker)
        install_start = service_worker.index("self.addEventListener('install'")
        install_end = service_worker.index("});", install_start)
        self.assertNotIn("skipWaiting", service_worker[install_start:install_end])

if __name__ == "__main__":
    unittest.main()
