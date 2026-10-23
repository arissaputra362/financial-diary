# Panduan Build PWA dan APK

Panduan ini menjelaskan cara terbaik mengemas Catatan Keuangan Keluarga sebagai
PWA dan APK Android yang mengarah ke URL production.

## Rekomendasi arsitektur

Untuk aplikasi ini, gunakan **PWA + Trusted Web Activity (TWA)** sebagai jalur
utama:

```text
Source Next.js
    |
    +--> Deploy ke HTTPS production
    |    https://financial-planner-nu-lake.vercel.app
    |
    +--> Install sebagai PWA dari Chrome
    |
    +--> TWA Android membuka URL production yang sama
```

Alasannya:

- Satu source of truth: frontend dan API tetap di Next.js production.
- APK tidak perlu membundel ulang frontend.
- Deploy website otomatis menjadi update yang dilihat pengguna APK.
- Cookie `httpOnly` dan session server tetap berjalan pada domain production.
- Ukuran APK dan biaya pemeliharaan lebih kecil dibanding aplikasi native penuh.

TWA bukan aplikasi offline penuh. Pengguna tetap membutuhkan koneksi untuk
memakai API dan data keuangan. PWA installability juga tidak sama dengan
offline-first synchronization.

## Prasyarat production

Sebelum membuat APK, pastikan:

- Production memakai HTTPS.
- URL production stabil dan tidak berubah.
- `/manifest.webmanifest` dapat dibuka publik.
- `/icon-192.png` dan `/icon-512.png` dapat dibuka publik.
- Login, logout, refresh session, dan route utama sudah diuji di domain
  production.
- `AUTH_SECRET`, `DATABASE_URL`, dan secret provider telah diisi di Vercel.
- Migration database sudah diterapkan.
- Untuk TWA, domain production dapat menyajikan
  `/.well-known/assetlinks.json`.

URL saat ini:

```text
https://financial-planner-nu-lake.vercel.app
```

Sebaiknya gunakan custom domain sebelum publikasi Play Store. Domain Vercel
preview atau domain yang sering diganti menyulitkan Digital Asset Links dan
branding aplikasi.

## Opsi 1 — Install sebagai PWA

### Android Chrome

1. Buka URL production di Chrome.
2. Login dan uji alur utama.
3. Buka menu Chrome.
4. Pilih **Install app** atau **Tambahkan ke layar utama**.
5. Pastikan icon, nama aplikasi, `start_url`, dan mode standalone sesuai.

Manifest saat ini berada di
[`app/manifest.ts`](../app/manifest.ts) dan menghasilkan
`/manifest.webmanifest`.

### iOS Safari

1. Buka URL production di Safari.
2. Pilih Share.
3. Pilih **Add to Home Screen**.

Kemampuan PWA iOS berbeda dari Android. Jangan menganggap fitur TWA atau
background behavior Android tersedia di iOS.

## Opsi 2 — APK TWA dengan Bubblewrap (disarankan)

TWA membuat APK yang membuka web production dalam browser engine Android tanpa
address bar. Website tetap menjadi aplikasi utama.

### 1. Install Bubblewrap

Jalankan pada mesin build yang memiliki Node.js dan Java/Android SDK:

```bash
npm install --global @bubblewrap/cli
bubblewrap doctor
```

Ikuti instruksi `doctor` untuk memasang JDK dan Android SDK yang dibutuhkan.

### 2. Inisialisasi dari manifest production

```bash
bubblewrap init --manifest=https://financial-planner-nu-lake.vercel.app/manifest.webmanifest
```

Saat ditanya, gunakan nilai yang konsisten:

```text
Package ID:    com.financialplanner.app
App name:      Catatan Keuangan Keluarga
Launch URL:    https://financial-planner-nu-lake.vercel.app/transactions
Display mode:  standalone
```

Package ID tidak boleh diubah setelah aplikasi dipublikasikan ke Play Store.

### 3. Buat signing key secara aman

Gunakan keystore release yang disimpan di password manager atau secret
management. Jangan commit file `.jks`, password, atau alias ke repository.

Contoh pembuatan keystore:

```bash
keytool -genkeypair -v \
  -keystore financial-planner-release.jks \
  -alias financial-planner \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Simpan backup keystore secara offline dan terbatas. Kehilangan signing key
dapat menyulitkan update APK/Play Store.

### 4. Build APK

```bash
bubblewrap build
```

Output biasanya berada di direktori build Bubblewrap sebagai APK/AAB. Ikuti
output command karena lokasi dapat berbeda menurut versi CLI.

Untuk distribusi Play Store, prioritaskan Android App Bundle:

```bash
bubblewrap build --skipPwaValidation
```

Jangan memakai `--skipPwaValidation` sebagai cara menutupi manifest yang rusak;
gunakan hanya bila validasi sudah dilakukan dengan bukti lain.

### 5. Uji APK sebelum distribusi

```bash
adb install path/to/app-release.apk
```

Uji minimal:

- APK membuka URL production yang benar.
- Login dan session tetap bekerja.
- Session yang masih aktif tidak meminta login berulang.
- Saat session berakhir, password dapat dimasukkan kembali.
- Logout benar-benar menghapus session.
- PWA icon dan splash screen tampil.
- Navigasi back Android tidak merusak alur.
- Upload struk dan kamera/file picker bekerja pada perangkat nyata.
- Error jaringan tampil dengan jelas.

## Digital Asset Links untuk TWA

Tanpa Digital Asset Links, Android dapat menampilkan fallback browser atau
address bar karena website belum diverifikasi sebagai milik APK.

### 1. Dapatkan SHA-256 fingerprint signing key

```bash
keytool -list -v \
  -keystore financial-planner-release.jks \
  -alias financial-planner
```

Catat nilai `SHA256` tanpa spasi atau gunakan format yang diminta Bubblewrap.

### 2. Tambahkan file asset links

Buat file:

```text
public/.well-known/assetlinks.json
```

Isi dengan package name dan fingerprint release:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.financialplanner.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:REPLACE:WITH:RELEASE:FINGERPRINT"
      ]
    }
  }
]
```

Deploy lalu verifikasi:

```text
https://financial-planner-nu-lake.vercel.app/.well-known/assetlinks.json
```

Untuk custom domain, file harus tersedia pada custom domain yang digunakan APK.
Fingerprint debug dan release berbeda; gunakan fingerprint release untuk APK
release.

## Opsi 3 — Capacitor

Gunakan Capacitor hanya jika aplikasi membutuhkan kemampuan native yang tidak
ditangani TWA, seperti secure storage native, biometric unlock, deep native
integration, atau akses perangkat yang lebih khusus.

Trade-off:

- Frontend masih dapat memakai URL production.
- Setup Android Studio, Gradle, plugin, dan signing lebih besar.
- Perlu mengelola lifecycle WebView dan perbedaan cookie/storage.
- Update native wrapper tetap membutuhkan distribusi APK baru.

Untuk kebutuhan saat ini—APK ringan yang diarahkan ke production—TWA lebih
sederhana dan lebih sesuai.

## Mode nyaman dan keamanan

Mode nyaman aplikasi mengikuti aturan berikut:

- Email dapat disimpan lokal hanya setelah pengguna memilih “Ingat email saya”.
- Password tidak disimpan di `localStorage`, IndexedDB, cookie biasa, atau APK.
- Session autentikasi tetap berasal dari cookie `httpOnly` server.
- Session dapat kedaluwarsa atau direvoke dari server.
- HTTPS wajib digunakan untuk production dan APK.

Jika nanti diperlukan PIN atau biometrik, implementasikan pada wrapper native
seperti Capacitor dengan secure storage. Jangan mengubahnya menjadi penyimpanan
password di browser.

## Checklist release

### Website/PWA

- [ ] Production URL final dan HTTPS aktif.
- [ ] `manifest.webmanifest` merespons status 200.
- [ ] Icon 192 dan 512 merespons status 200.
- [ ] `start_url` mengarah ke route yang diinginkan.
- [ ] Login, logout, session, dan refresh diuji.
- [ ] Error jaringan dan API diuji.
- [ ] `bun run build` lulus.
- [ ] `bun run lint` tidak memiliki error.

### APK TWA

- [ ] Package ID sudah final.
- [ ] Keystore release sudah dibackup.
- [ ] APK/AAB ditandatangani dengan key release.
- [ ] `assetlinks.json` menggunakan fingerprint release.
- [ ] APK diuji di perangkat Android nyata.
- [ ] Deep link dan tombol back diuji.
- [ ] Kamera/file picker/OCR diuji.
- [ ] Tidak ada secret di source code atau APK.
- [ ] URL production tidak bergantung pada preview deployment.

