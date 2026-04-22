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

## API
Bu proje `https://open-meteo.com` üzerinden ücretsiz API uç noktalarını kullanır (geocoding ve forecast).

## Geliştirme önerileri
- İkonları emoji yerine SVG'lerle değiştir (daha tutarlı görsel).
- Birim dönüşümleri (°C / °F) ekle.
- Tema (dark/light) geçişi ekle.
- Basit testler ve CI entegrasyonu ekle.

## Lisans
Kişisel kullanım ve eğitim amaçlı.