# Spec: Transaksi Manual & OCR Review

**Penulis:** PM / System Analyst · **Tanggal:** 2026-09-30 · **Status:** Baseline Draft; T-012 amendment PM-approved 2026-10-22
**PRD:** `docs/PRD.md#fitur-3-transaksi-manual-ocr-review`
**AC yang di-cover:** AC-1 s.d. AC-8 (Fitur 3) = AC-F3-1..AC-F3-9;
amandemen T-012 = AC-F3-10..AC-F3-14; edit transaksi = AC-F3-15
**Flow referensi:** `docs/erd/flowcharts.md` §4, §5

> **Amandemen T-012 (PM-approved 2026-10-22): Retry OCR dan Add intent.**
> Menambah AC-F3-10 sampai AC-F3-14. AC-F3-1 sampai AC-F3-9, aturan duplikat,
> dan kontrak privasi baseline tetap berlaku. Approval ini hanya mencakup
> amandemen T-012, bukan seluruh fitur Transaksi/OCR. Implementasi mengikuti Dev
> Plan T-012; approval ini bukan release approval.
> Desain terkait: `docs/design/03-transaction-and-ocr-flow.md` §3.5.

## Overview

Dua jalur masuk data: form manual (money in / money out / transfer) dan upload struk
yang diekstrak Gemini Vision menjadi draft yang WAJIB direview user sebelum disimpan.
Semua POST mutation mendukung Idempotency-Key. Tidak ada penyimpanan otomatis dari OCR.

## User Flow

1. User buka Add (tombol tengah bottom nav) → pilih money in / money out / transfer.
2. Isi amount, category, date, note, dan wallet source/destination sesuai tipe setelah
   wallet feature aktif (AC-F6-4/5) → submit → sukses → muncul di aktivitas.
3. Alternatif: pilih "scan struk" → pilih/ambil gambar → upload → loading OCR.
4. Draft hasil OCR tampil dalam form editable (amount, date, merchant, category) + confidence.
5. User mengoreksi dan memilih wallet yang valid setelah wallet feature aktif (AC-F6-10)
   → konfirmasi save → tersimpan dengan source=OCR.
6. User membatalkan → tidak ada transaction tersimpan.

## Behavior Detail

### AC-1 (AC-F3-1): Form manual + validasi bahasa awam

- Kondisi: submit dengan berbagai input valid/invalid.
- Yang terjadi: type dari enum (money in/out/transfer); amount > 0 (maksimum
  2.147.483.647 minor — di atas → 422 AMOUNT_OUT_OF_RANGE); date tidak di masa depan
  **menurut kalender Asia/Jakarta** (D-7/D-14: `occurred_at` > now() WIB ditolak 422);
  category dari daftar kanonik (D-11): `food`, `transport`, `bills`, `shopping`,
  `health`, `education`, `entertainment`, `income`, `gift_donation`, `other` —
  MONEY_OUT menerima semua kecuali `income`; MONEY_IN menerima `income`,
  `gift_donation`, `other`; note opsional ≤500 karakter; merchant ≤120 karakter. Setelah
  wallet feature aktif, MONEY_IN wajib wallet tujuan dan MONEY_OUT wajib wallet sumber
  yang boleh diakses (AC-F6-4).
  Invalid → 422 dengan fieldErrors per field dalam bahasa awam.
- Yang tidak boleh terjadi: amount 0/negatif lolos; date masa depan (WIB) lolos;
  category di luar daftar lolos; pesan error teknis ("violates constraint", stack trace).

### AC-2 (AC-F3-2): Amount rupiah dengan presisi dua desimal

- Kondisi: semua penyimpanan amount.
- Yang terjadi: `amount_minor` disimpan sebagai PostgreSQL `NUMERIC(18,2)`; input menerima maksimal dua angka desimal. DTO tetap memakai suffix `Minor` untuk kompatibilitas.
- Yang tidak boleh terjadi: penyimpanan binary floating point; pembulatan tersembunyi; kehilangan presisi.

### AC-3 (AC-F3-3): Transfer dua kaki atomik

- Kondisi: user memilih transfer.
- Yang terjadi: service membuat tepat 2 record (`MONEY_OUT` + `MONEY_IN`) dengan
  `transfer_group_id` sama dalam satu transaksi; keduanya muncul di aktivitas.
  Balance tidak terpengaruh (net 0). Enum `TRANSFER` tidak dipakai di MVP — transfer
  selalu direpresentasikan sebagai 2 transaksi terpisah yang terhubung via
  `transfer_group_id`.
- Yang tidak boleh terjadi: hanya satu kaki tersimpan; transfer dihitung sebagai
  spending di dashboard; user diminta input ganda.

### AC-4 (AC-F3-4): OCR draft editable, tidak auto-save

- Kondisi: upload struk valid ≤ 4.194.304 byte (4MB — keputusan D-10, turun dari 5MB
  karena batas body function Vercel ≈4,5MB), mime jpeg/png/webp.
- Yang terjadi: receipt + ocr_job dibuat; Gemini menghasilkan draft terstruktur;
  response berisi job + draft; TIDAK ada transaction sampai user konfirmasi via
  POST /api/transactions dengan source=OCR + receiptId. Draft date-only D dikonversi
  ke `occurred_at` = D 12:00 Asia/Jakarta (D-14).
- Yang tidak boleh terjadi: endpoint OCR membuat transaction; draft tampil sebagai
  sudah tersimpan; kunci API bocor ke client; upload > 4MB lolos (ditolak 422
  FILE_INVALID sebelum diproses).

### AC-4b (AC-F3-5): Kegagalan OCR berkontrak jelas (keputusan D-12)

- Kondisi: timeout, rate limit, model unavailable, output tidak valid.
- Yang terjadi: `POST /api/ocr/receipts` tetap 200 dengan
  `{ job: { status: FAILED, errorCode }, draft: null }`; errorCode dari namespace:
  `OCR_TIMEOUT`, `OCR_RATE_LIMITED`, `OCR_INVALID_OUTPUT`, `OCR_MODEL_UNAVAILABLE`.
  UI menampilkan state jujur (retry manual sesuai AC-F3-10 / isi manual).
- Yang tidak boleh terjadi: data karangan mengisi field; retry tak terbatas otomatis;
  kegagalan disimpan sebagai transaction; error 5xx untuk kegagalan model yang sudah
  tertangani.
- UX: kartu kegagalan, treatment low-confidence, dan flow duplicate didefinisikan di
  design doc 03 (sign-off UI/UX Designer sebelum dev plan).

### AC-4c (AC-F3-5 amendemen 2026-10-23): Fallback model berbatas

- Kondisi: model utama gagal karena sebab spesifik-model: HTTP 429
  (RESOURCE_EXHAUSTED / kuota), HTTP 404 (model pensiun / tidak ditemukan), atau
  HTTP 503 (UNAVAILABLE). Kuota free tier Gemini berlaku per project DAN per model.
- Yang terjadi: provider mencoba SEKALI ke model berikutnya pada rantai
  `GEMINI_MODEL` + `GEMINI_MODEL_FALLBACKS` (default `gemini-3.5-flash-lite` →
  `gemini-3.1-flash-lite`; dedupe, kosong di-drop, seluruh rantai maksimal 3 model,
  tidak pernah mengulang model yang sama; time-budget guard 28.000 ms untuk seluruh
  rantai, timeout 9 detik per attempt tetap). Bila sukses, `ocr_job.model` mencatat
  model yang benar-benar berhasil. Bila semua attempt gagal, preseden errorCode final:
  attempt manapun kena 429 → `OCR_RATE_LIMITED`; selain itu kode attempt terakhir
  (`OCR_TIMEOUT` untuk timeout, `OCR_MODEL_UNAVAILABLE` untuk 404/503/400).
- Yang tidak boleh terjadi: fallback pada HTTP 400 INVALID_ARGUMENT (bug request
  harus terlihat, tidak boleh ditutupi model lain) atau pada timeout (dibahas pada
  kode `OCR_TIMEOUT`); retry otomatis tanpa batas atau perubahan UI/copy; perubahan
  bentuk respons atau nama error code.

### AC-5 (AC-F3-6): Dedup struk

- Kondisi: konten gambar sama (sha256) di household yang sama.
- Yang terjadi sebelum fitur wallet: 409 DUPLICATE_RECEIPT + job existing dikembalikan
  sesuai kontrak saat ini. Setelah fitur wallet aktif, uploader yang sama boleh menerima
  kembali job/draft miliknya dan dapat menggunakannya sesuai hak wallet setelah konfirmasi;
  uploader berbeda hanya menerima respons duplikat generik, tanpa job ID, draft, identitas
  uploader, atau detail receipt lama (AC-F6-10/C-19). Pembuatan transaksi kedua dari
  receipt/job yang sama tetap hanya dimungkinkan melalui receipt/job yang dapat diakses
  pengguna tersebut.
- Yang tidak boleh terjadi: struk sama diproses dua kali; dedup lintas household
  (household berbeda boleh upload konten sama); kebocoran draft/receipt antaranggota.

### AC-6 (AC-F3-7): Kegagalan OCR jujur

- Kondisi: timeout, rate limit, output model tidak valid, confidence rendah.
- Yang terjadi: ocr_job FAILED dengan error_code bertipe; UI menampilkan state jujur
  (retry manual sesuai AC-F3-10 / isi manual); confidence rendah ditandai dan field
  kosong dibiarkan kosong.
- Yang tidak boleh terjadi: data karangan mengisi field; retry tak terbatas otomatis;
  kegagalan disimpan sebagai transaction.

### AC-7 (AC-F3-8): Idempotency-Key

- Kondisi: POST mutation dengan header Idempotency-Key.
- Yang terjadi: claim key dieksekusi DULU, baru dedup/dedup receipt di dalamnya
  (precedence D-13) — retry jaringan dengan key sama → replay response asli, termasuk
  replay 409 DUPLICATE_RECEIPT; key sama + payload beda → 409 IDEMPOTENCY_CONFLICT;
  request gagal → key ikut rollback → retry mengeksekusi fresh; tanpa key → eksekusi
  normal. Payload dibandingkan via canonical-JSON hash (urutan key tidak mempengaruhi).
  Client wajib generate UUID key per submit attempt.
- Yang tidak boleh terjadi: double-charge saat client retry jaringan; replay response
  user lain (scope per user, D-2 ERD); key di endpoint berbeda dianggap konflik
  (path bagian dari hash).

### AC-8 (AC-F3-9): Secret tetap server-side

- Kondisi: semua request OCR/advisor.
- Yang terjadi: panggilan Gemini hanya dari route server; env var tanpa NEXT_PUBLIC_.
- Yang tidak boleh terjadi: GEMINI_API_KEY/DATABASE_URL di bundle client; prompt mentah
  model tampil di UI/log.

### AC-9 (AC-F3-10): Retry manual eksplisit untuk job FAILED terbaru

- Kondisi: job OCR terbaru untuk sebuah receipt berstatus `FAILED`, dan receipt
  diunggah oleh user yang sedang login.
- Yang terjadi: UI menampilkan satu aksi retry, `Pindai ulang`, pada state job
  gagal terbaru. Aksi ini membuka pemilih file sehingga user dapat memilih
  gambar struk lagi atau menggantinya dengan foto lain.
- File yang dipilih dikirim ke `POST /api/ocr/receipts` (upload normal):
  - byte berbeda: receipt dan job baru dibuat, lalu OCR berjalan seperti upload
    biasa;
  - byte identik: server membalas `409 DUPLICATE_RECEIPT` dengan job `FAILED`
    milik uploader, lalu klien memanggil `POST /api/ocr/jobs/{id}/retry`
    dengan `Idempotency-Key` baru dan **tanpa body**.
- Endpoint retry membuat `OcrJob` attempt baru untuk receipt yang sama; job lama
  beserta `errorCode` dan `completedAt` tidak diubah dan tidak dihapus.
- Retry sukses: respons `200 { job: SUCCEEDED, draft }`; UI membuka review
  editable yang sama. Tidak ada transaction sampai user menekan simpan.
- Retry gagal: respons `200 { job: FAILED baru, errorCode, draft: null }`; UI
  tetap menampilkan kartu gagal untuk job baru tersebut dan boleh menawarkan
  retry manual lagi. Tidak ada retry otomatis.
- Yang tidak boleh terjadi: retry untuk job `SUCCEEDED` atau `PROCESSING`;
  retry job yang bukan job terbaru; endpoint retry menerima file atau body;
  job gagal lama ditimpa atau dihapus; endpoint retry membuat transaction;
  retry berjalan tanpa aksi user; klaim bahwa user tidak perlu memilih gambar.

### AC-10 (AC-F3-11): Retry memakai byte privat tersimpan tanpa Receipt baru

- Kondisi: retry job `FAILED` terbaru milik uploader.
- Yang terjadi: server membaca byte dari `receipt.storage_key` melalui
  `BlobStore` server-side pada saat retry, memakai `mime_type` dan
  `size_bytes` yang tersimpan, lalu memanggil provider dengan byte asli
  tersebut. Tidak ada `Receipt` baru dan tidak ada perubahan `content_sha256`,
  `storage_key`, `mime_type`, `size_bytes`, atau `uploaded_by_user_id`.
- Request retry tidak membawa file. Tidak ada `receiptImageAvailable` dan tidak
  ada pengecekan `BlobStore.exists` sebelum retry; ketersediaan dibaca lazy
  hanya ketika retry dijalankan, yaitu setelah user memilih file identik yang
  terkena dedup.
- Respons retry tidak memuat storage key, URL Blob, token, atau path internal.
- Yang tidak boleh terjadi: byte dari client menggantikan byte asli; receipt
  kedua; hash, ukuran, atau pemilik receipt berubah; panggilan model memakai
  gambar lain; storage key atau URL bocor ke client.

### AC-11 (AC-F3-12): Foto tersimpan tidak tersedia

- Kondisi: retry dipanggil, tetapi `BlobStore` mengembalikan null, gagal
  membaca, byte kosong/terpotong, atau ukuran byte tidak sama dengan
  `receipt.size_bytes`.
- Yang terjadi: server tidak membuat `OcrJob` baru, tidak memanggil provider,
  tidak membuat transaction, dan tidak mengubah `Receipt` atau job lama.
  Respons bertipe `409 OCR_IMAGE_UNAVAILABLE`.
- UI mengganti kartu retryable dengan salinan jujur: `Gambar struk yang lama
  sudah tidak bisa diproses. Pilih foto struk lain atau isi manual.` Aksi yang
  tersedia: `Pilih foto struk` (membuka pemilih file) dan `Isi manual`, plus
  `Batal` dan `X`.
- `Pilih foto struk` adalah upload normal baru (kamera/dropzone), bukan retry
  dan bukan recovery same-job. Tidak ada byte yang dikirim ke endpoint retry
  pada varian ini. Upload byte yang sama tetap mengikuti dedup yang sudah ada;
  job `FAILED` ini tetap tidak bisa di-retry tanpa gambar tersimpan, dan UI
  tidak boleh mengklaim sebaliknya. Jika user memilih file identik lagi, UI
  tetap di varian tidak tersedia dan tidak memanggil provider.
- Yang tidak boleh terjadi: provider dipanggil dengan byte kosong atau data
  karangan; job `FAILED` baru dibuat seolah model sudah dicoba; retry otomatis;
  klaim bahwa retry bisa dilanjutkan; pesan menyalahkan user; detail Blob,
  storage key, atau job id ditampilkan.

### AC-12 (AC-F3-13): Klaim retry serialisasi dan attempt monotonik

- Data: `OcrJob.attempt Int` dengan default 1, unik per `(receipt_id, attempt)`,
  dan index terbaru per `(receipt_id, attempt DESC)`, ditambahkan lewat migrasi
  additive. Job lama di-backfill deterministik; receipt dengan satu job menjadi
  attempt 1.
- Yang terjadi: retry diklaim di dalam transaksi yang mengambil row lock pada
  `Receipt` (`SELECT ... FOR UPDATE`). Setelah lock didapat, server **membaca
  ulang** job terbaru dan memastikan job target masih job terbaru berstatus
  `FAILED`; baru kemudian mengalokasikan `max(attempt) + 1` dan membuat job
  `PROCESSING`. Pemeriksaan sebelum lock tidak boleh menjadi dasar keputusan.
- Bila kalah klaim: job terbaru `PROCESSING` → `409 OCR_RETRY_IN_PROGRESS`;
  job terbaru `SUCCEEDED` atau job target bukan job terbaru → `409
  OCR_NOT_RETRYABLE`. Keduanya tanpa panggilan provider.
- Partial unique `PROCESSING` tetap ada sebagai defense in depth, bukan
  pengunci concurrency satu-satunya.
- `createdAt` tidak boleh dipakai sebagai urutan percobaan: transaksi bisa
  menunggu lock, sehingga waktu mulai tidak mencerminkan urutan commit.
- Retry pertama yang selesai sebelum retry kedua mendapat lock tidak boleh
  menyebabkan panggilan provider kedua. Jika retry pertama `SUCCEEDED`, job
  terbaru sudah `SUCCEEDED`; jika retry pertama `FAILED`, job terbaru adalah
  `FAILED` baru milik retry pertama dan job target retry kedua sudah basi.
  Keduanya ditolak tanpa provider.

### AC-13 (AC-F3-14): Add intent dapat dikonsumsi dan dibuka lagi

- Kondisi: sheet Add dibuka dari `?add=1`, lalu ditutup lewat `X`, `Batal`,
  `Escape`, klik backdrop, atau setelah transaksi berhasil disimpan.
- Yang terjadi: penutupan menghapus hanya intent `add` dari URL memakai
  `router.replace`, sehingga tidak menambah history entry. Pada penutupan tanpa
  simpan, parameter `month` pada view aktif dan `view=trash` tetap
  dipertahankan; daftar dan tab tidak di-reset.
- State sheet mengikuti transisi intent dari tidak ada menjadi `add=1`. Tidak
  ada remount berbasis key yang menyertakan flag `add`; jika sheet sudah
  terbuka, intent yang sama tidak membuka sheet kedua.
- Setelah simpan berhasil, view mengikuti perilaku simpan yang sudah ada
  (pindah ke active), dan intent `add` dibersihkan oleh satu penulis URL yang
  sama. Penutupan setelah simpan tidak boleh menulis URL kedua yang menimpa
  view active dengan query lama.
- Fokus kembali ke elemen yang membuka sheet; jika sheet dibuka dari URL lintas
  halaman dan trigger lama sudah tidak terpasang, fokus kembali ke tombol
  `Tambah transaksi` yang terlihat di halaman.
- Setelah penutupan, aksi `Tambah transaksi` global atau tombol halaman membuka
  sheet lagi dalam satu klik karena intent berubah dari tidak ada menjadi
  `add=1`. Tidak perlu reload halaman.
- Yang tidak boleh terjadi: `add=1` tertinggal setelah sheet tertutup; klik URL
  yang sama tidak melakukan apa pun; history entry baru saat menutup; view bulan
  atau trash hilang; dua `router.replace` berlomba dan menimpa view active;
  route atau item navigasi baru; sheet terbuka otomatis tanpa intent.

## Edge Case

- Gambar > 4.194.304 byte atau mime di luar jpeg/png/webp → 422 FILE_INVALID sebelum
  diproses; boundary test tepat di batas dan +1 byte.
- Upload blob sukses tapi insert DB gagal → orphan blob (backlog cleanup, tidak blokir MVP).
- OCR sukses tapi amount kosong → field kosong di draft, user wajib isi sebelum save.
- Confidence < 0,70 (konstanta D-15) → draft ditandai low-confidence; field dengan
  `missingFields` tetap kosong.
- User menutup halaman review sebelum save → receipt + job tersimpan, tidak ada
  transaction (pertumbuhan Blob dari review yang dibatalkan = known free-tier risk,
  tercatat di ERD §5).
- Submit ganda cepat (double-tap) → idempotency key mencegah duplikat (satu 201, satu replay).
- Dua upload file sama bersamaan oleh uploader yang sama → satu sukses, satu 409 + job
  milik uploader tersebut (bila PROCESSING tanpa draft, client menunggu/menampilkan status).
- Dua upload file sama oleh uploader berbeda dalam household yang sama → setelah fitur
  wallet aktif, respons duplikat generik; job/draft/uploader pemilik receipt pertama tidak
  disertakan.
- Gemini mengembalikan amount negatif / currency tidak didukung / confidence di luar
  0..1 → draft ditolak di boundary → job FAILED dengan OCR_INVALID_OUTPUT (D-12).
- occurred_at dari OCR di masa depan (WIB) → ditolak oleh validasi yang sama dengan manual.
- Dua tap retry bersamaan untuk job yang sama → satu klaim membuat attempt baru dan
  satu panggilan provider; request lain mendapat `409 OCR_RETRY_IN_PROGRESS` atau
  `409 OCR_NOT_RETRYABLE` tanpa panggilan provider. Jika retry pertama sudah selesai
  sebelum retry kedua mendapat row lock, retry kedua tetap ditolak karena job target
  bukan job terbaru yang `FAILED`.
- Tab lama masih menampilkan job `FAILED` setelah retry lain sukses → retry dari tab
  lama ditolak `409 OCR_NOT_RETRYABLE`; tab harus memuat job terbaru, bukan membuat
  percobaan baru dari status basi.
- Retry sukses lalu user menutup review tanpa save → job `SUCCEEDED` dan draft tetap
  ada, tidak ada transaction; retry berikutnya tidak ditawarkan karena job terbaru
  bukan `FAILED`.
- Foto asli hilang atau tidak terbaca dari Blob → retry tidak membuat job baru dan
  tidak memanggil provider; UI menampilkan `OCR_IMAGE_UNAVAILABLE` dengan `Isi manual`
  dan `Pilih struk lain`. Upload foto baru adalah alur normal baru, bukan recovery
  same-job. Upload byte yang sama tetap mengikuti dedup yang ada; job `FAILED` itu
  tetap tidak bisa di-retry tanpa gambar tersimpan.
- `?add=1` dibuka langsung lewat refresh → sheet terbuka sekali; setelah ditutup URL
  bersih dan refresh berikutnya tidak membuka sheet tanpa intent baru.
- `?add=1` ditutup dari tab trash → URL tetap `view=trash`; setelah simpan sukses,
  view mengikuti perilaku simpan yang ada (active) dan hanya satu penulis URL yang
  berlaku.
- Transfer via OCR → tidak didukung di MVP (OCR hanya money in/out); UI menyembunyikan opsi.
- PATCH /api/transactions/{id} memperbarui baris transaksi aktif non-transfer
  mengikuti AC-F3-15.

### AC-F3-15 (amendemen PM-approved 2026-10-25): Edit transaksi tercatat

- Pengguna dapat mengedit transaksi aktif non-transfer dari detail transaksi. Form
  dibuka dengan nilai tersimpan dan dapat mengubah jenis (uang masuk/keluar), nominal,
  tanggal, kategori, merchant, catatan, dan dompet yang sesuai jenisnya.
- Sumber MANUAL maupun OCR dapat diedit. Receipt yang terhubung tetap terhubung;
  edit tidak mengganti gambar, membuat transaksi baru, atau mengubah identitas baris,
  `created_by_user_id`, maupun `created_at`. `updated_at` diperbarui.
- Validasi mengikuti AC-F3-1 dan aturan wallet AC-F6-4. Simpan memperbarui saldo,
  anggaran, grafik, dan laporan melalui data transaksi terbaru. Error validasi
  mengembalikan 422 field errors dan tidak mengubah data.
- Hanya transaksi aktif yang dapat diedit. Transfer berpasangan dan transaksi di trash
  tidak dapat diedit pada MVP ini. Transfer memerlukan alur edit kedua kaki secara
  atomik di masa mendatang.
- Akses mengikuti scope wallet yang berlaku: wallet Pribadi hanya dapat diubah
  pemiliknya dan wallet Sharing mengikuti aturan otorisasi transaksi. Akses di luar
  household atau wallet privat yang tidak terlihat menghasilkan 404 generik.
- Yang tidak boleh terjadi: membuat row duplikat, mengubah receipt, mengedit transfer
  satu sisi, atau menyimpan input yang tidak valid.

Keputusan lama D-15 yang menunda `PATCH /api/transactions/{id}` diganti oleh
amendemen ini. Aksi edit memakai dialog detail yang sudah ada; form edit memakai
komponen dan pola validasi form transaksi manual.

## Constraint Bisnis

- OCR tidak pernah menyimpan transaction tanpa konfirmasi eksplisit user.
- Model output adalah untrusted input; divalidasi ulang dengan zod di route boundary
  (responseSchema Gemini adalah hint, bukan jaminan).
- Kategori dari daftar kanonik tetap (D-11); kategori bebas tidak ada di MVP.
- Satu struk = satu receipt record per household (dedup sha256); dedup scope = upload
  saja — membuat transaction kedua dari receipt/job existing diperbolehkan. Setelah fitur
  wallet aktif, transaksi kedua hanya dapat dibuat dari receipt/job yang dapat diakses
  pengguna tersebut; batas privasi C-19 mengatur payload duplicate lintas-uploader.
- Retry OCR bukan upload baru: retry tidak membuat `Receipt`, tidak mengubah hash,
  ukuran, mime, atau storage key, dan hanya menambah `OcrJob` attempt baru untuk
  receipt yang sama. Job gagal lama disimpan sebagai riwayat percobaan.
- Retry hanya eksplisit, hanya untuk job `FAILED` terbaru, dan hanya untuk uploader
  asli receipt. Anggota household lain tetap menerima respons duplikat generik tanpa
  job, draft, receipt id, atau identitas uploader.
- Retry tidak pernah dipicu otomatis dan tidak pernah membuat transaction. Review
  editable dan konfirmasi simpan tetap jalur yang sama dengan OCR sukses.
- Tidak ada recovery multipart same-job di T-012. Request retry tidak menerima file
  dan tidak mengganti byte receipt. Jika gambar tersimpan tidak tersedia, tidak ada
  job baru dan tidak ada panggilan model; user memilih `Isi manual` atau upload baru
  lewat `Pilih struk lain`.
- Ketersediaan gambar tidak di-preflight ke client. Tidak ada `receiptImageAvailable`
  atau `BlobStore.exists`; server membaca Blob secara lazy saat retry dan memetakan
  kegagalan baca menjadi `OCR_IMAGE_UNAVAILABLE`.
- Urutan percobaan memakai `OcrJob.attempt`, bukan `createdAt`. Klaim retry mengambil
  row lock `Receipt`, memeriksa ulang job terbaru, lalu mengalokasikan attempt
  berikutnya; partial unique `PROCESSING` hanya defense in depth.
- Intent `?add=1` adalah intent sekali pakai. Penutupan memakai `router.replace` dan
  mempertahankan `month`/`view=trash`; setelah simpan, perilaku view yang ada tetap
  dan hanya satu pembaruan URL yang boleh menang.
- Batas ukuran upload 4MB (D-10) — amandemen atas keputusan awal 5MB (batas platform).

## Out of Scope

- Sinkronisasi bank, recurring transaction, OCR PDF, multi-struk sekaligus,
  edit massal, impor CSV.
- Recovery multipart same-job untuk T-012: mengirim ulang file ke endpoint retry,
  mengganti byte pada `storage_key` yang sama, atau membuat `Receipt` baru dari retry.
- Field DTO `receiptImageAvailable` dan preflight `BlobStore.exists`.
