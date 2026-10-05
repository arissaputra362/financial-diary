# ADR-002: Auth Custom — JWT `jose` + Session Database (Sliding Session)

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

Aplikasi membutuhkan autentikasi invite-only dengan kemampuan mencabut akses segera
(logout, revoke anggota, incident response) tanpa menunggu JWT kedaluwarsa. Requirement
menyediakan opsi Neon Auth / Supabase Auth, tetapi keputusan PM 2026-09-30 memilih auth
custom. ERD menetapkan tabel `session` **tanpa** `household_id` (D-4) dan claims JWT
tanpa `role` (A-04). Next.js 16 memisahkan runtime edge (proxy) dari runtime Node
(route handler).

## Keputusan

Gunakan **auth custom**: JWT ditandatangani `jose` (HS256) yang membawa `sid`, dipasangkan
dengan **session row di database** yang dapat dicabut; role dan household **selalu**
dibaca dari DB per request.

## Alasan & Alternatif

- Dipilih karena: session DB memberi pencabutan instan (logout/revoke) yang tidak bisa
  diberikan JWT stateless murni; `jose` edge-safe sehingga verifikasi tanda tangan bisa
  dilakukan di `proxy.ts`.
- Alternatif A — **Neon Auth / Supabase Auth** (tidak dipilih): menambah vendor dan
  model identitas eksternal yang tidak diperlukan untuk invite-only satu household;
  keputusan PM memilih kontrol penuh server-side.
- Alternatif B — **JWT stateless tanpa session DB** (tidak dipilih): tidak bisa mencabut
  sesi sebelum expiry; melanggar AC-6 (logout mencabut sesi server-side).
- Alternatif C — **Server Actions untuk mutasi** (tidak dipilih): kontrak `Idempotency-Key`
  pada POST mutation lebih bersih di Route Handlers; Server Actions menyulitkan kontrol
  header dan replay response.

## Trade-off

- Positif: pencabutan instan, secret tetap server-side, verifikasi edge-safe, kontrol
  penuh atas cookie dan lifecycle.
- Negatif: setiap request protected menyentuh DB (session + membership) — biaya round-trip
  yang diterima demi keamanan; sliding session menambah satu `Set-Cookie` per request.

## Detail Implementasi (kontrak)

- **Claims JWT:** `{ sub, sid, token_version, iat, exp }` — **TANPA `role`** (A-04).
  Role **selalu** dari DB per request. `token_version` = konstanta `"v1"` di MVP.
- **Sliding session (A-03):** JWT TTL **15 menit**; setiap request protected yang lolos
  revalidasi **me-reissue cookie JWT baru** dengan `sid` yang sama. Sesi absolut **7 hari**
  (`session.expires_at`); melewati 7 hari → 401 wajib login ulang. **TANPA route refresh
  terpisah** — renewal terjadi otomatis via reissue.
- **TANPA `session.household_id`** (D-4): nilai itu 100% derivable dari membership saat
  request; menyimpannya = risiko stale data (setelah REVOKED, baris session masih menunjuk
  household) → potensi kebocoran lintas household. Per request: session by `sid` (PK) →
  membership by `user_id` → `household_id`.
- **Anti session fixation:** login **selalu** membuat session row baru (`sid` baru).
- **Cookie:** `HttpOnly` + `Secure` + `SameSite=Lax`. `Set-Cookie` reissue memakai flag
  yang sama.
- **Password hashing:** pilih **`bcryptjs`** (murni JS, tanpa native build, aman di
  runtime Node Vercel; cost factor default) — dipilih di atas `node:crypto` scrypt karena
  API sederhana, tanpa ketergantungan native, dan cukup untuk MVP. (Alternatif scrypt
  dicatat di A-24; keputusan final di sini: `bcryptjs`.)
- **Next.js 16 runtime split:**
  - **`proxy.ts` (edge-safe):** verifikasi tanda tangan + `exp` JWT saja (tanpa akses DB).
  - **Route handler (Node.js runtime):** revalidasi penuh — load session by `sid`
    (aktif, tidak expired, tidak revoked) → load membership by `user_id` → cek status
    `APPROVED` → lanjut ke service dengan `householdId` scope.
- **Mutasi via Route Handlers** (bukan Server Actions) karena kontrak `Idempotency-Key`
  dan kebutuhan replay response yang deterministik.
- **Status non-approved:** `PENDING`/`DECLINED`/`REVOKED` hanya boleh `GET /api/auth/me`
  dan `POST /api/auth/logout`; route ledger lain → 403 `ACCESS_PENDING` /
  `ACCESS_DECLINED` / `ACCESS_REVOKED`.
- **Logout:** set `session.revoked_at` di DB + hapus cookie (revocation per-session;
  perangkat lain tetap aktif).

## Referensi

- `docs/spec/feat-auth-approval.md` — AC-4, AC-6, AC-7, Constraint Bisnis
- `docs/erd/erd-database-schema.md` §3.6 (session), §4 (D-4)
- `docs/architecture-decisions.md` — A-03, A-04, A-24
