# ADR-004: Invite Lifecycle — Single-Use, Hash-Only, Redeem Anti-Race

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

Bergabung ke household existing wajib lewat invite yang dibuat Owner. Invite harus
auditable, tahan terhadap kebocoran kode, dan aman dari race condition saat dua request
redeem bersamaan. ERD menetapkan `invite.code_hash` unik dan aturan redeem conditional
update. Keputusan rapat menetapkan `INVALID_INVITE` = 400 dengan body identik (A-05) dan
rejoin user DECLINED/REVOKED ditunda (A-06).

## Keputusan

Invite adalah **single-use**, disimpan **hash-only (sha256)**, kedaluwarsa **7 hari**,
dan di-redeem lewat **conditional update anti-race + cek rowcount**; semua penyebab
invite invalid mengembalikan **400 `INVALID_INVITE` dengan body identik**.

## Alasan & Alternatif

- Dipilih karena: hash-only membatasi paparan bila kode bocor; single-use + expiry
  membatasi jendela penyalahgunaan; conditional update menutup race redeem ganda.
- Alternatif A — **simpan plaintext code** (tidak dipilih): kebocoran DB langsung
  membocorkan kode aktif.
- Alternatif B — **read-then-write redeem** (tidak dipilih): rentan race; dua request
  bersamaan bisa sama-sama lolos.
- Alternatif C — **multi-use invite** (tidak dipilih): memperluas paparan dan menyulitkan
  audit; MVP memilih single-use.

## Trade-off

- Positif: paparan minimal, redeem deterministik, audit jelas.
- Negatif: Owner harus membuat invite baru per anggota; kode hanya tampil sekali di
  response create (tidak bisa dilihat ulang).

## Detail Implementasi (kontrak)

- **Single-use:** `redeemed_at` di-set saat redeem; invite yang sudah redeemed tidak bisa
  dipakai lagi.
- **Hash-only:** hanya `code_hash` (sha256) yang dipersist; **plaintext code hanya
  dikembalikan sekali** di response create (`POST /api/family/invites`), tidak pernah
  disimpan atau ditampilkan ulang.
- **Expiry 7 hari:** `expires_at = created_at + 7 hari`.
- **Redeem anti-race:** conditional update
  `UPDATE ... WHERE id = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now()`
  dengan **cek rowcount** — bukan read-then-write. Rowcount 0 → invite invalid.
- **`INVALID_INVITE` = 400 (A-05):** body **identik** untuk semua penyebab (salah,
  expired, revoked, sudah dipakai) — QA assert kesetaraan `code` + `message`; tidak ada
  enumerasi kode yang berhasil.
- **Redeem membuat membership PENDING:** redeem **tidak pernah** memberi akses data;
  membership `PENDING` + event `REQUESTED` dibuat; akses hanya setelah Owner approve.
- **Rejoin DECLINED/REVOKED ditunda (A-06):** skema mendukung flip status pada baris
  membership yang sama, tetapi flow/route rejoin **tidak ada di MVP**.
- **Revocable:** Owner dapat mencabut invite yang belum dipakai (`revoked_at`).

## Referensi

- `docs/spec/feat-auth-approval.md` — AC-2, AC-3, Edge Case
- `docs/erd/erd-database-schema.md` §3.4 (invite), §5.4
- `docs/architecture-decisions.md` — Invite lifecycle, A-05, A-06
