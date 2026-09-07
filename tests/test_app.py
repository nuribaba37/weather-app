import json
import os
import time
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("APP_BASE_URL", "http://127.0.0.1:8000")
HOURLY_TIMES = [
    f"2026-06-{day:02d}T{hour:02d}:00"
    for day in range(15, 22)
    for hour in range(24)
]
HOURLY_HOURS = [hour for _day in range(15, 22) for hour in range(24)]


WEATHER_FIXTURE = {
    "latitude": 39.6609,
    "longitude": 27.8849,
    "timezone": "Europe/Istanbul",
    "timezone_abbreviation": "GMT+3",
    "current": {
        "time": "2026-06-15T10:00",
        "temperature_2m": 24.4,
        "relative_humidity_2m": 48,
        "apparent_temperature": 25.1,
        "is_day": 1,
        "precipitation": 0,
        "rain": 0,
        "weather_code": 1,
        "cloud_cover": 22,
        "wind_speed_10m": 11.2,
        "wind_direction_10m": 240,
        "wind_gusts_10m": 18.5,
    },
    "hourly": {
        "time": HOURLY_TIMES,
        "temperature_2m": [18 + hour * 0.4 for hour in HOURLY_HOURS],
        "apparent_temperature": [18 + hour * 0.4 for hour in HOURLY_HOURS],
        "precipitation_probability": [10] * len(HOURLY_TIMES),
        "precipitation": [0] * len(HOURLY_TIMES),
        "relative_humidity_2m": [55] * len(HOURLY_TIMES),
        "weather_code": [1] * len(HOURLY_TIMES),
        "is_day": [0 if hour < 6 or hour >= 20 else 1 for hour in HOURLY_HOURS],
        "wind_speed_10m": [10] * len(HOURLY_TIMES),
    },
    "daily": {
        "time": [f"2026-06-{day:02d}" for day in range(15, 22)],
        "weather_code": [1, 2, 3, 61, 0, 45, 80],
        "temperature_2m_max": [29, 30, 27, 24, 31, 28, 26],
        "temperature_2m_min": [17, 18, 16, 15, 19, 18, 17],
        "precipitation_probability_max": [0, 10, 20, 80, 0, 15, 45],
        "sunrise": [f"2026-06-{day:02d}T05:39" for day in range(15, 22)],
        "sunset": [f"2026-06-{day:02d}T20:36" for day in range(15, 22)],
        "uv_index_max": [7.2, 7.5, 6.4, 4.1, 7.8, 6.9, 5.2],
        "wind_speed_10m_max": [18, 20, 22, 25, 15, 17, 23],
    },
}

AIR_FIXTURE = {
    "current": {
        "time": "2026-06-15T10:00",
        "european_aqi": 28,
        "pm10": 15,
        "pm2_5": 7,
        "uv_index": 0.8,
    }
}

IP_FIXTURE = {
    "success": True,
    "country_code": "TR",
    "latitude": 41.01,
    "longitude": 28.97,
    "city": "İstanbul",
    "region": "İstanbul",
    "country": "Türkiye",
}

REVERSE_FIXTURE = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "properties": {
            "district": "Barbaros Hayrettin Paşa",
            "city": "Gaziosmanpaşa",
            "state": "İstanbul",
            "country": "Türkiye",
            "countrycode": "TR",
        },
        "geometry": {"type": "Point", "coordinates": [28.889662, 41.071662]},
    }],
}

FOREIGN_REVERSE_FIXTURE = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "properties": {
            "country": "Greece",
            "countrycode": "GR",
        },
        "geometry": {"type": "Point", "coordinates": [26.978, 37.754]},
    }],
}

FOREIGN_IP_FIXTURE = {
    "success": True,
    "country_code": "GR",
    "latitude": 37.754,
    "longitude": 26.978,
    "city": "Samos",
    "region": "North Aegean",
    "country": "Greece",
}


class WeatherAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.ip_requests = []
        self.reverse_requests = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("request", self._capture_request)
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.page.route("https://photon.komoot.io/**", self._reverse_route)

    def tearDown(self):
        self.context.close()

    def _capture_request(self, request):
        if "api.open-meteo.com/v1/forecast" in request.url:
            self.forecast_queries.append(parse_qs(urlparse(request.url).query))
        if "air-quality-api.open-meteo.com/v1/air-quality" in request.url:
            self.air_queries.append(parse_qs(urlparse(request.url).query))
        if "ipwho.is" in request.url:
            self.ip_requests.append(request.url)
        if "photon.komoot.io" in request.url:
            self.reverse_requests.append(request.url)

    @staticmethod
    def _weather_route(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps(WEATHER_FIXTURE))

    @staticmethod
    def _air_route(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps(AIR_FIXTURE))

    @staticmethod
    def _reverse_route(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps(REVERSE_FIXTURE))

    @staticmethod
    def _delayed_district_route(route):
        time.sleep(0.5)
        route.continue_()

    def open_app(self):
        self.page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        self.page.wait_for_selector("#cityInput")

    def search(self, query):
        self.page.fill("#cityInput", query)
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector(".current-card", timeout=15000)

    def test_local_search_uses_repaired_coordinates_and_renders_details(self):
        self.open_app()
        self.page.fill("#cityInput", "Karesi")
        self.page.wait_for_selector("#suggestions .suggestion-item")
        self.assertGreaterEqual(self.page.locator("#suggestions .match").count(), 1)
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector(".current-card", timeout=15000)

        self.assertTrue(self.forecast_queries)
        query = self.forecast_queries[-1]
        self.assertEqual(query["latitude"][0], "39.6609")
        self.assertEqual(query["longitude"][0], "27.8849")
        self.assertEqual(query["forecast_days"][0], "7")
        self.assertIn("is_day", query["hourly"][0])
        self.assertIn("precipitation", query["hourly"][0])
        self.assertIn("uv_index", self.air_queries[-1]["current"][0])
        self.assertIn("Karesi / Balıkesir", self.page.locator(".current-location h2").inner_text())
        self.assertEqual(self.page.locator(".metric-card").count(), 9)
        uv_card = self.page.locator(".metric-card").filter(has_text="UV indeksi")
        self.assertIn("0,8", uv_card.inner_text())
        self.assertIn("Günlük en yüksek: 7,2", uv_card.inner_text())
        self.assertEqual(self.page.locator(".day-card").count(), 7)
        self.assertEqual(self.page.locator(".chart-legend span").count(), 2)
        self.assertEqual(
            self.page.locator(".forecast-section").nth(1).locator(".eyebrow").text_content(),
            "7 gün",
        )
        self.assertEqual(self.page.locator(".hour-card").count(), 24)
        self.assertEqual(self.page.locator(".day-card").first.get_attribute("aria-pressed"), "true")
        self.page.locator(".day-card").nth(1).click()
        self.assertEqual(self.page.locator(".day-card").nth(1).get_attribute("aria-pressed"), "true")
        self.assertEqual(self.page.locator(".day-card").first.get_attribute("aria-pressed"), "false")
        self.assertEqual(self.page.locator(".hour-card").count(), 24)
        self.assertIn("16", self.page.locator("#hourlyChart").get_attribute("aria-label"))
        self.assertEqual(self.page.locator("#suggestions .suggestion-item").count(), 0)
        self.assertEqual(self.page_errors, [])

    def test_sample_location_shortcut_is_not_present(self):
        self.open_app()
        self.assertEqual(self.page.locator("#sampleLocationBtn").count(), 0)
        self.assertNotIn("Örnek: Kadıköy", self.page.locator("body").inner_text())
        self.assertEqual(self.page_errors, [])

    def test_early_search_waits_for_the_local_district_index(self):
        self.page.route("**/data/il-ilce-with-loc.json", self._delayed_district_route)
        self.page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
        self.page.wait_for_selector("#cityInput")
        self.page.fill("#cityInput", "Karesi")
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector(".current-card", timeout=15000)

        self.assertTrue(self.forecast_queries)
        query = self.forecast_queries[-1]
        self.assertEqual(query["latitude"][0], "39.6609")
        self.assertEqual(query["longitude"][0], "27.8849")
        self.assertEqual(self.page_errors, [])

    def test_data_provenance_and_forecast_alerts_are_explicit(self):
        self.open_app()
        self.search("Karesi")

        metadata = self.page.locator(".forecast-meta").inner_text()
        self.assertIn("Canlı veri", metadata)
        self.assertIn("Open-Meteo", metadata)
        self.assertIn("39,6609", metadata)
        self.assertIn("Tahmin zamanı", metadata)
        alerts_panel = self.page.locator(".alerts-panel")
        alerts_panel.scroll_into_view_if_needed()
        self.assertIn("Yüksek UV", alerts_panel.inner_text())
        self.assertIn("resmî uyarı değildir", self.page.locator(".alerts-disclaimer").inner_text())
        self.assertEqual(self.page.locator(".plan-card").count(), 3)
        self.page.locator(".air-details").scroll_into_view_if_needed()
        self.assertIn("PM2.5", self.page.locator(".air-details").inner_text())
        self.assertEqual(self.page.locator("#hourlyTableBody tr").count(), 24)
        self.assertIn(
            "mgm.gov.tr/meteouyari",
            self.page.locator(".alerts-disclaimer a").get_attribute("href"),
        )
        self.assertEqual(self.page_errors, [])

    def test_saved_locations_can_be_compared_on_demand(self):
        self.page.add_init_script("""
            localStorage.setItem('weather_saved_v1', JSON.stringify([
              {
                id: 'karesi|balikesir', name: 'Karesi', admin1: 'Balikesir',
                label: 'Karesi / Balikesir', latitude: 39.6609, longitude: 27.8849
              },
              {
                id: 'kadikoy|istanbul', name: 'Kadikoy', admin1: 'Istanbul',
                label: 'Kadikoy / Istanbul', latitude: 40.9917, longitude: 29.0277
              }
            ]));
        """)
        self.open_app()
        self.page.click("#compareSavedBtn")
        self.page.wait_for_selector("#comparisonResults:not([hidden])")
        self.assertEqual(self.page.locator(".comparison-card").count(), 2)
        self.assertEqual(self.page_errors, [])

    def test_saved_location_can_be_default_and_loads_after_reload(self):
        self.open_app()
        self.search("Karesi")

        self.page.click("#saveCurrentBtn")
        self.assertEqual(self.page.locator("[data-saved-id]").count(), 1)
        self.assertIn("Karesi", self.page.locator("[data-saved-id]").inner_text())
        self.page.click("[data-default-id]")
        self.assertEqual(
            self.page.locator("[data-default-id]").get_attribute("aria-pressed"),
            "true",
        )

        requests_before_reload = len(self.forecast_queries)
        self.page.reload(wait_until="networkidle", timeout=30000)
        self.page.wait_for_selector(".current-card", timeout=15000)
        self.assertGreater(len(self.forecast_queries), requests_before_reload)
        self.assertIn("Karesi / Balıkesir", self.page.locator(".current-location h2").inner_text())
        self.assertEqual(self.page.locator(".weather-actions").count(), 0)
        self.assertEqual(self.page_errors, [])

    def test_last_location_is_remembered_and_restored_after_reload(self):
        self.open_app()
        self.search("Karesi")

        stored = self.page.evaluate("JSON.parse(localStorage.getItem('weather_last_location_v1'))")
        self.assertEqual(stored["id"], "karesi|balikesir")

        requests_before_reload = len(self.forecast_queries)
        self.page.reload(wait_until="networkidle", timeout=30000)
        self.page.wait_for_selector(".current-card", timeout=15000)

        self.assertIn("Karesi / Balıkesir", self.page.locator(".current-location h2").inner_text())
        self.assertGreater(len(self.forecast_queries), requests_before_reload)
        self.assertEqual(self.page_errors, [])

    def test_install_prompt_shows_dismissible_install_card(self):
        self.open_app()
        self.page.evaluate("""
            () => {
              const event = new Event('beforeinstallprompt', { cancelable: true });
              event.prompt = () => Promise.resolve();
              event.userChoice = Promise.resolve({ outcome: 'dismissed' });
              window.dispatchEvent(event);
            }
        """)
        self.page.wait_for_selector("#installCard:not([hidden])")
        self.assertTrue(self.page.locator("#installBtn").is_visible())

        self.page.click("#installDismissBtn")
        self.assertTrue(self.page.locator("#installCard").is_hidden())
        self.assertTrue(self.page.evaluate("""
            JSON.parse(localStorage.getItem('weather_settings_v2')).installHintDismissed
        """))
        self.assertEqual(self.page_errors, [])

    def test_turkish_title_case_handles_non_ascii_initials(self):
        self.open_app()
        result = self.page.evaluate("""
            async () => {
              const utils = await import('./js/utils.js');
              const search = await import('./js/search.js');
              const instant = '2026-06-15T12:34:00Z';
              const expected = new Intl.DateTimeFormat('tr-TR', {
                dateStyle: 'short', timeStyle: 'short'
              }).format(new Date(instant));
              return {
                title: utils.titleCase('çANKAYA / şİŞLİ', 'tr'),
                localTimeIsCorrect: utils.formatLocalTime(instant, 'tr') === expected,
                englishPercent: utils.formatPercentage(10, 'en'),
                centralDistrict: search.findDistrictByAddress({
                  city: 'Kastamonu', state: 'Kastamonu'
                }, 'tr')?.label,
              };
            }
        """)
        self.assertEqual(result["title"], "Çankaya / Şişli")
        self.assertTrue(result["localTimeIsCorrect"])
        self.assertEqual(result["englishPercent"], "10%")
        self.assertEqual(result["centralDistrict"], "Merkez / Kastamonu")

    def test_invalid_local_storage_falls_back_to_safe_defaults(self):
        self.page.add_init_script("""
            localStorage.setItem('weather_settings_v2', JSON.stringify({
              unit: 'Kelvin', language: 'xx', theme: 'neon'
            }));
            localStorage.setItem('weather_recent_v2', JSON.stringify({broken: true}));
            localStorage.setItem('weather_saved_v1', JSON.stringify([{broken: true}]));
            localStorage.setItem('weather_cache_v2', JSON.stringify([]));
            localStorage.setItem('weather_latest_v2', JSON.stringify({
              savedAt: '2026-06-15T10:00:00Z', payload: {broken: true}
            }));
        """)
        self.open_app()
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "tr")
        self.assertEqual(self.page.locator("#unitCBtn").get_attribute("aria-checked"), "true")
        self.assertTrue(self.page.locator("#recentSection").is_hidden())
        self.assertTrue(self.page.evaluate("""
            async () => (await import('./js/storage.js')).getLatestWeatherCache() === null
        """))
        self.assertEqual(self.page_errors, [])

    def test_ambiguous_district_name_requires_province_selection(self):
        self.open_app()
        self.page.fill("#cityInput", "Merkez")
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector("#suggestions .suggestion-item")
        self.assertEqual(self.page.locator("#suggestions .suggestion-item").count(), 7)
        self.assertIn("birden fazla ilde", self.page.locator("#notice").inner_text())
        self.assertEqual(self.forecast_queries, [])
        self.assertEqual(self.page.locator(".current-card").count(), 0)
        self.assertEqual(self.page_errors, [])

    def test_unit_language_and_theme_controls(self):
        self.open_app()
        self.search("Karesi")
        self.page.focus("#unitCBtn")
        self.page.press("#unitCBtn", "ArrowRight")
        self.assertIn("°F", self.page.locator(".temperature-block strong").inner_text())
        self.assertEqual(self.page.locator("#unitFBtn").get_attribute("aria-checked"), "true")

        self.page.click("#languageBtn")
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "en")
        self.assertEqual(self.page.locator("#searchBtn").inner_text(), "Search")
        self.assertEqual(self.page.locator("#languageBtn").get_attribute("aria-label"), "Türkçe")

        old_theme = self.page.locator("html").get_attribute("data-theme")
        self.page.click("#themeBtn")
        self.assertNotEqual(self.page.locator("html").get_attribute("data-theme"), old_theme)
        self.assertEqual(self.page_errors, [])

    def test_geolocation_denial_requires_consent_before_ip_lookup(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.ip_requests = []
        self.page.on("request", self._capture_request)
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: { getCurrentPosition: (success, error) => error({ code: 1, PERMISSION_DENIED: 1 }) }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.wait_for_selector("#notice:not([hidden])")
        self.assertEqual(self.ip_requests, [])
        self.page.get_by_role("button", name="IP ile yaklaşık konumu bul").click()
        self.assertTrue(self.page.locator("#ipDialog").evaluate("element => element.open"))
        self.assertEqual(self.ip_requests, [])

    def test_location_outside_turkey_is_not_mapped_to_a_turkish_district(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.ip_requests = []
        self.page.on("request", self._capture_request)
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: {
                getCurrentPosition: success => success({
                  coords: { latitude: 52.52, longitude: 13.405 }
                })
              }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.wait_for_selector("#notice.warning:not([hidden])")
        self.assertIn("yalnızca Türkiye", self.page.locator("#notice").inner_text())
        self.assertEqual(self.forecast_queries, [])
        self.assertTrue(self.page.locator("#locationBtn").is_enabled())
        self.assertEqual(self.page_errors, [])

    def test_gps_uses_reverse_geocoded_district_and_exact_coordinates(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.ip_requests = []
        self.reverse_requests = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("request", self._capture_request)
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.page.route("https://photon.komoot.io/**", self._reverse_route)
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: {
                getCurrentPosition: success => success({
                  coords: { latitude: 41.071662, longitude: 28.889662 }
                })
              }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.wait_for_selector(".current-card", timeout=15000)
        self.assertIn(
            "Gaziosmanpaşa / İstanbul",
            self.page.locator(".current-location h2").inner_text(),
        )
        self.assertEqual(len(self.reverse_requests), 1)
        query = self.forecast_queries[-1]
        self.assertEqual(query["latitude"][0], "41.071662")
        self.assertEqual(query["longitude"][0], "28.889662")
        self.assertTrue(self.page.locator("#locationBtn").is_enabled())
        self.assertEqual(self.page_errors, [])

    def test_border_region_gps_outside_turkey_is_not_mapped_to_a_turkish_district(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.reverse_requests = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("request", self._capture_request)
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.page.route(
            "https://photon.komoot.io/**",
            lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(FOREIGN_REVERSE_FIXTURE),
            ),
        )
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: {
                getCurrentPosition: success => success({
                  coords: { latitude: 37.754, longitude: 26.978 }
                })
              }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.wait_for_selector("#notice.warning:not([hidden])")
        self.assertIn("yalnızca Türkiye", self.page.locator("#notice").inner_text())
        self.assertEqual(len(self.reverse_requests), 1)
        self.assertEqual(self.forecast_queries, [])
        self.assertTrue(self.page.locator("#locationBtn").is_enabled())
        self.assertEqual(self.page_errors, [])

    def test_reverse_geocode_failure_does_not_map_a_border_region_to_turkey(self):
        self._assert_unverified_border_location_is_rejected(503, {})

    def test_empty_reverse_geocode_does_not_map_a_border_region_to_turkey(self):
        self._assert_unverified_border_location_is_rejected(200, {"features": []})

    def test_missing_country_does_not_map_a_border_region_to_turkey(self):
        self._assert_unverified_border_location_is_rejected(
            200, {"features": [{"properties": {"city": "Kuşadası"}}]}
        )

    def _assert_unverified_border_location_is_rejected(self, status, payload):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.reverse_requests = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("request", self._capture_request)
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.page.route(
            "https://photon.komoot.io/**",
            lambda route: route.fulfill(status=status, content_type="application/json", body=json.dumps(payload)),
        )
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: {
                getCurrentPosition: success => success({
                  coords: { latitude: 37.754, longitude: 26.978 }
                })
              }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.wait_for_selector("#notice.error:not([hidden])")
        self.assertEqual(len(self.reverse_requests), 1)
        self.assertEqual(self.forecast_queries, [])
        self.assertTrue(self.page.locator("#locationBtn").is_enabled())
        self.assertTrue(self.page.locator("#searchBtn").is_enabled())
        self.search("Karesi")
        self.assertTrue(self.forecast_queries)
        self.assertEqual(self.page_errors, [])

    def test_ip_location_stays_city_level_and_is_marked_approximate(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.ip_requests = []
        self.reverse_requests = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("request", self._capture_request)
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.page.route(
            "https://ipwho.is/**",
            lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(IP_FIXTURE),
            ),
        )
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: { getCurrentPosition: (success, error) => error({ code: 1, PERMISSION_DENIED: 1 }) }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.get_by_role("button", name="IP ile yaklaşık konumu bul").click()
        self.page.click("#allowIpBtn")
        self.page.wait_for_selector(".current-card", timeout=15000)
        self.assertEqual(self.page.locator(".current-location h2").inner_text(), "İstanbul")
        self.assertIn("YAKLAŞIK KONUM", self.page.locator(".status-badge").inner_text())
        self.assertEqual(len(self.ip_requests), 1)
        query = self.forecast_queries[-1]
        self.assertEqual(query["latitude"][0], "41.01")
        self.assertEqual(query["longitude"][0], "28.97")
        self.assertEqual(self.page_errors, [])

    def test_ip_location_outside_turkey_is_rejected_even_inside_the_coordinate_bounds(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR", service_workers="block")
        self.page = self.context.new_page()
        self.page_errors = []
        self.forecast_queries = []
        self.air_queries = []
        self.ip_requests = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("request", self._capture_request)
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.page.route(
            "https://ipwho.is/**",
            lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(FOREIGN_IP_FIXTURE),
            ),
        )
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'geolocation', {
              configurable: true,
              value: { getCurrentPosition: (success, error) => error({ code: 1, PERMISSION_DENIED: 1 }) }
            });
        """)
        self.open_app()
        self.page.click("#locationBtn")
        self.page.get_by_role("button", name="IP ile yaklaşık konumu bul").click()
        self.page.click("#allowIpBtn")
        self.page.wait_for_selector("#notice.error:not([hidden])")
        self.assertEqual(len(self.ip_requests), 1)
        self.assertEqual(self.forecast_queries, [])
        self.assertTrue(self.page.locator("#locationBtn").is_enabled())
        self.assertEqual(self.page_errors, [])

    def test_api_failure_is_a_real_error_with_retry(self):
        self.page.unroute("https://api.open-meteo.com/**")
        self.page.route(
            "https://api.open-meteo.com/**",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body='{"error": true}'
            ),
        )
        self.open_app()
        self.page.fill("#cityInput", "Karesi")
        self.page.press("#cityInput", "Enter")
        self.page.wait_for_selector("#retryBtn", timeout=15000)
        self.assertTrue(self.page.locator("#retryBtn").is_visible())

    def test_newer_request_keeps_control_when_an_older_request_is_aborted(self):
        self.page.add_init_script("""
            localStorage.setItem('weather_recent_v2', JSON.stringify([
              {
                id: 'karesi|balikesir', name: 'Karesi', admin1: 'Balıkesir',
                label: 'Karesi / Balıkesir', latitude: 39.6609, longitude: 27.8849
              },
              {
                id: 'kadikoy|istanbul', name: 'Kadıköy', admin1: 'İstanbul',
                label: 'Kadıköy / İstanbul', latitude: 40.9917, longitude: 29.0277
              }
            ]));
            const nativeFetch = window.fetch.bind(window);
            window.fetch = async (input, init = {}) => {
              const url = String(input);
              if (url.includes('api.open-meteo.com/v1/forecast') && url.includes('latitude=39.6609')) {
                await new Promise((resolve, reject) => {
                  const timer = setTimeout(resolve, 600);
                  init.signal?.addEventListener('abort', () => {
                    clearTimeout(timer);
                    reject(new DOMException('Aborted', 'AbortError'));
                  }, { once: true });
                });
              }
              return nativeFetch(input, init);
            };
        """)
        self.open_app()
        self.page.locator('[data-recent-id="karesi|balikesir"]').click()
        self.page.locator('[data-recent-id="kadikoy|istanbul"]').click()
        self.page.wait_for_selector(".current-card", timeout=15000)
        self.assertIn("Kadıköy / İstanbul", self.page.locator(".current-location h2").inner_text())
        self.assertTrue(self.page.locator("#searchBtn").is_enabled())
        self.assertEqual(self.page_errors, [])

    def test_weather_action_row_is_removed(self):
        self.open_app()
        self.search("Karesi")
        self.assertEqual(self.page.locator(".weather-actions").count(), 0)
        self.assertEqual(self.page.locator("#favoriteBtn").count(), 0)
        self.assertEqual(self.page.locator("#shareBtn").count(), 0)
        self.assertEqual(self.page.locator("#rainAlertBtn").count(), 0)

    def test_service_worker_reloads_app_shell_offline(self):
        self.context.close()
        self.context = self.browser.new_context(locale="tr-TR")
        self.page = self.context.new_page()
        self.page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        self.page.evaluate("navigator.serviceWorker.ready")
        self.page.reload(wait_until="networkidle", timeout=30000)
        self.assertTrue(self.page.evaluate("Boolean(navigator.serviceWorker.controller)"))
        self.context.set_offline(True)
        # Playwright 1.62 can block requests without updating navigator.onLine
        # in a service-worker-controlled page, so make the browser signal explicit.
        self.page.add_init_script("""
            Object.defineProperty(Navigator.prototype, 'onLine', {
              configurable: true,
              get: () => false,
            });
        """)
        self.page.reload(wait_until="domcontentloaded", timeout=30000)
        self.page.wait_for_selector("#offlineBanner:not([hidden])")
        self.assertTrue(self.page.locator("#cityInput").is_visible())

    def test_mobile_layout_has_no_horizontal_overflow(self):
        self.context.close()
        self.context = self.browser.new_context(
            viewport={"width": 390, "height": 844},
            locale="tr-TR",
            service_workers="block",
        )
        self.page = self.context.new_page()
        self.page.route("https://api.open-meteo.com/**", self._weather_route)
        self.page.route("https://air-quality-api.open-meteo.com/**", self._air_route)
        self.open_app()
        self.search("Kadikoy")
        dimensions = self.page.evaluate("({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth})")
        self.assertEqual(dimensions["scroll"], dimensions["client"])


if __name__ == "__main__":
    unittest.main()
