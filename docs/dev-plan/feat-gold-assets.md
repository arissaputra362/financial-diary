# Dev Plan: Tabungan Logam Mulia & Emas Perhiasan (Fitur 8)

**Developer:** Agent Dev · **Tanggal:** 2026-10-25 · **Status:** In Progress
**Spec:** `docs/spec/feat-gold-assets.md`
**PRD:** `docs/PRD.md#fitur-8-tabungan-logam-mulia--emas-perhiasan`

---

## 1. Rencana Tahapan Kerja

1. **Langkah 1: Database & Migrasi Prisma**
   - Tambah enum `GoldAssetType` (`BULLION`, `JEWELRY`) dan `GoldBrand` (`ANTAM`, `UBS`, `LOTUS_ARCHI`, `GALERI_24`, `OTHER`).
   - Tambah model `GoldAsset` (dengan `weightMilligrams`, `purityPermille`, `buyPriceMinor`, `scope`, `receiptId`, `deletedAt`).
   - Tambah model `GoldMarketPrice` (cache harga harian).
   - Generate Prisma Client (`bunx prisma generate`).
   - Terapkan migrasi ke database.
2. **Langkah 2: Core Contracts, Helpers & Services**
   - DTO & Types: `types/gold.ts`.
   - Math helpers: konversi gram <-> miligram, kalkulasi valuasi buyback, dan PnL.
   - Provider harga: `lib/server/services/gold-price.ts` (mengambil data harga Antam/UBS dengan caching dan graceful fallback).
   - Repository & Service: `lib/server/repositories/gold.ts`, `lib/server/services/gold.ts`.
   - Vision Scanner: `lib/server/providers/gold-vision.ts` dengan schema JSON terstruktur via `@google/genai`.
3. **Langkah 3: API Route Handlers**
   - `GET /api/gold/prices`
   - `GET /api/gold/assets`
   - `POST /api/gold/assets` (dengan Idempotency-Key)
   - `POST /api/gold/scan` (menerima gambar certicard / nota)
   - `DELETE /api/gold/assets/[id]` (soft delete)
   - `POST /api/gold/assets/[id]/restore` (undo/restore)
4. **Langkah 4: UI Components**
   - Kartu Bento di Dashboard: `components/dashboard/gold-savings-card.tsx`.
   - Modal/Drawer Form Tambah & Review Scan: `components/gold/gold-asset-modal.tsx`.
   - Integrasi di halaman Beranda (`app/(dashboard)/home/page.tsx`).
   - Integrasi di tab Ringkasan/Laporan.
5. **Langkah 5: Pengujian (QA & Automated Tests)**
   - Unit tests: kalkulasi PnL, konversi miligram, normalisasi kadar.
   - Integration tests: isolasi household/user, soft delete & restore.
   - Regression run: memastikan 533 test yang ada tetap 100% pass.

---

## 2. Progress Log

| Waktu | Komponen | Status | Catatan |
|---|---|---|---|
| 2026-10-25 | Spec & PRD | Done | AC-F8-1 s.d. AC-F8-10 disetujui PM di PRD & docs/spec/feat-gold-assets.md |
| 2026-10-25 | Prisma & DB Migration | Done | Model GoldAsset & GoldMarketPrice ditambahkan, migrasi 20261025120000_gold_assets dibuat |
| 2026-10-25 | Service & Provider | Done | GoldPriceService, GoldRepository, GoldService, dan GoldVisionProvider selesai |
| 2026-10-25 | API Route Handlers | Done | /api/gold/prices, /api/gold/assets, /api/gold/scan, soft-delete & restore live |
| 2026-10-25 | UI Components | Done | GoldSavingsCard (Bento Beranda), GoldAssetModal (Manual & Scan), GoldReportSection (Ringkasan) |
| 2026-10-25 | Testing & Build | Done | 52 test suites (540 tests) pass 100%, Next.js Turbopack build pass |

---

## 3. Keputusan Teknis (Architectural Decisions)

| ID | Keputusan | Rasionalisasi |
|---|---|---|
| D-G1 | Berat disimpan dalam `weight_milligrams Int` | Menghindari floating point rounding error (1 gram = 1000 mg) |
| D-G2 | Uang disimpan dalam `buy_price_minor Int` (skala 0) | Sesuai kaidah IDR scale 0 proyek |
| D-G3 | Cache harga di `gold_market_price` per hari | Harga ritel emas Antam/UBS berubah 1x sehari, menghemat bandwidth dan kuota luar |
| D-G4 | Failover ke harga historis terbaru berlabel `isStale: true` | Aplikasi tetap berfungsi jika penyedia harga luar timeout |
| D-G5 | OCR scan wajib lewat Review Form | Menjaga prinsip Human-in-the-Loop, tidak ada auto-commit data AI |
