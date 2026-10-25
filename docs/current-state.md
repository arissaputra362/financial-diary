# Kondisi Implementasi Saat Ini

Dokumen ini merangkum kemampuan yang tersedia di source code saat ini. Untuk
tujuan dan acceptance criteria produk, lihat `docs/PRD.md` dan `docs/spec/`;
status historis atau item yang belum selesai di sana tidak otomatis berarti
fiturnya sudah tersedia.

## Halaman aplikasi

| Halaman | Fungsi |
|---|---|
| `/` | Mengarahkan pengguna ke alur aplikasi sesuai status sesi. |
| `/home` | Dashboard saldo, anggaran, aktivitas, target, dan ringkasan emas. |
| `/transactions` | Transaksi, pemindaian struk, ringkasan bulanan, trash, dan cetak/simpan PDF. |
| `/budget` | Anggaran dan target tabungan. |
| `/gold` | Aset emas, harga, pemindaian certicard/nota, dan ringkasan portofolio. |
| `/family` | Keanggotaan keluarga dan pengelolaan undangan sesuai role. |
| `/profile` | Informasi akun dan preferensi profil. |

Navigasi disesuaikan untuk layar mobile dan desktop. Tab Ringkasan berada di
halaman Aktivitas, bukan navigasi utama.

## Domain yang tersedia

- **Akun dan keluarga:** signup/login, logout, sesi server yang dapat dicabut,
  undangan, approval/decline/revoke anggota, dan pembatasan akses berdasarkan
  status membership.
- **Ledger:** transaksi `MONEY_IN`, `MONEY_OUT`, dan `TRANSFER`; transfer
  membuat pasangan transaksi keluar/masuk antar dompet. Saldo laporan
  menjelaskan saldo awal, saldo masuk/keluar, saldo awal dompet dalam cakupan,
  dan saldo akhir.
- **Nominal:** input uang memformat pemisah ribuan sambil menerima titik/koma
  desimal. Penyimpanan transaksi, saldo dompet, dan anggaran menggunakan
  PostgreSQL `NUMERIC(18,2)`; mata uang aplikasi adalah IDR.
- **Dompet:** cakupan personal/bersama, saldo pembuka, arsip/pemulihan, institusi
  resmi dari seed OJK, dan daftar institusi khusus per pengguna.
- **Anggaran dan tujuan:** anggaran bulanan personal/keluarga, target tabungan,
  serta soft delete/restore pada entitas yang didukung.
- **Laporan:** `GET /api/reports/monthly`; ringkasan server-side mengikuti bulan,
  cakupan, dan dompet. UI menyediakan print browser untuk menyimpan PDF.
- **OCR transaksi:** foto JPG/PNG/WebP menjadi draft transaksi yang perlu
  ditinjau; upload maksimal 4 MiB. Foto dari kamera yang melampaui batas
  otomatis dikompres di browser sebelum validasi upload. Foto galeri/drop
  mengikuti batas yang sama tanpa jalur kompresi kamera.
- **Emas:** aset batangan/perhiasan personal atau bersama, estimasi nilai dan
  perubahan terhadap modal, pemindaian dengan Gemini, harga harian per brand,
  snapshot harga di database, serta fallback ke snapshot sebelumnya jika
  provider gagal. Foto kamera besar dikompres sebelum scan.
- **Advisor:** insight berbasis data household dengan keluaran tervalidasi,
  penanda cache, dan batasan sumber yang ditampilkan.
- **PWA:** manifest dan ikon installable; aplikasi tetap membutuhkan jaringan
  untuk API dan data ledger.

## Integrasi server

| Variabel | Wajib | Penggunaan |
|---|---:|---|
| `DATABASE_URL` | Ya | PostgreSQL; adapter dipilih berdasarkan host Neon atau PostgreSQL lain. |
| `AUTH_SECRET` | Ya | Menandatangani session JWT server. |
| `GEMINI_API_KEY` | Fitur AI | OCR struk, scan aset emas, dan advisor. |
| `GEMINI_MODEL` | Tidak | Override model utama; default kode `gemini-3.5-flash-lite`. |
| `GEMINI_MODEL_FALLBACKS` | Tidak | Daftar fallback; default `gemini-3.1-flash-lite`. |
| `BLOB_READ_WRITE_TOKEN` | OCR struk | Penyimpanan privat gambar receipt. |
| `GOLD_PRICE_API_BASE_URL` | Tidak | Override base URL provider harga emas. Default `https://emas.maulanar.my.id`. |
| `GOLD_PRICE_API_KEY` | Tidak | API key provider harga bila konfigurasi provider membutuhkannya. |

Harga emas diambil oleh server. Untuk brand yang diminta, fetch provider
dibatasi satu upaya per hari dan hasil valid disimpan di tabel
`gold_market_price`; tabel `gold_price_fetch_state` mencatat upaya harian.
Nilai provider merupakan harga referensi, bukan penawaran transaksi yang
dijamin.

## Peta API utama

- `/api/auth/*` — signup, login, session, logout.
- `/api/family/*` — anggota, undangan, approval, decline, revoke.
- `/api/dashboard`, `/api/budget`, `/api/advisor/insights` — dashboard,
  anggaran, advisor.
- `/api/transactions/*`, `/api/reports/monthly` — ledger, trash/restore, laporan.
- `/api/wallets/*`, `/api/institutions/*` — dompet dan katalog institusi.
- `/api/goals/*` — tujuan tabungan dan trash/restore.
- `/api/ocr/*` — upload receipt, status, gambar privat, dan retry job gagal.
- `/api/gold/assets/*`, `/api/gold/prices`, `/api/gold/scan` — aset dan harga
  emas.

Setiap route yang membaca atau mengubah data keuangan berjalan di server dan
harus menjaga scope household/pemilik sesuai aturan domain.

## Database

Prisma schema berada di `prisma/schema.prisma`; migrasi yang menjadi sumber
perubahan database berada di `prisma/migrations/`. Model mencakup user,
household/membership/session, transaksi, dompet, anggaran, tujuan, receipt/job
OCR, insight advisor, katalog institusi, aset emas, dan snapshot harga.

Nominal keuangan menggunakan kolom `NUMERIC(18,2)`, sedangkan berat emas
disimpan dalam miligram dan kadar sebagai permille. Terapkan migrasi dengan
`bunx prisma migrate deploy`; build aplikasi tidak menerapkan migrasi.

## Batasan yang perlu diketahui

- Ketersediaan OCR/advisor bergantung pada kredensial, kuota, dan ketersediaan
  Gemini; penyimpanan OCR transaksi juga memerlukan Vercel Blob.
- Harga emas bergantung pada provider eksternal dan dapat ditampilkan dari
  snapshot lama saat provider tidak tersedia. Status tanggal/cache ditampilkan
  di antarmuka.
- PDF dihasilkan melalui dialog print browser, bukan file PDF yang dirender dan
  diunduh oleh server.
- PWA tidak menyediakan sinkronisasi offline untuk ledger.
- Dokumen QA/verification tertentu merupakan snapshot historis; periksa tanggal
  laporan dan source code sebelum menganggap statusnya sebagai hasil QA terkini.

## Menjaga dokumen tetap akurat

Saat menambah fitur atau mengubah kontrak API/schema, perbarui bagian terkait di
dokumen ini dan README. Spesifikasi menjelaskan kebutuhan/kontrak yang disetujui;
catat status implementasi dan QA dengan tanggal/evidence di dokumen status atau
laporan QA, jangan menyimpulkan status hanya dari daftar acceptance criteria.
