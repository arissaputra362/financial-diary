# Dev Plan: Tema Gelap Mengikuti Sistem

**Status:** Implementasi selesai; QA/release review formal masih menunggu  
**Tanggal:** 2026-10-27  
**Engineer:** Developer  
**Estimasi:** 1-2 hari implementasi dan verifikasi visual setelah gate terpenuhi

## Referensi

- Spec: `docs/spec/feat-dark-mode.md`
- Design system: `docs/design/01-design-system-tokens.md` (addendum dark mode belum disetujui)
- Project rules: `AGENTS.md` Â§4, Â§6, Â§7, Â§9.1

## Ringkasan Teknis

Gunakan CSS custom properties semantik sebagai sumber warna seluruh UI. Bootstrap ringan sebelum paint menentukan preferensi Sistem/Terang/Gelap dari localStorage, lalu CSS memakai palet yang terpilih. Kontrol di Profil menyimpan pilihan manual dan Sistem mengikuti perubahan OS. Migrasikan warna literal di class Tailwind dan style inline yang menyampaikan peran tema ke token; pertahankan ilustrasi data yang memang dekoratif.

## Keputusan dan Gate

| Status | Keputusan |
|---|---|
| Disetujui pengguna | Pilihan mode Sistem/Terang/Gelap; Sistem mengikuti preferensi OS, mode manual disimpan lokal. |
| Implementasi | Nilai token gelap mengikuti hue brand yang sudah ada; kontras, status, kategori, grafik, permukaan navy/blue/green, overlay, focus ring, dan native controls diverifikasi. |
| Catatan workflow | Pengguna meminta implementasi langsung pada 2026-10-27. Design sign-off formal dan task ID register eksternal belum dicatat. |
| QA | Verifikasi seluruh AC sebelum release approval. |

## Ruang Implementasi

- `app/globals.css`: semantic color properties, dark media query, `color-scheme`, status/focus/surface mapping; print tetap eksplisit.
- `app/layout.tsx` dan metadata/manifest bila diperlukan untuk warna browser chrome yang konsisten dengan sistem tanpa menjalankan kode tema client.
- `components/**` dan `app/**`: ganti warna literal terkait permukaan/teks/border dengan utility token semantik; audit inline SVG, grafik, skeleton, overlay, dan gaya khusus halaman.
- `docs/design/01-design-system-tokens.md`: hanya UI/UX Designer yang mengubah dokumen desain kanonik; developer tidak akan mengeditnya sebelum sign-off.

## Interface & Contract

- Tidak ada perubahan API atau schema database; kontrol mode menambah state client lokal dan satu bagian pengaturan Profil.
- Token CSS semantik menjadi kontrak styling bersama untuk latar halaman, permukaan/kartu, teks utama/sekunder, border/divider, input, status, fokus, dan data visualization.
- Bootstrap sebelum paint membaca preferensi lokal, kemudian `prefers-color-scheme`; HTML tetap sama pada server dan client agar tidak ada hydration mismatch.
- Sistem menanggapi event `matchMedia` ketika preferensi OS berubah; pilihan manual tidak mengikuti perubahan itu.

## Test Scenario (BDD)

### QA / Browser

- Semua acceptance criteria Spec terpenuhi untuk pilihan Sistem/Terang/Gelap.
- Pilihan tema tersimpan setelah reload; Sistem kembali mengikuti preferensi OS; kegagalan localStorage tidak membuat layar tidak dapat dipakai.
- Perubahan media preference saat halaman tetap terbuka mengubah semua token tanpa reload.
- Route publik, login/waiting, seluruh route utama, error/not-found/loading, serta modal/sheet/toast diperiksa.
- State kosong, loading, error, disabled, selected, success, dan focus keyboard tetap terbaca.
- Layout tidak overflow pada viewport proyek 390px dan 1280px.
- Kontras token diverifikasi untuk text AA dan non-text bermakna; warna kategori dan chart tetap dapat dibedakan.
- Laporan cetak tetap memakai warna/kontras cetak yang sudah ditetapkan.
- Uji regresi unit, typecheck/lint/build, serta browser/e2e yang relevan dijalankan menurut QA test plan proyek.

## Task Breakdown

### Implementasi

- [x] Tambahkan semantic token light/dark dan bootstrap preferensi sebelum paint.
- [x] Tambahkan pengaturan Profil Sistem/Terang/Gelap dengan persistensi lokal dan event sistem.
- [x] Migrasikan kelas warna hardcoded dan warna inline pada seluruh route/komponen.
- [x] Audit komponen bersama, state, visualisasi, overlay, navigasi, form controls, metadata, dan print.
- [x] Perbarui living docs/progress log pada sesi implementasi.

### Verifikasi & rilis

- [x] Jalankan pemeriksaan otomatis yang relevan dan browser visual QA untuk kedua tema.
- [ ] Perbaiki defect dan sediakan bukti QA per AC.
- [ ] QA sign-off.
- [ ] PM mencatat release approval dan memperbarui status task.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-27 | Audit repo dan draft Spec/Dev Plan | Belum ada coding. Menunggu design sign-off; Spec/Dev Plan belum disetujui. |
| 2026-10-27 | Pengguna menyetujui implementasi langsung dan meminta pilihan manual | Spec diperluas ke Sistem/Terang/Gelap; implementasi berjalan atas instruksi langsung, sign-off desain formal belum dicatat. |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-27 | Usulan media query CSS `prefers-color-scheme`; tanpa theme provider/local storage | Digantikan setelah pengguna meminta pilihan manual | Tidak |
| 2026-10-27 | Simpan pilihan Sistem/Terang/Gelap di localStorage; bootstrap menetapkan atribut HTML sebelum paint | Persistensi lokal memberi override manual tanpa API/DB; nilai media disubscribe untuk mode Sistem | Spec diperbarui atas permintaan pengguna |

| 2026-10-27 | Tema global dan kontrol manual diterapkan; build, typecheck, lint terpilih, dan e2e dijalankan | Build, `tsc --noEmit`, lint file terkait lolos. E2E tema lolos 6/6 pada mobile/tablet/desktop; proses perlu dihentikan saat cleanup server dev macet. Full lint masih melaporkan 6 error lama pada GoldSavingsCard, GoldAssetModal (3), GoldPageView, dan BottomNav. QA klik kontrol Profil belum tervalidasi karena fixture signup mendapat HTTP 500 dari API/DB lokal; perilaku preferensi diverifikasi browser melalui storage dan perubahan OS. QA/release sign-off formal belum dicatat. |
