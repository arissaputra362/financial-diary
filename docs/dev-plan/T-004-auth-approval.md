# Dev Plan: Auth & Household Approval

Detail teknis implementasi. Ini dokumen utama yang dibaca Claude Code saat generate kode. Berisi semua keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-auth-approval.md`
- PRD: `docs/PRD.md#fitur-1-auth-household-approval`
- ADR terkait: ADR-002 (JWT + session), ADR-004 (invite lifecycle), ADR-006 (layer)
- ERD: `docs/erd/erd-database-schema.md` §3.1–§3.6, §4 (D-4, D-5)
- Flow: `docs/erd/flowcharts.md` §3
- AC (verification-matrix): AC-F1-1 … AC-F1-7
- Engineer: Developer · Estimasi: 3 hari · Status: Draft

## Ringkasan Teknis

Auth custom invite-only: JWT `jose` (HS256) membawa `sid`, dipasangkan dengan session
row DB yang dapat dicabut. Role dan `household_id` **selalu** dibaca dari DB per request
(tidak ada di JWT). Layer terdampak: Route Handler (`app/api/auth`, `app/api/family`) →
Service (`lib/server/services`) → Repository (`lib/server/repositories`) → Prisma.
`proxy.ts` (edge) hanya verifikasi tanda tangan + `exp`; revalidasi penuh di route handler
(Node runtime). Bootstrap owner, redeem invite, dan transisi membership memakai
interactive transaction singkat.

## Schema Database

> Disalin dari ERD §3.1–§3.6. Tidak ada kolom baru. Constraint `*` = raw SQL di migration.

### Tabel: `user`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | uuid(7) |
| email | varchar | UNIQUE, NOT NULL | dinormalisasi lowercase + trim di aplikasi |
| password_hash | varchar | NOT NULL | bcryptjs; jangan pernah plaintext |
| display_name | varchar | NOT NULL | ≤60 (A-20) |
| created_at / updated_at | timestamptz | NOT NULL | UTC (`@db.Timestamptz`) |

### Tabel: `household`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| name | varchar | NOT NULL | ≤80 (A-20) |
| owner_user_id | uuid | FK → user, NOT NULL | owner juga punya membership APPROVED |
| created_at / updated_at | timestamptz | NOT NULL | |

Index: `idx(owner_user_id)`.

### Tabel: `membership`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| user_id | uuid | FK → user, NOT NULL | |
| role | enum | NOT NULL | `OWNER \| MEMBER` |
| status | enum | NOT NULL | `PENDING \| APPROVED \| DECLINED \| REVOKED` |
| invited_by_user_id | uuid | FK → user, nullable | |
| invite_id | uuid | FK → invite, nullable | |
| requested_at | timestamptz | nullable | |
| approved_at / approved_by_user_id | | nullable | |
| declined_at / declined_by_user_id | | nullable | |
| revoked_at / revoked_by_user_id | | nullable | |
| decision_reason | varchar | nullable | ≤200 (A-20) |
| created_at / updated_at | timestamptz | NOT NULL | |

Constraint:
- `UNIQUE(user_id, household_id)` — satu baris per pasangan; DECLINED/REVOKED re-request
  flip status baris yang sama.
- `UNIQUE(user_id) WHERE status IN ('PENDING','APPROVED')` `*` — partial unique index
  (satu membership aktif per user; D-5). **DILARANG** plain `UNIQUE(user_id)`.
- `idx(household_id, status)`.

### Tabel: `invite`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| code_hash | varchar | UNIQUE, NOT NULL | sha256; plaintext hanya di response create |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| expires_at | timestamptz | NOT NULL | created_at + 7 hari |
| redeemed_at | timestamptz | nullable | |
| redeemed_by_user_id | uuid | user, nullable | |
| revoked_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL | |

Index: `idx(household_id, created_at desc)`.

### Tabel: `membership_event`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| membership_id | uuid | FK → membership, NOT NULL | |
| household_id | uuid | FK → household, NOT NULL | |
| actor_user_id | uuid | FK → user, NOT NULL | |
| event_type | enum | NOT NULL | `REQUESTED \| APPROVED \| DECLINED \| REVOKED` |
| previous_status | enum | nullable | |
| next_status | enum | nullable | |
| reason | varchar | nullable | |
| created_at | timestamptz | NOT NULL | immutable — tanpa updated_at |

Index: `idx(membership_id)`, `idx(household_id, created_at desc)`. Append-only.

### Tabel: `session`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | **sama dengan claim `sid` JWT** |
| user_id | uuid | FK → user, NOT NULL | |
| token_version | varchar | NOT NULL | konstanta `"v1"` di MVP |
| expires_at | timestamptz | NOT NULL | created_at + 7 hari (absolut) |
| revoked_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL | |
| last_seen_at | timestamptz | NOT NULL | |

Index: `idx(user_id)`, `idx(expires_at)` (purge). **TANPA `household_id`** (D-4).

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

- `UserRepository.findByEmail(email): User | null`
- `UserRepository.create(data): User`
- `HouseholdRepository.create(data): Household`
- `MembershipRepository.findActiveByUserId(userId): Membership | null`
- `MembershipRepository.findByUserAndHousehold(userId, householdId): Membership | null`
- `MembershipRepository.create(data): Membership`
- `MembershipRepository.updateStatus(id, patch): Membership`
- `MembershipRepository.listByHousehold(householdId): Membership[]`
- `MembershipEventRepository.append(data): MembershipEvent`
- `InviteRepository.create(data): Invite`
- `InviteRepository.findByCodeHash(codeHash): Invite | null`
- `InviteRepository.redeemConditional(id, userId): number` (rowcount; anti-race)
- `InviteRepository.revoke(id): Invite`
- `SessionRepository.create(data): Session`
- `SessionRepository.findById(sid): Session | null`
- `SessionRepository.touch(id): void` (last_seen_at)
- `SessionRepository.revoke(id): void`
- `SessionRepository.purgeExpired(): void`

Semua method yang menyentuh data ledger **wajib** menerima `householdId` scope
(ADR-006). Method auth di atas di-scope per `user_id`.

### Service Interface (`lib/server/services/`)

- `AuthService.signup(input): { user, membership, nextAction }` — bootstrap owner ATAU redeem invite
- `AuthService.login(email, password): { user, membership, nextAction }`
- `AuthService.logout(sid): void`
- `AuthService.me(userId): { user, household, role, status }`
- `AuthService.revalidate(sid): { userId, householdId, role }` — dipakai tiap request protected
- `FamilyService.createInvite(actor, householdId): { invite, plaintextCode }`
- `FamilyService.listMembers(actor, householdId): MembershipDTO[]`
- `FamilyService.approve(actor, membershipId): MembershipDTO`
- `FamilyService.decline(actor, membershipId, reason?): MembershipDTO`
- `FamilyService.revoke(actor, membershipId, reason?): MembershipDTO`

### HTTP Contract

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/auth/signup` | POST | Public | `{ email, displayName, password, inviteCode? }` | `AuthStateDTO` + Set-Cookie |
| `/api/auth/login` | POST | Public | `{ email, password }` | `AuthStateDTO` + Set-Cookie |
| `/api/auth/logout` | POST | Authenticated | - | `204` + clear cookie |
| `/api/auth/me` | GET | Authenticated | - | `{ user, household, role, status }` |
| `/api/family/members` | GET | Approved owner/member | - | `MembershipDTO[]` |
| `/api/family/invites` | POST | Owner | - | `{ invite, plaintextCode }` |
| `/api/family/members/{membershipId}/approve` | POST | Owner | - | `MembershipDTO` |
| `/api/family/members/{membershipId}/decline` | POST | Owner | `{ reason? }` | `MembershipDTO` |
| `/api/family/members/{membershipId}/revoke` | POST | Owner | `{ reason? }` | `MembershipDTO` |

`AuthStateDTO` = `{ user: { id, email, displayName }, household: { id, name } | null, role, status, nextAction }`.
`nextAction` ∈ `OPEN_HOME | WAIT_FOR_APPROVAL | SIGN_IN_AGAIN` (A-07: `CREATE_HOUSEHOLD` dihapus).

### Validasi Rules (Zod, `lib/server/validation/`)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| email | required, email, dinormalisasi lowercase+trim | "Masukkan alamat email yang benar." |
| displayName | required, trim, 1..60 | "Nama tidak boleh kosong dan maksimal 60 karakter." |
| password | required, min 8 | "Kata sandi minimal 8 karakter." |
| inviteCode | optional, string | (invalid → 400 INVALID_INVITE, bukan fieldError) |
| reason | optional, ≤200 | "Alasan maksimal 200 karakter." |

## Async & Queue

Tidak ada async untuk fitur ini. Semua operasi sinkron dalam request. Purge session
expired bersifat oportunistik (dipanggil saat login/revalidate), bukan worker.

## Test Scenario (BDD)

### Unit (Service — mock Repository)

- it creates user + household + OWNER membership in one transaction and returns `OPEN_HOME` (AC-F1-1)
- it rejects password shorter than 8 with a plain-language field error (AC-F1-1)
- it redeems a valid invite and creates a PENDING membership + REQUESTED event (AC-F1-2)
- it returns identical `INVALID_INVITE` body for wrong/expired/revoked/redeemed (AC-F1-3)
- it rejects a non-owner calling approve/decline/revoke with 403 (AC-F1-5)
- it rejects an invalid transition with `INVALID_STATE_TRANSITION` (AC-F1-5)
- it refuses to decline/revoke a membership whose role is OWNER (AC-F1-5)
- it revalidates membership per request and returns `ACCESS_PENDING` for PENDING (AC-F1-4, AC-F1-7)
- it issues a new `sid` on every login (anti session fixation) (AC-F1-6)

### Feature (Route Handler)

- it renders/returns `OPEN_HOME` on first signup without invite (AC-F1-1)
- it returns `WAIT_FOR_APPROVAL` on signup via valid invite (AC-F1-2)
- it returns 400 `INVALID_INVITE` for each of the four causes with equal body (AC-F1-3)
- it returns 403 typed for PENDING/DECLINED/REVOKED on ledger routes, but allows `/api/auth/me` + logout (AC-F1-4)
- it appends exactly one membership_event per approve/decline/revoke (AC-F1-5)
- it sets HttpOnly/Secure/SameSite=Lax cookie and reissues on protected request (AC-F1-6)
- it returns 401 when `session.expires_at` is past (AC-F1-6)
- it revokes the DB session and clears the cookie on logout (AC-F1-6)
- it grants access on the next protected request after approval; removes it after revoke (AC-F1-7)
- it asserts JWT claims = `{sub,sid,token_version,iat,exp}` (no role/household_id) (AC-F1-7)

### Integration

- it completes the full owner-bootstrap → invite → redeem → approve → access flow end-to-end (AC-F1-1..AC-F1-7)
- it enforces the partial unique index under concurrent redeem (only one succeeds) (AC-F1-2)
- it isolates household A from household B (cross-household → 404, not 403) (AC-F1-4)

## Task Breakdown

### Database & Model

- [ ] `prisma/schema.prisma`: model `User`, `Household`, `Membership`, `Invite`, `MembershipEvent`, `Session` sesuai §Schema Database
- [ ] Enums: `MembershipRole`, `MembershipStatus`, `MembershipEventType`
- [ ] Migration + raw SQL appendix: partial unique index membership, `idx` sesuai ERD
- [ ] `@db.Timestamptz` eksplisit; `onDelete: Restrict` semua FK
- [ ] Factory/fixture untuk testing (UUID deterministik dari fixtures-seed-plan)

### Repository

- [ ] Interface + implementasi Prisma untuk 6 repository di §Repository Interface
- [ ] `redeemConditional` memakai conditional update + cek rowcount (anti-race)
- [ ] Factory/injection manual di `lib/server/` (dependency injection eksplisit, bukan binding framework)

### Service

- [ ] `AuthService` (signup/login/logout/me/revalidate) sesuai §Service Interface
- [ ] `FamilyService` (createInvite/listMembers/approve/decline/revoke)
- [ ] Bootstrap owner + redeem invite dalam satu interactive transaction
- [ ] `lib/server/errors.ts`: error bertipe + mapping HTTP (`{ error: { code, message, fieldErrors } }`)
- [ ] Unit test: sesuai §Test Scenario > Unit

### HTTP

- [ ] Zod schema: sesuai §Validasi Rules
- [ ] Route Handlers `app/api/auth/*` + `app/api/family/*` (Node runtime)
- [ ] `proxy.ts` (edge): verifikasi tanda tangan + `exp` saja
- [ ] Helper auth: revalidasi session + membership per request; reissue cookie (sliding)
- [ ] Feature test: sesuai §Test Scenario > Feature

### Frontend

- [ ] Halaman `/login`, `/signup`, `/waiting-for-approval`, `/family` (milik T-004/T-005; konsumsi kontrak ini)

### Async (jika ada)

- [ ] Tidak ada.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-01 | T-003: schema User/Household/Membership/Invite/MembershipEvent/Session + repository auth (user, household, membership, membership_event, invite, session) | Persis ERD §3.1–§3.6; partial unique membership aktif via raw SQL migration; session TANPA household_id (D-4); kontrak Zod auth di `lib/server/contracts/auth.ts` |
| 2026-10-01 | T-004: jose + bcryptjs; AuthService + FamilyService + errors; route handlers; proxy; auth screens; family/profile screens | `bun run test`, `bun run lint`, `bun run build` lulus; JWT claims sesuai ADR-002; bcryptjs; invite SHA-256; sliding session; tidak ada @google/genai/@vercel/blob |
| 2026-10-05 | T-004 hardening: AuthService ditulis ulang dengan repo bundle + `AuthTransaction` (bootstrap owner & redeem invite dalam SATU `prisma.$transaction`); infra dipecah `session.ts` (JWT/cookie) + `http.ts` (parse/respond) + `auth.ts` (komposisi/context); `FamilyService` memperbaiki transisi `APPROVED→REVOKED` dan guard owner; `proxy.ts` menolak JWT hilang/invalid dengan 401 envelope; unit + feature test ditambahkan | 134/134 test hijau (43 test baru: service auth/family, session, akses, route handler); lint + build hijau; frontend diperbaiki (kontrak `AuthStateDTO` langsung, polling A-29, nama anggota); `MembershipDTO.user` di-join untuk halaman Keluarga |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-01 | bcryptjs dipertahankan sebagai password hasher; jose HS256 dengan session DB; session sliding dengan TTL JWT 15 menit dan absolut DB 7 hari | Selaras ADR-002 dan AC-F1-6 | Tidak ada |
| 2026-10-05 | Service menerima `AuthRepositories` + `AuthTransaction`; produksi memakai `prisma.$transaction`, unit test memakai pass-through runner | Memenuhi "satu interactive transaction" (ADR-006) sekaligus tetap teruji tanpa DB | Tidak ada |
| 2026-10-05 | Revoke hanya `APPROVED→REVOKED`; approve/decline hanya dari `PENDING`; target OWNER selalu 409 tanpa event | AC-F1-5 ("Hapus akses" pada anggota aktif) | Tidak ada |
| 2026-10-05 | Pesan login seragam ("Email atau kata sandi salah.") untuk email tidak ada maupun kata sandi salah | Constraint Bisnis: tidak membedakan kedua penyebab | Tidak ada |
| 2026-10-05 | `proxy.ts` menolak JWT hilang/invalid pada route API dengan 401 envelope; verify di edge tetap tanda tangan + `exp` saja | ADR-002 (runtime split) tanpa akses DB di edge | Tidak ada |

## QA Log

| Tanggal | AC diuji | Hasil | Catatan |
|---|---|---|---|
| (diisi QA) | | | |

## Open Questions

- Tidak ada. Semua kontrak merujuk A-01..A-35, ERD, dan ADR-001..008.