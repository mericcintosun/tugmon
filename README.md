# 🚀 Tugmon: Cosmic Tug-of-War on Monad

**Tugmon**, Monad ağının "Ludicrous Speed" (10.000 TPS) kapasitesini ve sıfıra yakın işlem ücretlerini kanıtlamak için tasarlanmış, devasa çok oyunculu (MMO) ve tamamen on-chain çalışan interaktif bir sahne şovudur. 

Geleneksel Web3 UX sürtünmelerini ortadan kaldırarak, salondaki tüm izleyicileri saniyeler içinde anlık transaction üreten birer test cihazına dönüştürür.

## 🎯 Çözülen Problem
Web3 projelerinin jüri ve kullanıcı sunumlarında ağ hızının (TPS) sadece "teorik" olarak anlatılması. Tugmon, cüzdan kurma zorunluluğunu (Burner Wallet ile) aşarak tüm salonu aynı anda Monad ağını strese sokmaya davet eder ve ağın gücünü **canlı, görsel ve rekabetçi** bir şekilde kanıtlar.

---

## ⏱️ 24 Saatlik Geliştirme Planı ve Feature Set

Aşağıdaki özellikler, 24 saatlik hackathon süresine uygun şekilde önceliklendirilmiş ve modüllere ayrılmıştır:

### 🛠️ Faz 1: Akıllı Kontrat (0 - 4. Saat)
Oyunun tüm mantığı ve durum yönetimi (state management) burada gerçekleşir.
* **[ ] Takım ve Skor Yönetimi:** Kırmızı ve Mavi takımların global skorlarını tutan değişkenler.
* **[ ] Rol Atama Motoru (RNG):** Katılan her cüzdana rastgele bir rol atanması (%70 Mühendis, %20 Güçlendirici, %10 Sabotajcı).
* **[ ] Aksiyon Fonksiyonları:**
  * `pull(uint8 team)`: Skoru 1 artırır.
  * `boost(uint8 team)`: Takımın sonraki 5 saniyedeki tıklamalarını 2x çarpanla kaydeder.
  * `sabotage(uint8 oppositeTeam)`: Karşı takımın skorunu belirli bir miktar düşürür veya 3 saniye kilitler.
* **[ ] Monad Testnet Deploy:** Kontratın test ağına yüklenmesi ve ABI/Adres çıktılarının frontend için hazır edilmesi.

### 🔑 Faz 2: Sürtünmesiz UX & Burner Wallet (4 - 8. Saat)
Seyircinin sadece QR okutarak oyuna girmesini sağlayan kritik aşama.
* **[ ] Otomatik Cüzdan Üretimi:** Kullanıcı siteye girdiği an `ethers.js` ile arka planda rastgele bir private key (Burner Wallet) oluşturulması ve `localStorage`'a kaydedilmesi.
* **[ ] Otomatik Fonlama (Sponsor/Relayer):** Yeni oluşturulan burner cüzdana, işlem yapabilmesi için ana cüzdandan (senin faucet ile doldurduğun cüzdan) anında ufak bir miktar Monad Testnet token transfer edilmesi.
* **[ ] Metamask Engeli Yok:** Kullanıcının hiçbir transaction'ı manuel onaylamaması (Tüm imzalar arka planda burner wallet ile atılacak).

### 📱 Faz 3: Mobil Oyuncu Arayüzü (8 - 14. Saat)
Seyircilerin telefonlarında göreceği, anında tepki veren savaş alanı.
* **[ ] Takım ve Rol UI:** Kullanıcının takım rengine göre (Kırmızı/Mavi) şekillenen arayüz ve sahip olduğu rolün (Rozet) gösterimi.
* **[ ] "PUMP" Butonu:** Ekranda devasa bir tıklama butonu.
* **[ ] Görsel Geri Bildirim (Particle Effect):** `framer-motion` kullanılarak her tıklamada ekrandan fırlayan "+1" veya "🚀" emojileri.
* **[ ] Özel Yetenek Butonları:** Eğer kullanıcı "Sabotajcı" veya "Güçlendirici" ise, cooldown (bekleme süresi) sayacı olan özel aksiyon butonlarının aktif edilmesi.

### 🖥️ Faz 4: Dev Ekran Şovu / Dashboard (14 - 20. Saat)
Sahneye yansıtılacak olan, Monad'ın gücünün sergilendiği ana ekran.
* **[ ] CSS Flexbox Animasyonu:** Kırmızı ve Mavi renklerin, takımların skor yüzdesine göre (`width: %`) birbirini akıcı bir şekilde ittiği "Halat Çekme" barı.
* **[ ] Canlı TPS Sayacı:** Kontrattaki event'leri dinleyerek (veya hızlı polling ile) Monad ağında o an saniyede kaç işlem gerçekleştiğini gösteren dijital sayaç.
* **[ ] Liderlik Tablosu (MVP):** En çok transaction üreten veya kritik sabotajlar yapan top 3 burner wallet adresinin ekranda anlık listelenmesi.
* **[ ] Görsel Efektler:** Nitro basıldığında veya sabotaj yendiğinde tüm ekranın titremesi/renk değiştirmesi (Tailwind conditional sınıfları ile).

### 🧪 Faz 5: Test & Sunum Hazırlığı (20 - 24. Saat)
* **[ ] Stres Testi:** Birden fazla sekme açılarak ağın ve RPC'nin limitlerinin test edilmesi.
* **[ ] Jüri Oylama Entegrasyonu (Opsiyonel):** Jürinin vereceği bir kararın kontrattaki `boost` fonksiyonunu tetiklemesi.
* **[ ] 3 Dakikalık Pitch Pratiği:** "Halat çekmeyi başlatıyorum, telefonları çıkarın!" diyeceğin sunum anının provası.

---

## 💻 Tech Stack
* **Blockchain:** Monad Testnet
* **Smart Contracts:** Solidity, Hardhat, OpenZeppelin
* **Frontend:** Next.js (App Router), React, Tailwind CSS
* **Web3 Integration:** Ethers.js
* **Animations:** Framer Motion, CSS Transitions