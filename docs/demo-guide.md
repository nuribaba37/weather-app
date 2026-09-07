# 3 dakikalık demo

Türkiye Hava’yı tahmin kartı olarak değil; ilçe verisi, izin ve çevrimdışı doğrulukla gösterir.

## Hazırlık

- [Canlı demo](https://turkiye-hava-pwa.vercel.app) açık olsun.
- Geliştirici araçlarında mobil görünüm ve çevrimdışı mod hazır olsun.
- Arama örneği: `Karesi / Balıkesir`.

## 0:00–0:30 — Problem

İlçe düzeyinde hızlı hava verisi, yanlış koordinat, eş adlı ilçe, konum izni ve bayat önbellekle bozulur. Ürün bu riskleri arayüzde gizlemez; kaynak, zaman ve konum kalitesini gösterir.

## 0:30–1:15 — Arama ve kaynak

1. `Karesi` arayıp doğru il/ilçe çiftini seçin.
2. Anlık durum, 24 saat ve 7 günlük tahmini gösterin.
3. Kaynak, alınma zamanı, tahmin zamanı ve koordinatı açın.
4. Eş adlı ilçelerde il seçiminin zorunlu olduğunu belirtin.

973 ilçe koordinatı sınır, kümelenme ve iller arası yanlış ortak nokta testlerinden geçer.

## 1:15–2:00 — Risk özeti

1. 24 saatlik risk özetini gösterin.
2. Bunun resmî meteoroloji uyarısı olmadığını okuyun.
3. Yağış, rüzgâr ve UV eşiklerini değiştirin.
4. Hava kalitesi yoksa “iyi” varsayılmadığını, bilinmiyor metninin çıktığını gösterin.

## 2:00–2:35 — Gizlilik ve çevrimdışı

1. GPS’in yalnızca düğmeyle istendiğini anlatın.
2. Reddedilince IP konumunun otomatik çağrılmadığını gösterin.
3. Bir yeri kaydedip ağı kesin.
4. Son kaydın “canlı” değil, kayıtlı veri olarak işaretlendiğini gösterin.

## 2:35–3:00 — Kapanış

Türkiye Hava, Open-Meteo entegrasyonunu veri kalitesi, izinli konum, PWA güncelleme onayı ve erişilebilirlikle birlikte sunar. Anahtar gerektirmez; son tahmin çevrimdışı açılır.

## Olası sorular

**Koordinat kalitesini nasıl doğruladınız?**  
Sınır dışı nokta, aynı koordinatı paylaşan farklı iller ve küme sapması otomatik testtedir. Şüpheli kayıt yayınlanmaz.

**Eski önbellek canlı gibi görünmesin diye?**  
Kayıt zamanı ve “kayıtlı veri” rozeti zorunludur. Service worker ağı gizlemez; bayat yanıtı etiketler.

**GPS ve IP gizliliği?**  
Konum izni kullanıcı eylemine bağlıdır. IP yolu ayrı onay ister; redde sessizce düşülmez.

**SW güncellemesi neden onaylı?**  
Anında `skipWaiting` demoyu ve formları böler. Kullanıcı yeni kabuğu bilinçli alır.
