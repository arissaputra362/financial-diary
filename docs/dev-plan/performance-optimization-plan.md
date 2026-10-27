# Performance Optimization Plan

## Feature Layer

```yaml
feature_id: PERF-001
feature_title: Mempercepat navigasi halaman dan penggunaan resource saat deploy
rationale: >
  Audit kode dan production build menunjukkan bahwa initial data masih diambil
  setelah hydration client, bundle transaksi memuat flow OCR secara statis, dan
  recovery OCR dapat mengirim ulang file sampai 4 MB setiap 2 detik.
priority: P0
status: draft
owner_role: planner
goal: >
  Mengurangi waktu tampil konten utama dan penggunaan bandwidth tanpa mengubah
  behavior, privacy boundary, atau kontrak API yang sudah ada.
scope_in:
  - Optimasi recovery/polling OCR tanpa upload ulang file
  - Optimasi initial data loading pada halaman authenticated
  - Code splitting untuk ReceiptScanner dan sheet terkait
  - Pengukuran query/API, bundle, TTFB, LCP, dan resource transfer
  - Optimasi konfigurasi cache/header yang aman untuk data authenticated
scope_out:
  - Mengganti provider database, AI, atau object storage
  - Mengubah aturan bisnis transaksi, OCR, auth, atau visibility data
  - Membuat background queue baru sebelum baseline latency tersedia
  - Cache publik untuk data per-user
changed_subsystems:
  - app router pages
  - client components
  - OCR API and service
  - server repositories/services
  - Next.js deployment configuration
  - tests and performance evidence
constraints:
  - Next.js 16 App Router dan TypeScript strict tetap digunakan
  - Bun adalah package manager
  - Data authenticated harus tetap private dan household-scoped
  - Receipt image tidak boleh menjadi public URL
  - Tidak boleh mengurangi validasi, idempotency, atau fail-closed behavior OCR
assumptions:
  - Deployment target tetap Vercel free tier
  - Database tetap PostgreSQL Neon
  - Receipt upload maksimum tetap 4 MB
  - Initial performance evidence lokal dapat direproduksi dari production build
open_questions:
  - URL deployment production yang akan dijadikan baseline
  - Region Vercel dan region Neon yang aktual
  - Apakah runtime deployment menyediakan observability p95/p99 API
  - Apakah status OCR saat ini diproses synchronous atau asynchronous di provider
risks:
  - Perubahan server/client boundary dapat menyebabkan hydration atau auth regression
  - Endpoint status OCR yang salah scope dapat membuka metadata job antar-user
  - Code splitting yang salah dapat menambah delay saat tab Scan struk dibuka
  - Cache header yang salah dapat mengekspos data authenticated
regression_risks:
  - Navigasi query `?month`, `?view`, dan `?add` berubah behavior
  - Recovery retry OCR menjadi stale atau memproses job yang salah
  - Sheet wallet tidak lagi membuka atau mengembalikan focus dengan benar
  - Dashboard menampilkan data lama setelah mutation
security_privacy_notes:
  - Semua status OCR harus diverifikasi terhadap actor/household server-side
  - Jangan menaruh token, session data, receipt bytes, atau personal DTO dalam cache publik
  - Jangan mengembalikan storage URL private secara langsung ke browser
non_functional_requirements:
  - OCR status check tidak mengirim ulang bytes file
  - Navigasi halaman utama menampilkan shell dan konten awal secepat mungkin
  - Initial transaction bundle tidak memuat OCR code sebelum tab Scan struk dipilih
  - Tidak ada penurunan coverage test pada behavior yang disentuh
milestones:
  - M0: Baseline production-like dan feature preparation gate
  - M1: OCR polling hemat bandwidth
  - M2: Initial data loading dan navigation latency
  - M3: Bundle splitting dan deploy headers
  - M4: Production verification dan rollback decision
timebox: TBD setelah production URL dan baseline tersedia
wiki_pages_to_read_before:
  - AGENTS.md
  - docs/adr/ADR-001-prisma-neon-adapter.md
  - docs/adr/ADR-002-auth-jwt-session.md
  - docs/adr/ADR-007-free-tier-deployment.md
  - docs/adr/ADR-008-receipt-storage-blob.md
  - docs/dev-plan/feat-transactions-ocr.md
wiki_pages_to_update_after:
  - docs/dev-plan/feat-transactions-ocr.md
  - docs/adr/ADR-007-free-tier-deployment.md
  - docs/architecture-decisions.md
wiki_facts_to_capture:
  - Endpoint dan kontrak status OCR final
  - Baseline dan hasil p95 API/TTFB/LCP
  - Bundle delta sebelum dan sesudah code splitting
  - Region deployment dan database
  - Cache policy final untuk authenticated routes
wiki_do_not_store:
  - Secrets
  - Session tokens
  - Receipt bytes or personal financial payloads
  - Raw production logs containing personal data
```

## Pre-Implementation Gate

```yaml
feature_preparation_path: docs/dev-plan/performance-optimization-plan.md
preimplementation_status: blocked
entry_rule: >
  Task implementasi tidak boleh berstatus ready atau in_progress sampai
  baseline production-like dan open questions yang mempengaruhi desain
  resolved atau dinyatakan sebagai external dependency.
```

### Gate checklist

- [x] Problem dan target surface sudah ditentukan.
- [x] Scope in/out dan forbidden behavior sudah ditentukan.
- [x] Temuan audit awal memiliki file/symbol evidence.
- [x] Build production lokal berhasil.
- [ ] URL deployment production tersedia.
- [ ] Baseline TTFB, LCP, request count, transfer size, dan p95 API tersedia.
- [ ] Region Vercel dan Neon dikonfirmasi.
- [ ] Kontrak status OCR tanpa upload ulang file disepakati.
- [ ] Strategi initial server data loading disepakati untuk tiap halaman.
- [ ] Rollout dan rollback owner ditentukan.

### Existing evidence

- `bun run build` berhasil pada `financial-planner-project`.
- Next.js 16.3.6 berhasil melakukan TypeScript check dan static page generation.
- Chunk JavaScript terbesar pada build lokal sekitar 229 KB raw dan 160 KB raw.
- `ReceiptScanner` mengirim ulang `FormData` berisi file pada recovery polling.
- Dashboard sudah menjalankan beberapa operasi repository secara paralel melalui `Promise.all`.
- Transaction indexes utama sudah tersedia pada `prisma/schema.prisma`.

### Task-scoped gate — PERF-006

- Authorization: user explicitly selected implementation of the primary fix (batch wallet lookup) on 2026-10-27.
- Production evidence: after the Vercel region change to Singapore, warm authenticated transaction and wallet API requests measured 96–150 ms. The test household had no transaction rows, so the sequential wallet-lookup path was not exercised in production.
- Design readiness: the batch query is household-scoped and does not change the DTO/API contract. The exact Neon region remains an external performance-validation dependency, not a design blocker for this repository change.
- The global ALARM-PERF-001 remains active for the broader PERF-001..005 initiative and does not claim populated-account or post-code-change production evidence.

## Active Alarms

```yaml
feature_active_alarms:
  - alarm_id: ALARM-PERF-001
    type: missing-production-evidence
    description: URL production dan metrik baseline belum tersedia.
    missing_to_replace: >
      URL deploy, region runtime/database, dan capture Web Vitals/API timing
      dari environment production atau staging yang setara.
    replacement_target: M0 baseline report dan verification artifacts.
    replacement_plan: >
      Jalankan smoke/performance capture pada deployment target sebelum task
      implementasi dimulai.
    blocks:
      - ready
      - in_progress
      - approved
      - done
feature_resolved_alarms:
  - alarm_id: ALARM-PERF-002
    resolved_by: >
      GET /api/ocr/receipts/{id}/job was added with uploader-only authorization
      and ReceiptScanner now polls that metadata endpoint without receipt bytes.
    verification: lib/server/services/ocr.test.ts and production build passed.
```

## Execution Log

```yaml
last_execution_at: 2026-10-27T11:04:52+07:00
current_phase: PERF-006-batch-wallet-lookup
current_task: PERF-006
current_status: needs_review
completed:
  - command: bun run build
    result: passed
    evidence: >
      Next.js 16.3.6 production build, TypeScript check, route collection,
      and static generation completed successfully.
  - command: bun run lint
    result: passed_with_existing_warnings
    evidence: >
      0 errors and 14 existing unused-variable warnings outside this
      performance initiative.
  - command: bun run test
    result: passed
    evidence: 47 test files and 480 tests passed.
  - artifact: local chunk inventory
    result: captured
    evidence: >
      Largest observed generated assets: 0bma92pht_c97.js 229156 bytes,
      2e_lrwr-bf1eq.js 159932 bytes, 0cz1d0mv5g_q7.js 112594 bytes,
      1obiw6kv1vmg3.css 71225 bytes.
  - artifact: production public-route baseline
    result: captured
    evidence: >
      URL https://financial-planner-nu-lake.vercel.app/ redirected unauthenticated
      traffic to /login. Navigation responseStart was 46.9 ms, DOMContentLoaded
      87.2 ms, loadEventEnd 177.3 ms, and document transferSize 4824 bytes.
      Deployment/runtime and database regions were supplied as Singapore.
  - implementation: OCR status polling
    result: completed_pending_review
    evidence: >
      Added GET /api/ocr/receipts/{id}/job with uploader-only authorization,
      changed ReceiptScanner recovery to request metadata by receiptId, and
      removed the retained File reference used only for duplicate polling uploads.
  - implementation: transaction bundle split
    result: completed_pending_review
    evidence: >
      AddTransactionSheet now dynamically imports ReceiptScanner only when the
      scan tab is rendered.
  - command: bun run test -- lib/server/services/ocr.test.ts
    result: passed
    evidence: 1 test file and 17 tests passed.
  - command: bun run build
    result: passed
    evidence: >
      Next.js production build and TypeScript validation passed with the new
      OCR route and dynamic import.
  - command: bun run lint
    result: passed_with_existing_warnings
    evidence: 0 errors and the same 13 existing warnings.
  - command: bun run test
    result: passed
    evidence: 47 test files and 481 tests passed after the implementation.
  - implementation: dashboard initial server load
    result: partial_in_current_source
    evidence: >
      Audit on 2026-10-27 found app/home/page.tsx renders DashboardView without
      initialData; DashboardView therefore fetches /api/dashboard after
      hydration. The prior completion entry is not reflected in current source.
  - implementation: client isolation smoke correction
    result: passed
    evidence: >
      The secret isolation smoke now distinguishes client modules from
      server-rendered app pages, allowing the server page to use server-only
      composition without weakening client bundle checks.
  - command: bun run test
    result: passed
    evidence: 47 test files and 481 tests passed after PERF-003.
  - command: bun run build
    result: passed
    evidence: >
      Production build passed with /home classified as a dynamic server route.
  - implementation: budget and transaction initial server load
    result: partial_in_current_source
    evidence: >
      /budget authenticates and loads shared/personal budget DTOs on the server.
      /transactions/page.tsx currently passes filters and view state but no
      initialData to ActivityView, so the initial list still fetches client-side.
      ActivityView supports initialData but the route does not supply it.
  - command: bun run test
    result: passed
    evidence: 47 test files and 481 tests passed after the initial-load changes.
  - command: bun run build
    result: passed
    evidence: >
      Production build passed with an increased Node heap after one transient
      worker out-of-memory during a parallel validation run.
  - artifact: authenticated production latency evidence
    result: captured
    evidence: >
      Fresh browser navigations observed authenticated request durations of
      approximately 1.6-3.1 seconds for auth/API calls and approximately
      4.2 seconds for the /home document response. These measurements are
      pre-deployment evidence for the current local changes, not post-change
      proof.
  - implementation: family server-side initial load
    result: completed_pending_review
    evidence: >
      /family now authenticates and loads the member list in the server page.
      The client view receives initial session/member DTOs and no longer starts
      with sequential /api/auth/me followed by /api/family/members requests.
      Mutation refresh behavior remains API-backed.
  - implementation: combined dashboard spending query
    result: completed_pending_review
    evidence: >
      Added an optional dashboard spending repository method. Production wiring
      reads shared and caller-owned personal MONEY_OUT rows in one transaction
      query, while test doubles retain a safe fallback to the existing scoped
      reads. Transfer and deleted rows remain excluded.
  - audit: source status as of 2026-10-27
    result: captured
    evidence: >
      PERF-002 metadata-only OCR status polling and PERF-004 ReceiptScanner
      dynamic import are present in current source. PERF-003 is only partial:
      /budget and /family receive server-loaded initial data, but /home still
      renders DashboardView without initialData and /transactions renders
      ActivityView without initialData. PERF-006 batch wallet lookup is present;
      its focused checks and required code/QA approvals remain pending.
  - command: bun run test
    result: passed
    evidence: 47 test files and 481 tests passed after Family and dashboard query changes.
  - command: bun run build
    result: passed
    evidence: >
      Production build and TypeScript validation passed; /family is now a
      dynamic server-rendered route.
not_completed:
  - authenticated production performance capture
  - post-change production bandwidth capture
  - security/code review and focused route integration test approval
  - command: bun run test:integration
    result: blocked_by_environment
    evidence: >
      Integration suite reported database access denied and the local-only
      harness refused the configured non-local database target. No integration
      result is treated as passing.
next_action: >
  Complete PERF-003 initial data for /home and /transactions, verify PERF-006
  with the focused repository/service checks, then restore a verified
  integration database and deploy to staging for authenticated network/Web
  Vitals comparison.
```

## Execution Governance

```yaml
orchestration_mode: sequential
mode: CODE-FIRST, NO-FICTION, ONE-TASK-ONLY
default_agent_sequence:
  - planner
  - implementer
  - reviewer
  - tester
  - docs_sync
max_review_loops: 2
no_fiction_policy:
  - Jangan mengarang angka production, hasil test, commit, atau approval.
  - Jika input wajib belum ada, task tetap blocked.
mock_policy:
  - Tidak boleh memakai mock untuk menggantikan provider/database dalam evidence performa.
  - Test doubles yang sudah menjadi pola unit test boleh tetap digunakan untuk unit behavior,
    tetapi tidak boleh diklaim sebagai hasil performa production.
placeholder_policy:
  - TBD hanya boleh berada di planning layer.
  - TBD pada acceptance evidence memblokir done.
alarm_propagation_policy:
  - Active alarms wajib disalin ke task prompt dan handoff sampai resolved.
prompt_policy:
  - Satu task satu prompt.
  - Prompt wajib memuat RESUME_FROM, scope_in, scope_out, forbidden_areas,
    active alarms, dan verification_strategy.
done_policy:
  - Dependencies selesai.
  - Code, review, test, rollback, dan docs evidence tersedia.
  - Commands_run hanya berisi command yang benar-benar dijalankan.
  - Task Register dan task block sinkron.
rollback_policy:
  - Jika regression ditemukan, pilih REVERT atau FORWARD_FIX.
  - Tidak boleh langsung berstatus done setelah test wajib gagal.
```

## Verification Strategy

### Baseline before implementation

Capture dan simpan hasil nyata untuk:

- route navigation `/home`, `/budget`, `/transactions`, `/family`;
- TTFB dan time-to-first-content;
- LCP dan CLS pada mobile 4G throttling;
- request count dan transferred bytes per route;
- response time p50/p95 untuk:
  - `GET /api/dashboard`
  - `GET /api/transactions`
  - `POST /api/ocr/receipts`
  - OCR status/recovery endpoint setelah tersedia;
- ukuran initial JavaScript dan route-specific chunks;
- ukuran receipt upload dan jumlah upload selama satu recovery flow.

### Required verification levels

- Unit: helper URL/status parsing dan polling state transitions.
- Integration: auth, household isolation, OCR job status, idempotency, and error mapping.
- E2E: navigation, add transaction, receipt scan, retry, wallet picker, and refresh behavior.
- Smoke: production or staging deployment with authenticated test account.
- Manual check: mobile network, focus trap, loading/error states, and cache headers.

### Planned commands

Commands are planned only; results must be recorded after execution:

```text
bun run lint
bun run test
bun run test:integration
bun run build
bun run test:e2e -- <focused specs>
```

Tambahkan command browser/performance hanya setelah tool dan deployment URL
tersedia. Jangan mencatat command sebagai `commands_run` sebelum benar-benar
berhasil dijalankan.

## Task Register

| task_id | title | status | priority | owner_role | depends_on | required_approvals |
| --- | --- | --- | --- | --- | --- | --- |
| PERF-001 | Menetapkan baseline performa production-like | needs_review | P0 | planner | [] | [tech-lead] |
| PERF-002 | Menghilangkan upload ulang pada polling OCR | needs_review | P0 | planner | [PERF-001] | [security-review, code-review, qa-signoff] |
| PERF-003 | Mempercepat initial data loading halaman | blocked | P1 | planner | [PERF-001] | [architecture-review, code-review, qa-signoff] |
| PERF-004 | Memecah bundle transaksi dan mengatur cache aman | blocked | P1 | planner | [PERF-001, PERF-002, PERF-003] | [code-review, qa-signoff] |
| PERF-005 | Menjalankan verification dan rollout bertahap | blocked | P0 | planner | [PERF-002, PERF-003, PERF-004] | [release-approval] |
| PERF-006 | Batch lookup dompet saat membentuk DTO transaksi | needs_review | P1 | developer | [] | [code-review, qa-signoff] |

## Tasks

### TASK PERF-001 — Menetapkan baseline performa production-like

```yaml
task_id: PERF-001
title: Menetapkan baseline performa production-like
rationale: Tanpa baseline, optimasi tidak dapat dibuktikan dan target latency berisiko spekulatif.
priority: P0
status: needs_review
owner_role: planner
dependencies: []
blocked_by: []
unblocks:
  - PERF-002
  - PERF-003
  - PERF-004
task_size: S
goal: Menghasilkan baseline report yang reproducible tanpa menyimpan data pribadi.
scope_in:
  - Production/staging URL
  - route navigation
  - API timing
  - bundle and resource transfer
  - deployment/database region
scope_out:
  - Code optimization
  - Provider migration
candidate_files:
  - docs/qa/
  - docs/dev-plan/performance-optimization-plan.md
forbidden_areas:
  - Source code behavior changes
  - Production secrets
  - Raw personal payloads
non_functional_requirements:
  - Evidence harus mencatat device/network profile dan timestamp.
acceptance_criteria:
  - Baseline memuat TTFB, LCP, transferred bytes, request count, dan API p95.
  - Receipt flow mencatat ukuran upload dan jumlah upload selama recovery.
  - Tidak ada secret atau personal financial payload pada artifact.
verification_strategy:
  tests_required: yes
  test_levels: [smoke, manual-check-needed]
  test_targets: [production-like routes, authenticated API paths]
  oracle: Baseline report dapat dibaca ulang dan dibandingkan dengan post-change capture.
  commands_planned: [TBD: deployment-specific browser/performance command]
  commands_run:
    - bun run build
    - bun run lint
    - bun run test
exit_criteria:
  - Local baseline commands and artifacts are recorded above.
  - ALARM-PERF-001 remains active for authenticated production evidence.
  - tech-lead menerima baseline.
rollback_plan: Tidak ada code rollback; hapus artifact yang mengandung data sensitif dan capture ulang.
active_alarm_ids: [ALARM-PERF-001]
resolved_alarm_ids: []
```

### TASK PERF-002 — Menghilangkan upload ulang pada polling OCR

```yaml
task_id: PERF-002
title: Menghilangkan upload ulang pada polling OCR
rationale: Recovery saat ini mengirim ulang file hingga 4 MB setiap 2 detik.
priority: P0
status: needs_review
owner_role: planner
dependencies: [PERF-001]
blocked_by: []
unblocks: [PERF-004]
task_size: M
goal: Client mengambil status job terbaru melalui request kecil tanpa mengirim ulang receipt bytes.
scope_in:
  - ReceiptScanner.tsx
  - OCR route/service/repository contract
  - auth and household authorization
  - OCR status/retry tests
scope_out:
  - OCR model prompt or provider migration
  - Receipt storage policy change
candidate_files:
  - components/transactions/ReceiptScanner.tsx
  - app/api/ocr/
  - lib/server/services/ocr.ts
  - lib/server/repositories/ledger.ts
  - lib/server/contracts/ocr.ts
forbidden_areas:
  - Public receipt URL
  - Removal of idempotency
  - Weakened actor/household checks
security_privacy_notes:
  - Job status and draft must remain scoped to authorized actor.
acceptance_criteria:
  - Recovery flow sends zero duplicate file uploads.
  - Polling endpoint returns latest authorized job state.
  - PROCESSING, SUCCEEDED, FAILED, 401, 403, 404, and unavailable image states remain explicit.
  - Existing retry race/idempotency tests remain green.
  - Polling uses bounded backoff or an equivalent bounded request policy.
verification_strategy:
  tests_required: yes
  test_levels: [unit, integration, e2e]
  test_targets: [OCR contracts, OCR routes, ReceiptScanner recovery flow]
  oracle: Network evidence shows file bytes are sent once per user upload attempt.
  commands_planned:
    - bun run lint
    - bun run test -- app/api/ocr/ocr-routes.test.ts lib/server/services/ocr-retry.test.ts
    - bun run test:integration
    - bun run build
  commands_run:
    - bun run test -- lib/server/services/ocr.test.ts
    - bun run test
    - bun run lint
    - bun run build
    - bun run test:integration (failed: database access denied / local-only guard)
exit_criteria:
  - ALARM-PERF-002 resolved.
  - security-review and code-review approved.
  - focused and integration tests passed.
rollback_plan: Revert endpoint/client polling change together; keep old flow only behind an explicitly approved emergency fallback.
active_alarm_ids: [ALARM-PERF-001]
resolved_alarm_ids: []
```

### TASK PERF-003 — Mempercepat initial data loading halaman

```yaml
task_id: PERF-003
title: Mempercepat initial data loading halaman
rationale: Halaman authenticated saat ini memulai fetch utama dari useEffect setelah hydration.
priority: P1
status: blocked
implementation_status: partial
owner_role: planner
dependencies: [PERF-001]
blocked_by: [ALARM-PERF-001]
unblocks: [PERF-004]
task_size: L
goal: Konten awal halaman utama tersedia melalui server render atau pola initialData yang setara.
scope_in:
  - home/dashboard
  - transactions
  - budget
  - family/profile hanya bila baseline membuktikan dampak
  - authenticated loading/error/unauthorized states
scope_out:
  - Redesign UI
  - Business query changes yang tidak berkaitan dengan initial load
candidate_files:
  - app/home/page.tsx
  - app/transactions/page.tsx
  - app/budget/page.tsx
  - components/dashboard/DashboardView.tsx
  - components/transactions/ActivityView.tsx
  - lib/server/services/
forbidden_areas:
  - Public caching of per-user DTOs
  - Removal of client refresh after mutation
  - Changes to auth membership semantics
acceptance_criteria:
  - Initial content tidak menunggu useEffect untuk first meaningful render pada target pages.
  - Refresh, retry, mutation invalidation, and unauthorized redirect tetap bekerja.
  - Search param behavior untuk month/view/add/scope tetap sama.
  - Server/client boundary tidak menyebabkan hydration warning.
verification_strategy:
  tests_required: yes
  test_levels: [unit, integration, e2e, smoke]
  test_targets: [page routes, dashboard/transaction states, navigation flows]
  oracle: Post-change TTFB/LCP improves against PERF-001 without stale or cross-user data.
  commands_planned:
    - bun run lint
    - bun run test
    - bun run test:integration
    - bun run test:e2e -- e2e/dashboard.spec.ts e2e/smoke.spec.ts e2e/transaction-add-intent.spec.ts
    - bun run build
  commands_run:
    - bun run test -- components/dashboard/spendingBuckets.test.ts app/api/dashboard/dashboard-routes.test.ts
    - bun run test
    - bun run lint
    - bun run build
current_source_audit_2026_10_27:
  implemented: [/budget initial DTO, /family initial member/session DTO]
  not_implemented: [/home initial dashboard DTO, /transactions initial list DTO]
  evidence: >
    app/home/page.tsx renders DashboardView without initialData; DashboardView
    fetches /api/dashboard after hydration. app/transactions/page.tsx passes
    view/filter state but no initialData to ActivityView; its initial list
    therefore remains client-fetched.
exit_criteria:
  - Architecture review and code review approved.
  - Loading, empty, error, submitting, success, and unauthorized states verified.
  - Authenticated production capture remains required before rollout completion.
rollback_plan: Revert page data boundary per route; retain existing client fetch path until forward fix is validated.
active_alarm_ids: [ALARM-PERF-001]
resolved_alarm_ids: []
```

### TASK PERF-004 — Memecah bundle transaksi dan mengatur cache aman

```yaml
task_id: PERF-004
title: Memecah bundle transaksi dan mengatur cache aman
rationale: ReceiptScanner dan nested wallet sheets di-import statis pada flow transaksi.
priority: P1
status: blocked
owner_role: planner
dependencies: [PERF-001, PERF-002, PERF-003]
blocked_by: [ALARM-PERF-001]
unblocks: [PERF-005]
task_size: M
goal: OCR code hanya di-download saat diperlukan dan cache policy tidak mengekspos data authenticated.
scope_in:
  - AddTransactionSheet
  - ReceiptScanner dynamic import
  - route/resource headers
  - receipt image response headers
scope_out:
  - Changing receipt privacy model
  - Unrelated UI redesign
candidate_files:
  - components/transactions/AddTransactionSheet.tsx
  - components/transactions/ReceiptScanner.tsx
  - app/api/ocr/receipts/[id]/image/route.ts
  - next.config.ts
forbidden_areas:
  - Public immutable caching for authenticated API responses
  - Removing accessibility states or focus trap
acceptance_criteria:
  - Initial transactions chunk tidak memuat ReceiptScanner code sebelum tab scan dibuka.
  - Tab scan tetap menampilkan loading/error state yang jelas.
  - Wallet picker/form tetap dapat dibuka dan focus dikembalikan dengan benar.
  - Authenticated responses memakai private/no-store atau policy setara yang disetujui.
  - Bundle delta dan request waterfall tercatat.
verification_strategy:
  tests_required: yes
  test_levels: [unit, e2e, smoke, manual-check-needed]
  test_targets: [transaction add flow, receipt viewer, cache headers, build chunks]
  oracle: Route initial JS dan transferred bytes turun tanpa menambah blocking request pada manual entry.
  commands_planned:
    - bun run lint
    - bun run test
    - bun run test:e2e -- e2e/transaction-add-intent.spec.ts e2e/ocr-retry.spec.ts
    - bun run build
  commands_run: []
exit_criteria:
  - Cache/security review approved.
  - Mobile manual and scan flows verified.
rollback_plan: Revert dynamic import/header changes independently; preserve OCR API contract.
active_alarm_ids: [ALARM-PERF-001]
resolved_alarm_ids: []
```

### TASK PERF-005 — Menjalankan verification dan rollout bertahap

```yaml
task_id: PERF-005
title: Menjalankan verification dan rollout bertahap
rationale: Optimasi performa harus dibuktikan pada deployment target, bukan hanya build lokal.
priority: P0
status: blocked
owner_role: planner
dependencies: [PERF-002, PERF-003, PERF-004]
blocked_by: [ALARM-PERF-001]
unblocks: []
task_size: M
goal: Membandingkan post-change evidence dengan baseline dan memutuskan rollout atau rollback.
scope_in:
  - Production-like smoke
  - Web Vitals and API timing
  - OCR bandwidth capture
  - bundle comparison
  - rollback decision
scope_out:
  - Unrelated performance cleanup
  - Silent acceptance of regressions
candidate_files:
  - docs/qa/
  - docs/dev-plan/performance-optimization-plan.md
forbidden_areas:
  - Recording secrets or personal payloads
  - Marking done without executed verification
acceptance_criteria:
  - All required commands and deployment checks are recorded as actually run.
  - No critical regression in auth, transactions, OCR, or privacy.
  - OCR recovery upload count is one per user upload attempt.
  - Post-change metrics meet approved targets or have an explicit accepted variance.
  - Rollout, rollback, and follow-up owner are documented.
verification_strategy:
  tests_required: yes
  test_levels: [unit, integration, e2e, smoke, manual-check-needed]
  test_targets: [full affected test surface, deployment target, mobile profile]
  oracle: Approved comparison report against PERF-001 baseline.
  commands_planned:
    - bun run lint
    - bun run test
    - bun run test:integration
    - bun run test:e2e
    - bun run build
    - TBD: production performance capture command
  commands_run: []
exit_criteria:
  - release approval collected.
  - Evidence artifacts stored without personal data.
  - Documentation and architecture decisions synchronized.
rollback_plan: Revert the smallest failing optimization, redeploy, and recapture the affected baseline metrics.
active_alarm_ids: [ALARM-PERF-001]
resolved_alarm_ids: []
```

### TASK PERF-006 — Batch lookup dompet saat membentuk DTO transaksi

```yaml
task_id: PERF-006
title: Batch lookup dompet saat membentuk DTO transaksi
rationale: decorateTransactionRows saat ini melakukan lookup berurutan untuk setiap walletId unik.
priority: P1
status: needs_review
implementation_status: applied_pending_verification
owner_role: developer
authorization: User explicitly selected the primary fix on 2026-10-27.
dependencies: []
blocked_by: []
goal: Resolve all wallet references needed by a transaction page with one household-scoped repository query.
scope_in:
  - Add a batch wallet lookup to WalletRepository and production wiring.
  - Use the batch lookup in decorateTransactionRows.
  - Preserve cross-scope transfer redaction and existing DTO output.
  - Update typed repository fakes required by the interface change.
scope_out:
  - Change transaction API contracts or pagination.
  - Change session authentication or dashboard aggregation.
  - Seed or modify production financial data.
candidate_files:
  - lib/server/repositories/ledger.ts
  - lib/server/services/transaction.ts
  - lib/server/testing/fakes.ts
  - lib/server/testing/dashboard-fakes.ts
security_invariants:
  - Query must include householdId and deduplicate requested wallet IDs.
  - Redacted transfer legs must not trigger wallet lookup or expose wallet references.
  - Empty transaction pages must skip the wallet query.
acceptance_criteria:
  - Wallet lookup count is one when a page has non-redacted rows, independent of unique wallet count.
  - Wallet lookup count is zero when the page is empty or all rows are redacted.
  - Rows in another household are never returned by the batch repository method.
  - DTO shape, row order, and cross-scope redaction remain unchanged.
verification_strategy:
  tests_required: yes
  test_levels: [focused-unit, repository-scope]
  oracle: One batch query serves visible rows; empty pages skip it; redacted rows remain generic.
  commands_run: []
progress_log:
  - date: 2026-10-27
    status: implementation-applied
    summary: Added a household-scoped batch lookup with a minimal wallet-reference projection and replaced sequential resolution in transaction DTO decoration.
    verification: Not run in this session; required focused checks and code/QA approvals remain pending.
technical_decisions:
  - id: PERF-006-TD-1
    decision: Resolve unique, non-redacted wallet IDs with one household-scoped query selecting only id, name, and scope; skip the query when no wallet IDs remain.
    rationale: Removes sequential database round trips and avoids fetching unused wallet columns without changing DTO order or transfer redaction.
active_alarm_ids: [ALARM-PERF-001]
resolved_alarm_ids: []
```

## Handoff and Documentation Contract

Every task handoff must include:

```text
RESUME_FROM: <last completed milestone or blocker>
CURRENT_STATUS: <task status>
SCOPE_IN: <exact files/behavior>
SCOPE_OUT: <explicit exclusions>
FORBIDDEN_AREAS: <hard boundaries>
ACTIVE_ALARMS: <alarm ids and full replacement requirements>
VERIFICATION_STRATEGY: <planned checks and oracle>
COMMANDS_RUN: <only commands actually executed>
EVIDENCE: <real artifact paths or none>
ROLLBACK: <specific revert or forward-fix path>
NEXT_OWNER: <single role>
```

## Definition of Done

The initiative is done only when:

- all active alarms are resolved or formally accepted as external blockers;
- OCR recovery no longer uploads duplicate receipt bytes;
- affected pages render initial content without unnecessary client-fetch delay;
- transaction OCR code is split from the initial manual-entry path;
- authenticated cache policy is reviewed and verified;
- lint, unit, integration, e2e, build, and deployment smoke checks pass as applicable;
- before/after performance evidence is recorded;
- rollback path has been tested or explicitly verified;
- related ADR/dev-plan documentation is synchronized.
