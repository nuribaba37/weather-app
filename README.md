# Türkiye Hava

<p align="center">
  <img src="docs/social-preview.png" alt="Türkiye Hava — il ve ilçeler için çevrimdışı PWA" width="1100">
</p>

<p align="center">
  <img src="docs/screenshots/kadikoy-forecast.jpg" alt="Kadıköy için canlı hava tahmini ekranı" width="900">
</p>

<p align="center">
  <a href="https://github.com/Nurettin-Erdogan/weather-app/actions/workflows/ci.yml"><img src="https://github.com/Nurettin-Erdogan/weather-app/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI durumu"></a>
  <a href="https://github.com/Nurettin-Erdogan/weather-app/actions/workflows/codeql.yml"><img src="https://github.com/Nurettin-Erdogan/weather-app/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL güvenlik analizi"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/lisans-MIT-0f766e.svg" alt="MIT Lisansı"></a>
  <a href="https://turkiye-hava-pwa.vercel.app"><img src="https://img.shields.io/badge/canl%C4%B1%20demo-Vercel-0f766e.svg" alt="Canlı demo"></a>
</p>

Türkiye'deki il ve ilçeler için anlık tahmin, 7 günlük görünüm, hava kalitesi ve günlük planlama önerileri sunan; kurulum gerektirmeyen, gizlilik odaklı bir Progressive Web App.

## Portföy özeti

| | |
| --- | --- |
| **Problem** | Türkiye'de ilçe düzeyinde hava verisini hızlı, anlaşılır ve gizlilik tercihlerine saygılı biçimde sunmak |
| **Çözüm** | API anahtarı gerektirmeyen, kurulabilir, çevrimdışı son tahmini açabilen ve 973 ilçeyi destekleyen PWA |
| **Zor mühendislik kararları** | Koordinat veri kalitesi, izinli konum akışları, bozuk önbellekten güvenli dönüş ve erişilebilir etkileşimler |
| **Doğrulama** | Playwright tarayıcı senaryoları, veri doğrulama kontrolleri ve güvenlik başlıklı canlı Vercel dağıtımı |

Bu proje; dış API entegrasyonu, veri doğrulama, PWA yaşam döngüsü, erişilebilirlik ve gizliliği birlikte ele alan üretim odaklı bir ön yüz geliştirebildiğimi gösterir.

## English

**Türkiye Hava** is a privacy-minded Progressive Web App for Turkish provinces and districts: Open-Meteo forecasts, installable offline shell, no API keys. Live demo: [turkiye-hava-pwa.vercel.app](https://turkiye-hava-pwa.vercel.app).

<p align="center">
  <a href="https://turkiye-hava-pwa.vercel.app"><strong>Canlı demoyu aç →</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/demo-guide.md"><strong>3 dakikalık demo</strong></a>
  &nbsp;·&nbsp;
  <a href="#testler">Testler</a>
  &nbsp;·&nbsp;
  <a href="#veri-ve-gizlilik">Gizlilik</a>
</p>

## Teknolojiler

- Vanilla JavaScript ve ES modülleri
- HTML/CSS, responsive ve erişilebilir arayüz
- Open-Meteo Forecast + Air Quality API
- OpenStreetMap tabanlı Photon ters konum çözümlemesi
- Service Worker, Web App Manifest ve `localStorage`
- Playwright tabanlı uçtan uca testler

## Öne çıkan özellikler

- 973 ilçe için doğrulanmış yerel koordinat verisi
- Türkçe karakterleri destekleyen hızlı il/ilçe araması
- Anlık sıcaklık ve hissedilen sıcaklık
- Nem, yağış, bulutluluk, rüzgâr yönü ve rüzgâr hamlesi
- Avrupa Hava Kalitesi İndeksi, anlık UV, günlük maksimum UV, gün doğumu ve gün batımı
- 24 saatlik sıcaklık/yağış grafiği ve saatlik kartlar
- Gün seçimiyle birlikte güncellenen saatlik grafik ve kartlar
- 7 günlük tahmin; günlük kartlarda yağış, rüzgâr ve UV özeti
- Celsius/Fahrenheit seçimi
- Klavye ok tuşlarıyla kullanılabilen erişilebilir sıcaklık birimi seçimi
- Son aramaları ve son açılan konumu cihazda saklama; açılışta hızlı geri yükleme
- En fazla sekiz kayıtlı konum, varsayılan konum seçimi ve açılışta otomatik yükleme
- Hava kaynağı, alınma zamanı, tahmin zamanı ve kullanılan koordinatı gösteren veri bilgisi
- Fırtına, kuvvetli yağış, kar, rüzgâr, sıcaklık, don, UV ve hava kalitesi için 24 saatlik otomatik risk özeti
- Otomatik risk özetini resmî uyarıdan ayıran açıklama ve MGM uyarı bağlantısı
- Açık/koyu tema ve Türkçe/İngilizce arayüz
- GPS konumu ve açık onaylı yaklaşık IP konumu
- GPS konumunu idari ilçe adına eşleyen OpenStreetMap ters konum çözümleme
- Ters konum doğrulamasıyla Türkiye dışındaki GPS konumlarını güvenle reddetme
- Açıklamalı PWA kurulum kartı ve çevrimdışı son tahmini tek tıkla açma
- Açık sekmede, bağlantı geri geldiğinde ve uygulamaya dönüldüğünde sessiz otomatik yenileme
- Mobil ve masaüstü erişilebilir arayüz
- Yağış, rüzgâr ve UV tercihlerini kullanan kişisel uyarı eşikleri
- Önümüzdeki 24 saat için dışarı planı, şemsiye ve hava kalitesi önerileri
- Kayıtlı konumları isteğe bağlı, tek ekranda karşılaştırma
- PM2.5 ve PM10 değerlerini içeren hava kalitesi ayrıntıları
- Canvas grafiğine ek olarak açılabilir erişilebilir saatlik veri tablosu
- Zorla yenilemek yerine kullanıcının onayıyla etkinleşen PWA güncellemesi
- İlk açılışı hafifleten geç tema önleme, lazy grafik yükleme ve skeleton yükleme durumu

## Veri ve gizlilik

- GPS konumu yalnızca kullanıcı butona bastığında tarayıcıdan istenir; koordinat hava verisi için Open-Meteo'ya, ilçe adını belirlemek için OpenStreetMap tabanlı Photon'a gönderilir.
- Yerel listede bulunamayan arama metni eşleştirme için Open-Meteo geocoding servisine gönderilir.
- Konum izni reddedildiğinde IP servisi otomatik çağrılmaz.
- Yaklaşık IP konumu için kullanıcıdan ayrıca açık onay alınır ve yalnızca `ipwho.is` kullanılır.
- Tercihler, kayıtlı konumlar, son aramalar ve son tahmin cihazdaki `localStorage` içinde tutulur.
- Projede API anahtarı veya kullanıcı hesabı yoktur.
- Uygulama üçüncü taraf isteklere sayfa adresini referrer olarak göndermez.

## Yerel Çalıştırma

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Ardından `http://127.0.0.1:8000` adresini açın. Windows'ta `launch-local.bat` dosyası sunucuyu ve tarayıcıyı otomatik açar.

`file://` üzerinden doğrudan açmayın; ES modülleri ve service worker için HTTP gerekir.

### Vercel üretim dağıtımı

Canlı vitrin: [https://turkiye-hava-pwa.vercel.app](https://turkiye-hava-pwa.vercel.app)

Kök dizindeki `vercel.json`, statik PWA'yı ek bir build adımı olmadan yayınlar ve
CSP, clickjacking, MIME sniffing, referrer ile tarayıcı yetki başlıklarını HTTP
katmanında uygular. Service worker dosyası yeni sürümlerin zamanında bulunabilmesi
için yeniden doğrulanan bir cache politikasıyla sunulur.

GitHub Pages dağıtımı yedek ayna olarak çalışmayı sürdürür.

## Testler

```bash
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python -m unittest discover -s tests -p "test_*.py" -v
```

Test paketi şunları zorunlu kılar:

- 973 koordinatın Türkiye sınırları içinde olması
- İller arasında yanlış ortak koordinat bulunmaması
- Şüpheli ilçe/il küme sapmalarının bulunmaması
- Doğru Karesi koordinatının API'ye gönderilmesi
- Arama, birim, dil, tema, erişilebilir günlük seçim ve mobil görünüm
- API hata/yeniden deneme akışı
- IP servisine kullanıcı onayı olmadan istek gönderilmemesi
- Türkiye dışındaki GPS konumlarının reddedilmesi
- Aynı isimli ilçelerde il seçimi zorunluluğu
- Bozuk yerel depolama verisinde güvenli varsayılanlara dönülmesi
- Bozuk veya Türkiye dışı çevrimdışı hava önbelleğinin reddedilmesi
- PWA önbellek sürümü ile HTML varlık sürümlerinin eşleşmesi
- Veri kaynağı ve güncellik bilgilerinin görünür olması
- Kayıtlı ve varsayılan konumun yeniden açılışta doğru yüklenmesi
- Son açılan konumun yeniden açılışta geri yüklenmesi
- Kurulum kartının görünüp kapatılabilmesi
- Otomatik hava riski özetinin resmî uyarı olmadığını açıkça belirtmesi

## Veri Bakımı

Koordinatları güvenilir tam eşleşmelerle denetlemek ve düzeltmek:

```bash
python scripts/repair_coordinates.py
python scripts/repair_coordinates.py --apply
```

Betik bulanık eşleşme kullanmaz. Dört dış kaynak istisnası kodda açıkça kayıtlıdır.

## Release Üretimi

```bash
python scripts/build_release.py
```

Çıktılar:

```text
dist/weather-app/
dist/weather-app-release.zip
```

Üretici betik eksik dosya, ilçe sayısı ve Türkiye koordinat sınırı kontrollerini paketlemeden önce çalıştırır.

## Proje Yapısı

```text
weather-app/
├── index.html
├── style.css
├── app.js
├── service-worker.js
├── manifest.webmanifest
├── CHANGELOG.md
├── js/
│   ├── api.js
│   ├── chart.js
│   ├── i18n.js
│   ├── search.js
│   ├── storage.js
│   ├── theme-init.js
│   ├── utils.js
│   ├── weather-alerts.js
│   └── weather-codes.js
├── data/il-ilce-with-loc.json
├── docs/screenshots/kadikoy-forecast.jpg
├── icons/
├── scripts/
└── tests/
```

## Veri Kaynakları

- Tahmin ve geocoding: Open-Meteo
- Hava kalitesi: Open-Meteo Air Quality API
- GPS ters konum çözümleme: OpenStreetMap tabanlı Photon
- Yerel koordinat temel kaynağı: BuNick Turkey Cities & Districts

## Lisans

Proje kaynak kodu [MIT Lisansı](LICENSE) ile lisanslanmıştır. `data/` içeriği ve kullanılan üçüncü taraf servisler kendi sağlayıcılarının koşullarına tabidir.
