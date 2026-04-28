# Hava Durumu Uygulaması

Basit, istemci tarafı hava durumu uygulaması — Open-Meteo API kullanır.

## Özellikler
- Şehir arama ile anlık hava durumu
- Nem, rüzgar, açıklama gösterimi
- İkon ve arka plan hava durumuna göre değişir
- 5 günlük tahmin ve sonraki 24 saatlik saatlik tahmin
- Konuma göre otomatik hava durumu (tarayıcı konum izni ile)
- Son aramalar localStorage'ta saklanır
- Saatler yerel, okunabilir formata çevrildi
- Yükleme esnasında spinner ve butonları devre dışı bırakma

## Nasıl çalıştırılır
1. Depoyu yerel olarak açın veya `index.html` dosyasını tarayıcıda açın.
2. Konum izni verirseniz, varsayılan olarak bulunduğunuz konumun hava durumu yüklenir.
3. Arama kutusuna şehir adı yazıp `Ara` butonuna basın veya Enter tuşuna basın.

## Konum İzinleri

- Uygulamada sağ üstteki "Konumumu Kullan" butonuna basarak tarayıcınızdan konum izni istenebilir. Eğer izin verirseniz, bulunduğunuz konuma göre hava durumu otomatik yüklenir.
- Eğer konum isteği görünmüyor veya daha önce engellediyseniz, tarayıcıda site izinlerinden `localhost` için Konum (Location) iznini açmanız gerekir. Örnek adımlar:
	- Chrome / Edge: adres çubuğundaki kilit simgesine tıklayın → Site ayarları → Konum → `Allow` (İzin ver).
	- Firefox: adres çubuğundaki kilit → Permissions → Location → `Allow` veya Options → Privacy & Security → Permissions → Location → Settings… üzerinden `localhost` girdisini düzenleyin.
	- Safari (macOS): Safari → Settings for This Website → Location → `Allow` veya Sistem Tercihleri → Güvenlik & Gizlilik → Konum Servisleri.
- `file://` ile açılan sayfalarda tarayıcılar genellikle `fetch` ve geolocation erişimini kısıtlayabilir; bu yüzden yerel sunucu kullanmanız önerilir (bkz. "Tek komutla").

## IP tabanlı fallback

Eğer kullanıcı tarayıcı konum iznini reddederse uygulama otomatik olarak IP tabanlı yaklaşık bir konum deneyecektir (ör. ipapi). Bu, kesin koordinat vermez fakat bulunduğunuz şehre yakın tahmini bir konum sağlar ve hava verilerini getirmeye yarar. Eğer IP tabanlı konum da alınamazsa, manuel arama yapmanız gerekecektir.

### Tek komutla (lokal sunucu)
Konsolda proje klasöründe aşağıdaki komutlardan birini çalıştırın, sonra tarayıcıda `http://localhost:8000` açın:

Windows (CMD / PowerShell):
```
run-local.bat
``` 

macOS / Linux:
```
./run-local.sh
```

Alternatif olarak doğrudan:
```
python -m http.server 8000
# veya
python3 -m http.server 8000
```

## API
Bu proje `https://open-meteo.com` üzerinden ücretsiz API uç noktalarını kullanır (geocoding ve forecast).

## Geliştirme önerileri
- İkonları emoji yerine SVG'lerle değiştir (daha tutarlı görsel).
- Birim dönüşümleri (°C / °F) ekle.
- Tema (dark/light) geçişi ekle.
- Basit testler ve CI entegrasyonu ekle.
 
## Yapılan küçük erişilebilirlik düzeltmeleri (hızlı)
- `result` konteynerine `aria-live="polite"` ve `aria-atomic="true"` eklendi: ekran okuyucular için anlık içerik güncellemeleri bildirilecek.
- Arama önerileri için klavye navigasyonu zaten destekleniyor; sonraki adım `role="combobox"` ve uygun `aria-controls`/`aria-expanded` eklemek olabilir.

## Yeni eklenen küçük özellikler
- Sayfaya `°C / °F` birim geçişi eklendi: sağ üstteki butonlarla birim değiştirilebilir, tercih `localStorage`'a kaydedilir.
- Sıcaklık gösterimleri birim değişimine göre yeniden render edilir (fetch tekrarına gerek yok).

## Lisans
Kişisel kullanım ve eğitim amaçlı.

## Offline İlçe Verisi (data/il-ilce.json)

Bu proje artık Türkiye'nin il/ilçe listesini içeren bir JSON dosyası içerir: `data/il-ilce.json`.
Dosya kaynağı (orijinal ham liste): https://github.com/snrylmz/il-ilce-json

Nasıl kullanılır
- `app.js` önce yerel `./data/il-ilce.json` dosyasını yüklemeye çalışır; dosya yoksa uzak raw URL'e geri döner.
- Tarayıcıda `index.html`'i doğrudan `file://` ile açmak yerine basit bir yerel sunucu kullanın (aksi halde `fetch` yerel dosyaya erişemeyebilir):

```bash
python -m http.server 8000
# sonra tarayıcıda: http://localhost:8000
```

Güncelleme ve koordinat ekleme
- Eğer ilçe verisini güncellemek isterseniz, ham JSON'u yeniden indirip `data/il-ilce.json` üzerine yazabilirsiniz:

```bash
curl -sSfL 'https://raw.githubusercontent.com/snrylmz/il-ilce-json/master/js/il-ilce.json' -o data/il-ilce.json
```

- İlçe bazlı koordinat (latitude/longitude) bilgisi orijinal dosyada yoktur; seçim anında tekil geocoding yapılmaktadır. Toplu olarak koordinat eklemek isterseniz, repo'ya eklediğim `scripts/bulk_geocode.py` betiğini kullanabilirsiniz. Örnek:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/bulk_geocode.py --data data/il-ilce.json --out data/il-ilce-with-loc.json --delay 1.0
```

Notlar ve uyarılar
- Bulk geocoding işlemi Open‑Meteo geocoding API'sine çok sayıda istek gönderebilir; lütfen varsayılan gecikme (`--delay`) değerini 1s veya daha yüksek tutun ve sonuçları manuel doğrulayın.
- Betik bir önbellek (`data/geocode-cache.json`) kullanır; yeniden çalıştırdığınızda önceden çözümlenmiş koordinatlar tekrar kullanılacaktır.
- Toplu geocoding sonuçlarını commit etmeden önce doğrulamanız önerilir — bazı ilçeler için eşleştirme yanlış olabilir.

İleri adımlar
- İsterseniz toplu geocoding'i parça parça çalıştırıp (`--start`/`--limit`) çıktıların doğrulanması ve sonra `data/il-ilce-with-loc.json` dosyasının repo'ya eklenmesi iyi olur.
