# Canlı tur

[Türkiye Hava](https://turkiye-hava-pwa.vercel.app) il ve ilçe tahmini sunar. API anahtarı yoktur; son kayıt çevrimdışı açılır.

## Arama

1. `Karesi` yazın ve `Karesi / Balıkesir` seçin.
2. Anlık durum, 24 saat ve 7 günlük tahmini görün.
3. Kaynak, alınma zamanı ve koordinatı açın. Eş adlı ilçelerde il seçimi zorunludur.

973 ilçe koordinatı sınır ve kümelenme testlerinden geçer.

## Gizlilik ve çevrimdışı

GPS yalnızca düğmeyle istenir. Konum reddedilince IP konumu otomatik çağrılmaz. Kayıtlı bir yeri çevrimdışı açınca veri “canlı” değil, kayıtlı tahmin olarak işaretlenir. Hava kalitesi gelmezse “iyi” varsayılmaz.

Risk özeti resmî meteoroloji uyarısı değildir.
