# Flowchart & Skema Alur — Financial Planner MVP

**Penulis:** PM / System Analyst
**Tanggal:** 2026-09-30
**Status:** Draft — menunggu review dev
**Sumber:** `docs/architecture-decisions.md`, `docs/erd/erd-database-schema.md`, kontrak DTO/API

Dokumen ini mendefinisikan behavior flow yang menjadi acuan Spec (Langkah 2 DDD)
dan bahan test scenario QA. Detail teknis (nama fungsi, file) ada di Dev Plan.

---

## 1. Alur Proses Document Driven Development (proses kerja tim)

```mermaid
flowchart TD
    A[PM: buat PRD.md] --> G1{Gate 1:\nPRD Approved?}
    G1 -->|tidak| A
    G1 -->|ya| B[PM: buat Spec per fitur]
    B --> G2{Gate 2:\nSpec Ready?}
    G2 -->|tidak| B
    G2 -->|ya| C[Dev: buat Dev Plan\nliving document]
    C --> G3{Gate 3:\nPlan Approved?}
    G3 -->|tidak| C
    G3 -->|ya| D[Dev: eksekusi coding\nisi Progress Log tiap sesi]
    D --> E[QA: check terhadap AC Spec]
    E --> G4{QA Pass?}
    G4 -->|fail| F[Dev: perbaiki\nmaks 2 loop]
    F --> E
    G4 -->|pass| G[PM: Release Approval\ncatat di Dev Plan]
    D -. deviasi behavior .-> B
```

Aturan: tidak ada coding tanpa Dev Plan Approved; deviasi behavior wajib update Spec
dulu; lebih dari 2 loop QA→Fix eskalasi ke PM.

## 2. Arsitektur Request Lifecycle (Service → Repository → Model)

```mermaid
flowchart LR
    Client[Client] -->|HTTP| RH[Route Handler\napp/api]
    RH -->|validasi Zod + auth check| SVC[Service\nlib/server/services]
    SVC -->|panggil dengan householdId scope| REPO[Repository\nlib/server/repositories]
    REPO -->|Prisma query| DB[(PostgreSQL Neon\nprisma/schema.prisma)]
    REPO -->|model rows| SVC
    SVC -->|DTO camelCase| RH
    RH -->|JSON + error typed| Client
```

Aturan layer:

| Layer | Boleh | Dilarang |
|---|---|---|
| Route Handler | auth check, validasi Zod, panggil service, mapping error → HTTP | query DB langsung, business logic |
| Service | business rules, soft delete semantics, kalkulasi, idempotency, audit event | import Prisma client |
| Repository | akses Prisma, WAJIB terima `householdId` scope, default filter `deleted_at IS NULL` | ekspos method unscoped ke route handler |
| Model | schema, constraint, index, relasi | logika apa pun |

## 3. Alur Auth & Household Approval

### 3.1 Signup user pertama (jadi Owner)

```mermaid
flowchart TD
    A[POST /api/auth/signup] --> B{Ada invite code\nin request?}
    B -->|tidak, user pertama| C[Validasi input]
    C --> D{Email sudah\nterdaftar?}
    D -->|ya| E[409 EMAIL_TAKEN]
    D -->|tidak| F[TRANSAKSI: insert user\n+ insert household\n+ insert membership OWNER APPROVED\n+ append membership_event]
    F --> G[Create session + JWT cookie]
    G --> H[Return AuthStateDTO\nnextAction: OPEN_HOME]
    B -->|ya, via invite| I[Validasi invite:\nhash match, belum redeemed,\nbelum revoked, belum expired]
    I -->|invalid| J[400 INVALID_INVITE]
    I -->|valid| K[TRANSAKSI: insert user\n+ redeem invite conditional update\n+ insert membership PENDING\n+ append event REQUESTED]
    K --> L[Create session + JWT cookie]
    L --> M[Return AuthStateDTO\nnextAction: WAIT_FOR_APPROVAL]
```

### 3.2 Login & revalidasi per request

```mermaid
flowchart TD
    A[POST /api/auth/login] --> B{Kredensial valid?}
    B -->|tidak| C[401 INVALID_CREDENTIALS]
    B -->|valid| D[Create session row + JWT cookie\nsid = session.id]
    D --> E{Status membership?}
    E -->|APPROVED| F[nextAction: OPEN_HOME]
    E -->|PENDING| G[nextAction: WAIT_FOR_APPROVAL]
    E -->|DECLINED / REVOKED| H[nextAction: SIGN_IN_AGAIN\ntanpa data ledger]

    subgraph Setiap request protected
        P1[JWT verify signature + exp] --> P2{Valid?}
        P2 -->|tidak| P3[401 harus login ulang]
        P2 -->|valid| P4[Load session by sid:\naktif, tidak expired, tidak revoked]
        P4 --> P5{Session valid?}
        P5 -->|tidak| P3
        P5 -->|valid| P6[Load membership by user_id]
        P6 --> P7{Status APPROVED?}
        P7 -->|tidak| P8[403 ACCESS_PENDING /\nACCESS_DECLINED / ACCESS_REVOKED]
        P7 -->|valid| P9[Lanjut ke service\ndengan householdId scope]
    end
```

### 3.3 Owner approve/decline/revoke

```mermaid
flowchart TD
    A[Owner: POST /api/family/members/id/approve] --> B{Caller = OWNER\ndi household yang sama?}
    B -->|tidak| C[403 FORBIDDEN]
    B -->|ya| D{Status target PENDING?}
    D -->|tidak| E[409 INVALID_STATE_TRANSITION]
    D -->|ya| F[TRANSAKSI: update membership\nPENDING → APPROVED\n+ append membership_event]
    F --> G[Return MembershipDTO]
    G --> H[Anggota mendapat akses\npada request protected BERIKUTNYA\nbukan sesi yang sedang jalan]
```

Transisi valid: `PENDING → APPROVED`, `PENDING → DECLINED`,
`APPROVED → REVOKED`. Owner tidak bisa di-decline/di-revoke via flow member.
Transisi lain = `409 INVALID_STATE_TRANSITION`.

## 4. Alur Transaksi Manual

```mermaid
flowchart TD
    A[User buka form tambah] --> B[Input: type, amount,\ncategory, date, note]
    B --> C[POST /api/transactions\ndengan Idempotency-Key]
    C --> D{Validasi Zod}
    D -->|gagal| E[422 + fieldErrors\nbahasa awam]
    D -->|valid| F{Idempotency-Key\nsudah ada?}
    F -->|ya, hash sama| G[Replay response asli]
    F -->|ya, hash beda| H[409 IDEMPOTENCY_CONFLICT]
    F -->|tidak| I[TRANSAKSI: claim key\n+ insert transaction\n+ simpan response snapshot\n+ commit]
    I --> J{type = TRANSFER?}
    J -->|ya| K[Service buat 2 baris:\nMONEY_OUT + MONEY_IN\ntransfer_group_id sama\natomik]
    J -->|tidak| L[1 baris]
    K --> M[201 TransactionDTO]
    L --> M
```

Validasi: `amount_minor > 0`, `occurred_at` tidak di masa depan, category dari
daftar valid, type dari enum. Error memakai format
`{ error: { code, message, fieldErrors } }`.

## 5. Alur OCR (review sebelum save — WAJIB)

```mermaid
flowchart TD
    A[User pilih gambar struk] --> B{Ukuran ≤ 4 MB\n(4.194.304 byte) dan mime valid?}
    B -->|tidak| C[422 FILE_INVALID]
    B -->|valid| D[Hitung sha256 konten]
    D --> E{sha256 sudah ada\ndi household ini?}
    E -->|ya| F[409 DUPLICATE_RECEIPT\nreturn job existing]
    E -->|tidak| G[Upload ke Vercel Blob\n+ insert receipt + ocr_job PROCESSING]
    G --> H[Panggil Gemini gemini-2.5-flash\nJSON structured output\ndengan timeout eksplisit]
    H --> I{Hasil?}
    I -->|sukses + valid| J[ocr_job SUCCEEDED\ndraft = result_json]
    I -->|timeout / rate limit| K[ocr_job FAILED\ntyped error]
    I -->|output tidak valid| L[ocr_job FAILED\nADVISOR/OCR_INVALID_OUTPUT]
    J --> M[Return job + draft\nTIDAK ada transaction tersimpan]
    M --> N[User review form editable:\namount, date, merchant, category]
    N --> O{User konfirmasi save?}
    O -->|edit + save| P[POST /api/transactions\nsource=OCR, receiptId\n+ Idempotency-Key]
    O -->|batal| Q[Tidak ada yang tersimpan\nkecuali receipt + job]
    P --> R[201 TransactionDTO]
```

Invariant: **endpoint OCR tidak pernah membuat transaction.** Simpan hanya terjadi
lewat `POST /api/transactions` dengan konfirmasi eksplisit user.

## 6. Alur Soft Delete / Undo / Restore

```mermaid
flowchart TD
    A[User hapus transaction/goal] --> B[POST /api/transactions/id/trash\natau /api/goals/id/trash]
    B --> C{Record aktif milik\nhousehold ini?}
    C -->|tidak| D[404 NOT_FOUND\npesan tidak membocorkan\nkeberadaan record]
    C -->|ya| E[Set deleted_at + deleted_by_user_id]
    E --> F[200 + undo toast 5 detik di UI]
    F --> G{User undo dalam 5 detik?}
    G -->|ya| H[POST restore:\nclear deleted_at + deleted_by_user_id]
    G -->|tidak| I[Record masuk trash view]
    I --> J[GET /api/transactions/trash\natau /api/goals/trash]
    J --> K[Restore dari trash:\n200 ALREADY_ACTIVE jika\nrecord ternyata sudah aktif]
```

Invariant: query aktif selalu `deleted_at IS NULL`; trash view hanya record deleted;
permanent deletion tidak ada di MVP (termasuk untuk owner).

## 7. Alur Savings Goal

```mermaid
flowchart TD
    A[User buat goal] --> B{target_amount_minor > 0?}
    B -->|tidak| C[422 VALIDATION_ERROR]
    B -->|ya| D[201 GoalDTO progressPercent]
    D --> E[Update saved amount:\natomic increment\nsaved_amount_minor = saved_amount_minor + X]
    E --> F[Progress display capped 100%\nDB tidak di-cap]
    F --> G[Dashboard menampilkan progress bar]
```

## 8. Alur Advisor Insight

```mermaid
flowchart TD
    A[User minta insight\nPOST /api/advisor/insights] --> B{Ada cache unexpired\nuntuk household?}
    B -->|ya| C[Return delivery=CACHE\nUI wajib tampilkan label cached]
    B -->|tidak| D[Panggil Gemini dengan\nperiod start/end + timeout]
    D --> E{Hasil?}
    E -->|sukses + valid| F[Persist insight\nprune maks 10 terbaru per household]
    F --> G[Return delivery=FRESH]
    E -->|rate limit| H[429 ADVISOR_RATE_LIMITED\n+ cache bila ada]
    E -->|timeout / unavailable| I[503 ADVISOR_UNAVAILABLE\n+ cache bila ada]
    E -->|output tidak valid| J[422 ADVISOR_INVALID_OUTPUT]
    G --> K[UI tampilkan headline, summary,\nactions, limitations, source period]
```

Invariant: tidak ada chat history; hanya insight sukses terbaru yang dipersist;
advice selalu tampilkan source period + limitations; tidak ada jaminan finansial.

## 9. Alur Dashboard

```mermaid
flowchart TD
    A[GET /api/dashboard] --> B[Auth + membership revalidation]
    B --> C[Service hitung:\nbalanceMinor = sum MONEY_IN - sum MONEY_OUT\naktif, seluruh waktu]
    C --> D[monthlyBudget: lookup household_budget\nperiod bulan berjalan Asia/Jakarta\nspentMinor = sum MONEY_OUT periode itu\nTRANSFER tidak dihitung]
    D --> E[spending.byDay: bucket MONEY_OUT\nper hari kalender, timezone aplikasi]
    E --> F[goals: daftar aktif + progressPercent capped]
    F --> G[recentActivity: transaksi terbaru\nfilter lokal type/source/from/to/cursor]
    G --> H[Return DashboardDTO\nserver adalah sumber kebenaran\nclient tidak menghitung ulang]
```

## 10. Matriks Flow → Spec → QA

| Flow | Spec | Skenario QA utama |
|---|---|---|
| §3 Auth & approval | feat-auth-approval | signup pertama, invite invalid, pending tidak bisa akses ledger, approve/decline/revoke, expired session |
| §4 Transaksi manual | feat-transactions-ocr | validasi amount, idempotency replay/conflict, transfer 2 kaki |
| §5 OCR | feat-transactions-ocr | duplicate receipt, review sebelum save, low confidence, timeout |
| §6 Soft delete | feat-trash-restore | trash → undo → restore, ALREADY_ACTIVE, isolasi trash |
| §7 Goals | feat-goals-advisor | target 0 ditolak, atomic increment, cap 100% |
| §8 Advisor | feat-goals-advisor | FRESH vs CACHE, rate limit, invalid output |
| §9 Dashboard | feat-dashboard | balance benar, spentMinor tanpa TRANSFER, filter lokal cocok dengan rows |