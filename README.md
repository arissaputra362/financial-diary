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
```

## Struktur

- `app/` — halaman dan layout App Router.
- `components/` — komponen UI bersama (`ui/`, `layout/`).
- `lib/` — utilitas bersama (mis. `format.ts` untuk format rupiah).
- `docs/` — dokumen produk (PRD, spec, dev plan, design, ADR, ERD).

Panduan lengkap untuk agen dan kontributor ada di `AGENTS.md`.
