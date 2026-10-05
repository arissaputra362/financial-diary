# Dev Plan: T-002 Frontend Foundation (Penutupan)

Detail teknis implementasi penutupan scope T-002. Dokumen ini adalah living
document: Progress Log dan Keputusan Teknis diperbarui setiap sesi coding.

## Referensi

- Tiket: `../tickets/05-T-002-frontend-foundation.md`
- Design: `docs/design/01-design-system-tokens.md` (token, vocabulary, copy 404)
- AGENTS.md §4 (design tokens), §5 (Data Format: IDR scale 0), §6 (konvensi kode), §7 (antislop)
- Arch-dec: A-23 (test stack), A-24 (paket per task), A-31 (route kanonik), A-32 (write-lock)
- WO-004: `../tickets/WO-004-money-scale-fix.md` (bukti unit test tertunda)
- Engineer: Developer · Status: In Progress

## Ringkasan Teknis

Menutup sisa scope T-002: menambah test runner (vitest) + e2e smoke
(@playwright/test), unit test `lib/format.ts`, boundary `app/not-found.tsx`, dan
sinkronisasi README ke Bun. Kode fondasi (layout, primitives, nav interim, format
IDR scale 0) sudah ada dari sesi sebelumnya dan tidak diubah selain yang disebut.

## Interface & Contract

Tidak ada API/schema baru (di luar scope T-002). Kontrak yang relevan:

- Route kanonik aktif (A-31): `/`, `/transactions`, `/profile`. `/savings` dihapus.
- `lib/format.ts`: `formatIDR(amountMinor): string`, `formatSignedIDR(amountMinor): string`
  dengan IDR scale 0 (1 minor unit = 1 rupiah), string kanonik tanpa spasi setelah `Rp`.

## Test Scenario (BDD)

### Unit (vitest) — `lib/format.test.ts`

- it formats `0` as `Rp0` (both helpers)
- it formats `1`/`999` without separators (`Rp1`, `Rp999`; signed `+Rp1`, `+Rp999`)
- it groups thousands with dots (`Rp1.000.000`, `Rp1.250.000`; signed with `+`)
- it puts the minus sign before `Rp` (`-Rp1.250.000`)
- it never emits negative zero (`-0` and computed `0 * -1` → `Rp0`)

### E2E (Playwright) — `e2e/smoke.spec.ts`

- it returns 200 + visible heading for `/`, `/transactions`, `/profile`
- it returns 404 for `/savings` (regression guard WO-005)
- it shows the Indonesian 404 heading + live CTA to `/` on an unknown route
- it has no horizontal overflow at 390 and 1280
- it has no dead nav links (every visible nav `href` resolves < 400)
- it reaches a nav link via Tab with a visible focus outline

## Task Breakdown

### Test stack (A-23)

- [x] `bun add -d vitest @playwright/test` (hanya dua paket ini)
- [x] `package.json` scripts: `test`, `test:watch`, `test:e2e`
- [x] `vitest.config.mts` (alias `@` → root)
- [x] `playwright.config.ts` (testDir `e2e`, webServer `bun run dev`, 2 viewport)
- [x] `bunx playwright install chromium`

### Unit test

- [x] `lib/format.test.ts` (colocation) — kasus 0, 1, 999, 1.000.000, 1.250.000, negatif, −0

### Boundary

- [x] `app/not-found.tsx` (Bahasa Indonesia, CTA ke `/`)
- [x] Review `app/error.tsx` (reset berfungsi) + `app/loading.tsx` (skeleton)

### E2E smoke

- [x] `e2e/smoke.spec.ts` — 6 oracle

### Dokumentasi

- [x] `README.md` disinkronkan ke Bun

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-01 | Test stack (vitest + @playwright/test) | vitest@5.0.3, @playwright/test@1.63.0; chromium terpasang |
| 2026-10-01 | Unit test `lib/format.ts` | Bukti tertunda WO-004 dipindah ke sini dan dituntaskan |
| 2026-10-01 | `app/not-found.tsx` + review error/loading | error.tsx sudah punya reset; loading.tsx skeleton; tidak diubah |
| 2026-10-01 | E2E smoke | 6 oracle; 2 project viewport; 16 test hijau |
| 2026-10-01 | README → Bun | Menghapus boilerplate create-next-app |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-01 | webServer Playwright `bun run dev` + `reuseExistingServer: true` | Menghindari start server ganda saat dev sudah jalan | Tidak (A-23 sudah menetapkan stack) |
| 2026-10-01 | Dua project viewport: mobile 390×844, desktop 1280×800 | Sesuai AC T-002 (390px + desktop tanpa overflow) | Tidak |
| 2026-10-01 | `not-found.tsx` memakai `Card` + `Link` (bukan `Button`) | CTA harus navigasi nyata, bukan tombol mati (antislop) | Tidak |

## QA Log

| Tanggal | AC diuji | Hasil | Catatan |
|---|---|---|---|
| (diisi QA) | | | |

## Open Questions

- Tidak ada. Semua kontrak merujuk A-23/A-24/A-31 dan design 01.
