# Flowchart & Skema Alur — Financial Diary MVP

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

---

## 11. Draft Amendment — Wallet F6 flows (T-009)

**Status:** Draft, Developer (T-009) · **2026-10-09** · **Pending PM approval.**
**Efek:** menambah/mengamandemen §4 (transaksi manual), §5 (OCR), §6 (soft delete), dan §9 (dashboard) untuk wallet. Bila bertentangan, section ini menang. Skenario test tetap milik QA (`docs/qa/user-journey-map.md` §10, W1..W14); section ini hanya alur kontrak.

### 11.1 Buat / ubah / arsip wallet

```mermaid
flowchart TD
    A[User: Buat dompet] --> B{Anggota APPROVED?}
    B -->|tidak| C[403 ACCESS_PENDING/DECLINED/REVOKED]
    B -->|ya| D{Validasi: nama wajib <=80; tujuan <=80; opening >= 0}
    D -->|gagal| E[422 + fieldErrors, input terjaga]
    D -->|valid| F[TRANSAKSI: insert wallet\nscope default PERSONAL\nopening kosong = 0]
    F --> G[201 WalletDTO]
    H[User: Ubah dompet] --> I{scope?}
    I -->|SHARING| J[Semua APPROVED boleh ubah nama/tujuan]
    I -->|PERSONAL| K[Hanya pemilik]
    J --> L{Edit opening balance?}
    K --> L
    L -->|ada baris transaksi termasuk trashed / satu kaki transfer| M[422 WALLET_OPENING_BALANCE_LOCKED]
    L -->|belum ada baris, lock wallet row + re-check NOT EXISTS| N[Update opening]
    O[User: Arsipkan/Pulihkan] --> P{scope SHARING?}
    P -->|ya| Q{pembuat wallet atau Owner?}
    P -->|tidak| R{pemilik?}
    Q -->|tidak| S[403 ACCESS_DENIED]
    R -->|tidak| S
    Q -->|ya| T[Set/Clear archived_at, non-destruktif]
    R -->|ya| T
```

### 11.2 Money in/out dengan wallet

```mermaid
flowchart TD
    A[User: catat MONEY_IN / MONEY_OUT] --> B[Pilih wallet: hanya SHARING + PERSONAL milik caller, aktif]
    B --> C{Wallet valid, household sama, aktif?}
    C -->|tidak| D[404 NOT_FOUND / 422 WALLET_UNAVAILABLE]
    C -->|ya| E[TRANSAKSI: insert transaction + wallet_id]
    E --> F[Saldo wallet = opening + MONEY_IN aktif - MONEY_OUT aktif]
    F --> G[Baris trashed tidak dihitung; opening bukan aktivitas]
```

### 11.3 Transfer (termasuk lintas scope) + privasi

```mermaid
flowchart TD
    A[User: Transfer] --> B[Pilih fromWalletId + toWalletId, satu jumlah]
    B --> C{from != to; keduanya visible + aktif + household sama?}
    C -->|tidak| D[422 TRANSFER_INVALID / 404 NOT_FOUND]
    C -->|ya| E[TRANSAKSI: 2 kaki MONEY_OUT dari + MONEY_IN ke\ntransfer_group_id sama, jumlah+tanggal konsisten]
    E --> F{Aktor melihat kaki Pribadi?}
    F -->|ya, pemilik| G[DTO penuh kedua kaki]
    F -->|tidak| H[DTO generik sisi SHARING: jumlah+tanggal saja;\nwallet/note/receipt/transferGroupId = null]
    I[Trash/Restore transfer] --> J{Pasangan: scope?}
    J -->|PERSONAL-PERSONAL| K[hanya pemilik]
    J -->|SHARING-SHARING| L[semua APPROVED yang bisa akses]
    J -->|lintas scope| M[pembuat transfer atau Owner]
    K --> N[Atomic kedua kaki via transfer_group_id]
    L --> N
    M --> N
```

### 11.4 Dashboard & agregat wallet

```mermaid
flowchart TD
    A[GET /api/dashboard] --> B[Auth + APPROVED]
    B --> C[sharedBalanceMinor: wallet SHARING aktif+arsip\n= opening + MONEY_IN aktif - MONEY_OUT aktif]
    B --> D[personalBalanceMinor: wallet PERSONAL caller\naktif+arsip]
    C --> E[Dua angka terpisah, tidak dijumlahkan]
    D --> E
    E --> F[wallets: kartu aktif saja, penanda scope]
    G[Budget/grafik/advisor] --> H[Hanya MONEY_OUT aktif wallet SHARING termasuk arsip;\nkaki transfer dikecualikan; opening dikecualikan]
    H --> I[Cache advisor dibangun dari SHARING-only]
```

### 11.5 OCR wallet + dedup by uploader

```mermaid
flowchart TD
    A[Upload struk] --> B{sha256 sudah ada di household?}
    B -->|tidak| C[Simpan receipt + job; wallet TIDAK ditebak]
    B -->|ya| D{Uploader sama?}
    D -->|ya| E[Reuse job/draft milik sendiri]
    D -->|tidak| F[Respons generik: tanpa job/draft/uploader/receipt lama]
    C --> G[Review: user pilih wallet sebelum simpan]
    G --> H[POST /api/transactions source=OCR + walletId]
    H --> I[Akses receipt setelah simpan mengikuti wallet]
    B -. P2002 race .-> J[Re-read receipt lalu cabang uploader sama/lain]
```

### 11.6 Migrasi pre-wallet

```mermaid
flowchart TD
    A[Migrasi aktif] --> B[Additive: wallet + transaction.wallet_id nullable]
    B --> C[Backfill: per household lama\n1 wallet SHARING default system_key=legacy_default opening 0]
    C --> D[Update transaction.wallet_id WHERE wallet_id IS NULL\ntermasuk trashed + kedua kaki transfer, per household]
    D --> E[Verifikasi: nol NULL; paritas ledger; pasangan transfer utuh]
    E --> F[Enforce: NOT NULL + composite FK + index]
    F --> G[Cutover kode wallet]
```


## 12. Draft Amendment - Bank Institution flows (T-011)

**Sumber:** `docs/spec/feat-bank-institutions.md`, `docs/design/07-bank-institutions.md`, A-52..A-59, dan Dev Plan T-011.
**Efek:** menambah alur Quick Add, pemilihan institusi pada wallet, pembacaan label dengan privasi, dan update seed. Tidak mengubah alur transaksi, OCR, saldo, budget, goal, atau dashboard selain label metadata pada wallet.

### 12.1 Quick Add institusi privat

```mermaid
flowchart TD
    A[User: Tambah bank atau penyedia] --> B{APPROVED?}
    B -->|tidak| C[403 ACCESS_*]
    B -->|ya| D[Zod: name 1..80, trim]
    D --> E[Normalisasi: NFKC, trim, collapse whitespace, case-fold]
    E --> F{Nama sama dengan bank resmi aktif?}
    F -->|ya| G[409 INSTITUTION_ALREADY_EXISTS\nkind=OFFICIAL, existing=public row]
    F -->|tidak| H{Nama sama dengan entri privat aktif milik actor?}
    H -->|ya| I[409 INSTITUTION_ALREADY_EXISTS\nkind=CUSTOM, existing=own row]
    H -->|tidak| J{Ada entri privat arsip dengan nama sama?}
    J -->|ya| K[Reaktivasi baris arsip\narchived_at = null, 200]
    J -->|tidak| L[Insert baris privat baru, 201]
    K --> M[Entri tetap ada walau wallet dibatalkan]
    L --> M
```

### 12.2 Buat / ubah wallet dengan institusi

```mermaid
flowchart TD
    A[POST /api/wallets atau PATCH /api/wallets/id] --> B{Institution field?}
    B -->|omit| C[Create: manual, both null\nUpdate: label tidak berubah]
    B -->|NONE| D[Both null]
    B -->|OFFICIAL| E{Bank ada dan aktif?}
    B -->|CUSTOM| F{Entri milik actor dan aktif?}
    E -->|tidak| G[422 INSTITUTION_UNAVAILABLE]
    F -->|foreign/unknown| H[404 NOT_FOUND generik]
    F -->|archived| G
    E -->|ya| I[official_id = id, custom_id = null]
    F -->|ya| J[official_id = null, custom_id = id]
    C --> K[DB CHECK: at most one]
    D --> K
    I --> K
    J --> K
    K --> L[WalletDTO + institution]
```

### 12.3 Baca label wallet dan privasi

```mermaid
flowchart TD
    A[GET /api/wallets atau /api/wallets/id] --> B[Visibilitas wallet existing A-38]
    B --> C[Join official + custom TANPA filter aktif/arsip]
    C --> D{Institution null?}
    D -->|ya| E[institution = null, manual]
    D -->|tidak| F{Kind?}
    F -->|OFFICIAL| G[id + name]
    F -->|CUSTOM| H{actor = pemilik entri?}
    H -->|ya| I[id + name]
    H -->|tidak| J[id = null, name = label wallet]
    G --> K[WalletDTO]
    I --> K
    J --> K
    E --> K
    L[GET /api/institutions] --> M[official aktif + custom aktif milik session]
    M --> N[User lain tidak pernah menerima daftar privat actor]
```

### 12.4 Arsip dan update seed katalog

```mermaid
flowchart TD
    A[Pemilik: arsipkan entri] --> B[archived_at = now]
    B --> C[Entri hilang dari picker/daftar aktif]
    B --> D[Wallet lama tetap menampilkan label\njoin tanpa filter arsip]
    E[Developer/ops: update katalog] --> F[Unduh file OJK resmi terbaru]
    F --> G[Parse + validasi + normalisasi]
    G --> H{Konflik nama/kode?}
    H -->|ya| I[Gagal dan laporkan; jangan pilih diam-diam]
    H -->|tidak| J[Upsert by source_ref / normalized_name]
    J --> K[Nonaktifkan baris yang hilang, tanpa delete]
    K --> L[Catat source, source_url, source_period (YYYY-MM), seed_version]
```
