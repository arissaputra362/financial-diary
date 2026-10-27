# Spec: Tema Gelap Mengikuti Sistem

**Status:** Draft, menunggu sign-off UI/UX Designer dan persetujuan PM  
**Tanggal:** 2026-10-27  
**PRD:** Pengalaman UI lintas fitur yang sudah ada  
**Design source:** Addendum dark mode pada `docs/design/01-design-system-tokens.md` (belum tersedia)

## Overview

Aplikasi menyediakan tampilan terang dan gelap untuk seluruh layar, dengan pilihan awal mengikuti preferensi warna sistem operasi/peramban. Pengguna dapat mengganti mode secara manual melalui pengaturan tampilan di halaman Profil. Tujuannya menjaga kenyamanan baca tanpa mengubah alur, data, akses, atau navigasi yang sudah ada.

## User Flow

1. Pengguna membuka aplikasi; jika belum memilih mode manual, aplikasi mengikuti preferensi sistem.
2. Seluruh layar aplikasi memakai mode yang dipilih.
3. Di halaman Profil, pengguna dapat memilih Sistem, Terang, atau Gelap.
4. Pilihan manual tersimpan di browser dan diterapkan pada semua route. Pilihan Sistem mengikuti perubahan preferensi perangkat saat aplikasi terbuka.

## Behavior Detail

### AC-DARK-1: Sistem menjadi pilihan awal dan pilihan yang dapat dipulihkan

- **Kondisi:** belum ada pilihan manual tersimpan, atau pengguna memilih `Sistem`.
- **Yang terjadi:** tampilan terang/gelap mengikuti preferensi sistem; perubahan preferensi diterapkan tanpa reload.
- **Yang tidak boleh terjadi:** default aplikasi bertentangan dengan preferensi sistem atau pilihan Sistem berhenti mengikuti perubahan OS.

### AC-DARK-2: Pengguna dapat memilih mode manual

- **Kondisi:** pengguna membuka pengaturan Tampilan di halaman Profil.
- **Yang terjadi:** kontrol aksesibel menyediakan `Sistem`, `Terang`, dan `Gelap`; pilihan berlaku langsung di semua route dan bertahan setelah halaman dimuat ulang.
- **Yang tidak boleh terjadi:** perubahan pilihan mengubah data/izin atau memerlukan reload.

### AC-DARK-3: Cakupan semua layar dan state

- **Kondisi:** layar, layout, atau komponen aplikasi dirender.
- **Yang terjadi:** tema konsisten pada route publik, autentikasi, route terlindungi, not-found/error/loading, navigasi, kartu, formulir, sheet/dialog, toast, tabel/daftar, grafik, dan seluruh state interaktif.
- **Yang tidak boleh terjadi:** komponen utama tertinggal dengan permukaan terang atau teks yang tidak terbaca dalam tema gelap.

### AC-DARK-4: Keterbacaan dan makna warna

- **Kondisi:** teks, batas, fokus, status, kategori, atau visualisasi data tampil pada kedua tema.
- **Yang terjadi:** kontras memenuhi WCAG AA untuk teks dan kontras non-teks yang bermakna; warna income/expense, kategori, error, warning, sukses, fokus, dan pilihan tetap bisa dibedakan serta tidak bergantung pada warna saja.
- **Yang tidak boleh terjadi:** pasangan warna gagal kontras, status hanya dikenali dari warna, atau warna tema mengubah arti data.

### AC-DARK-5: Perilaku non-tema tetap sama

- **Kondisi:** pengguna memakai aplikasi dalam tema terang atau gelap.
- **Yang terjadi:** route, konten, izin, kalkulasi, fokus keyboard, state formulir, dan semua aksi tetap berperilaku sama. Cetak laporan tetap memakai format cetak yang dirancang.
- **Yang tidak boleh terjadi:** perubahan tema memengaruhi data atau akses, menambah kontrol tema, menyimpan preferensi aplikasi, atau mengubah kontras/konten cetak.

## Edge Case

- Perangkat tanpa dukungan `prefers-color-scheme` mendapat tampilan terang yang aman.
- Perubahan preferensi sistem saat aplikasi terbuka langsung tercermin.
- Pilihan manual mengalahkan preferensi sistem sampai pengguna memilih Sistem kembali.
- Jika penyimpanan browser tidak tersedia, pilihan masih berlaku selama sesi saat ini.
- Konten yang sengaja memakai permukaan brand gelap (misalnya navigasi navy dan kartu wallet) tetap mempertahankan hierarki serta keterbacaan yang disetujui desain.
- Grafik, SVG, placeholder, disabled state, overlay, native form controls, dan halaman tanpa AppShell ikut diperiksa.
- Mode kontras tinggi dan `prefers-reduced-motion` yang sudah berlaku tidak mengalami regresi.

## Constraint Bisnis

- Tidak ada perubahan API, database, autentikasi, izin, kalkulasi, route, atau perilaku produk.
- Pilihan awal adalah Sistem; pilihan manual Terang/Gelap disimpan secara lokal di browser, bukan ke server.
- Semua pasangan warna tema harus ditetapkan dan disetujui dalam design system sebelum implementasi.

## Out of Scope

- Sinkronisasi preferensi tema antarperangkat atau penyimpanan preferensi di akun.
- Redesign layout, tipografi, ikonografi, maupun informasi produk.
- Perubahan warna cetak/PDF.

## Review Gates

- UI/UX Designer: perlu menerbitkan dan menandatangani addendum token dark mode pada design system, termasuk pasangan kontras dan perlakuan aksen/kategori/grafik. User meminta implementasi langsung pada 2026-10-27; persetujuan desain formal tidak dicatat terpisah.
- Persetujuan pengguna untuk implementasi diberikan pada 2026-10-27; nomor task register eksternal belum ditetapkan.
- QA: memverifikasi acceptance criteria pada kedua tema, state penting, dan ukuran layar proyek sebelum PM release approval.
