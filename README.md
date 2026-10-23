Aplikasi web mobile-first untuk keluarga, pelajar, dan orang awam mencatat
pemasukan, pengeluaran, dan target tabungan. Dibangun dengan Next.js (App Router)
dan Tailwind CSS v4.

## Menjalankan proyek

Proyek ini memakai [Bun](https://bun.sh) sebagai package manager.

```bash
bun install        # pasang dependensi
bun run dev        # jalankan server pengembangan di http://localhost:3000
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

## Perintah lain

```bash
bun run lint       # periksa gaya kode
bun run build      # build produksi
bun run test       # unit test (vitest)
bun run test:e2e   # smoke test responsif (Playwright)
bun run seed:institutions  # isi katalog bank resmi dari snapshot OJK
```

## Katalog bank resmi

Katalog bank resmi diisi oleh seeder statis versioned, bukan sinkronisasi
otomatis. Sumber: daftar publik OJK "Daftar Alamat Kantor Pusat Bank Umum dan
Syariah", file Juni 2026 (SHA-256
`4e87b30794245952ecb982bb03cf9ccdb294ed1b08498ab3715621a313d63b50`).
Snapshot berisi 105 baris bank unik; provenance disimpan pada level bulan
(`source_period = "2026-06"`), bukan hari yang dikarang. Waktu import
operasional memakai timestamp baris (`created_at`/`updated_at`).

```bash
bun run seed:institutions
```

Seed repeatable: rerun tidak membuat duplikat, menonaktifkan baris yang hilang,
dan tidak pernah hard-delete. Tidak ada cron, job refresh, tombol sync, atau
admin UI katalog. Detail kontrak ada di
`docs/dev-plan/feat-bank-institutions.md`.

## Struktur

- `app/` — halaman dan layout App Router.
- `components/` — komponen UI bersama (`ui/`, `layout/`).
- `lib/` — utilitas bersama (mis. `format.ts` untuk format rupiah).
- `docs/` — dokumen produk (PRD, spec, dev plan, design, ADR, ERD).

Panduan lengkap untuk agen dan kontributor ada di `AGENTS.md`.
