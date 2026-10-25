# Spec: Tabungan Logam Mulia & Emas Perhiasan

**Penulis:** PM / System Analyst · **Tanggal:** 2026-10-25 · **Status:** Spec Ready
**PRD:** `docs/PRD.md#fitur-8-tabungan-logam-mulia--emas-perhiasan`
**AC yang di-cover:** AC-F8-1 s.d. AC-F8-10
**Bergantung pada:** `feat-dashboard.md` (Bento card), `feat-wallets.md` (Scope Pribadi vs Bersama), `feat-reporting.md` (Ringkasan aset), `feat-transactions-ocr.md` (Gemini Vision Review Flow)

## Overview

Fitur pencatatan dan pemantauan tabungan aset fisik keluarga berupa **Logam Mulia Batangan (Antam, UBS, Galeri 24, Lotus Archi)** dan **Emas Perhiasan (Cincin, Kalung, Gelang, Anting)** dengan integrasi acuan harga pasar harian, pemindaian sertifikat/nota berbasis AI (Gemini Vision), perhitungan akumulasi portofolio, serta visualisasi terintegrasi di Beranda dan Laporan Ringkasan.

Prinsip utama:
1. **Pemisahan Aset Illiquid vs Kas Cair**: Emas adalah aset tabungan/investasi fisik, bukan saldo kas operasional belanja. Nilainya tidak dicampuradukkan dengan cash flow bulanan, melainkan disajikan sebagai *Asset Valuation* dan *Net Worth*.
2. **Presisi Mutlak**: Berat gramasi disimpan dalam satuan miligram (`weight_milligrams Int`) untuk menghindari isu pembulatan desimal. Nominal uang dalam rupiah penuh (skala IDR 0).
3. **Human-in-the-Loop**: Seluruh hasil pemindaian AI (scan kemasan certicard / nota toko emas) disajikan dalam Review Form; tidak ada auto-save.
4. **Resilient Price Fetching**: Harga pasar Antam dan UBS disimpan sebagai snapshot harian di database. Saat provider timeout atau limit tercapai, gunakan snapshot terbaru dengan tanggal dan status stale yang tetap terlihat; jangan mengganti harga kosong dengan angka baseline buatan.

---

## User Flow

1. User membuka **Beranda (Dashboard)** → melihat Bento Card *"Tabungan Emas & Logam Mulia"* yang memuat total estimasi nilai (Rp), total gramasi (gr), pergerakan tren harga, serta tombol `Tambah Emas` dan `Pindai Foto`.
2. **Alur Tambah Manual:**
   - User klik `Tambah Emas` → Sheet form terbuka.
   - User memilih tipe (Logam Mulia / Perhiasan), brand, berat gram, kadar kemurnian, harga beli, tanggal beli, dan scope (`Pribadi` / `Bersama`).
   - Simpan → data tersimpan dan kartu Beranda terupdate seketika.
3. **Alur Pindai AI (Certicard / Nota):**
   - User klik `Pindai Foto` → unggah atau jepret foto certicard batangan atau nota toko emas.
   - Gemini Vision memproses gambar dan mengekstraksi informasi barang (brand, berat, kadar, nomor seri, harga nota).
   - Form Review terbuka dengan data terisi otomatis untuk diverifikasi dan dikoreksi oleh pengguna.
   - User menekan `Simpan ke Tabungan Emas` → data tersimpan.
4. **Alur Pemantauan Nilai & Ringkasan:**
   - Sistem otomatis menghitung taksiran nilai pasar hari ini berdasarkan buyback Antam/UBS dan acuan kadar perhiasan.
   - User melihat *unrealized gain/loss* (keuntungan/kerugian tabungan emas dibanding modal beli).
   - Di tab **Ringkasan (Laporan)**, aset emas muncul di blok komposisi kekayaan.
5. **Alur Hapus & Undo:**
   - User menghapus aset emas → soft delete (`deleted_at` terisi) → toast undo 5 detik muncul.

---

## Behavior Detail

### AC-F8-1: Klasifikasi & Scope Aset
- Tipe aset:
  - `BULLION` (Logam Mulia Batangan): Brand (ANTAM, UBS, LOTUS_ARCHI, GALERI_24, OTHER), nomor seri (opsional).
  - `JEWELRY` (Emas Perhiasan): Karat (24K, 22K, 18K/750, 17K/700, 10K/375), nama barang (Cincin, Kalung, dll.).
- Scope: `PERSONAL` (hanya terlihat oleh pemilik akun) dan `SHARING` (terbuka untuk seluruh anggota approved household).

### AC-F8-2: Presisi Data (Miligram & Minor Units)
- Berat disimpan sebagai integer miligram: `weight_milligrams Int` (1.00 gram = 1000 mg; 0.50 gram = 500 mg).
- Kadar disimpan dalam permille: `purity_permille Int` (24K = 999, 18K = 750, 17K = 700).
- Harga beli disimpan dalam rupiah minor unit: `buy_price_minor Int` (skala 0).

### AC-F8-3: Integrasi Harga Harian & Caching
- Endpoint internal `GET /api/gold/prices` menyajikan harga beli dan buyback untuk brand yang digunakan aset aktif. Alamat dasar provider dan API key dikonfigurasi melalui `GOLD_PRICE_API_BASE_URL` dan `GOLD_PRICE_API_KEY`; pemilihan brand/source/berat dilakukan di service.
- Harga berhasil di-cache per brand dan tanggal dalam tabel `gold_market_price`; tabel `gold_price_fetch_state` mencegah permintaan provider diulang berkali-kali pada hari yang sama.
- Jika provider luar gagal diakses atau limit tercapai, server mengembalikan snapshot tanggal terbaru berlabel `isStale: true`. Bila belum ada snapshot, harga dikembalikan kosong, bukan angka baseline.

### AC-F8-4: Formulir Input Manual
- Validasi form Zod: berat > 0, modal beli >= 0, tanggal beli valid.
- Memberikan kalkulasi taksiran instan di sisi client saat mengisi formulir.

### AC-F8-5: Pemindaian Gambar Certicard Logam Mulia
- Endpoint `POST /api/gold/scan` menerima file gambar (certicard Antam/UBS/dll.).
- Gemini Vision mengekstrak serial number, brand, gramatur, dan fineness.
- Hasil dikembalikan sebagai draft DTO ke Review Sheet di client.

### AC-F8-6: Pemindaian Nota Toko Emas Perhiasan
- Endpoint `POST /api/gold/scan` membaca foto faktur/nota fisik toko perhiasan emas.
- Mengekstrak nama toko, tanggal transaksi, deskripsi perhiasan, kadar karat/persentase, berat gram, dan harga total pembelian.
- Disajikan di Review Sheet untuk konfirmasi pengguna.

### AC-F8-7: Formula Valuasi Pasar & Unrealized PnL
- Logam Mulia: `valuasi = (weight_milligrams / 1000) * harga_buyback_brand`.
- Perhiasan: `valuasi = (weight_milligrams / 1000) * (purity_permille / 1000) * harga_dasar_buyback`.
- Keuntungan/Kerugian: `pnl_nominal = valuasi - buy_price_minor`; `pnl_percent = (pnl_nominal / buy_price_minor) * 100`.

### AC-F8-8: Kartu Beranda (Bento Dashboard)
- Kartu menampilkan Total Estimasi Nilai Emas (Rp), Total Berat (gram), indikator PnL (hijau bila profit, merah bila minus), dan tren harga pasar hari ini.
- Mendukung filter scope `Bersama` dan `Pribadi` sesuai konteks Beranda.

### AC-F8-9: Integrasi Laporan Ringkasan
- Tab Ringkasan menampilkan seksi Aset Tabungan Emas berdampingan dengan Saldo Kas Cair untuk memberikan gambaran total kekayaan bersih (*Net Worth*).

### AC-F8-10: Soft Delete & Restore
- Penghapusan aset menerapkan `deleted_at = now()`.
- Toast Undo 5 detik mengembalikan aset (`deleted_at = null`).
- Terisolasi per household dan per scope user.
