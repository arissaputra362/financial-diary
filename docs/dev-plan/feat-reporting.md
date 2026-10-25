# Dev Plan: Laporan Bulanan (Ringkasan)

Detail teknis implementasi Fitur 7. Dokumen ini adalah kontrak kerja untuk layer server, kontrak API, URL halaman Aktivitas, komponen UI, dan test.

- **Spec:** `docs/spec/feat-reporting.md` (AC-F7-1 s.d. AC-F7-15; diamanatkan PM 2026-10-25: invarian kini memuat suku transfer, dan saldo awal menghitung transaksi backdate)
- **Design:** `docs/design/08-reporting.md` (PM-approved 2026-10-25; §6.4 diamanatkan dengan baris transfer kondisional)
- **PRD:** `docs/PRD.md#fitur-7-laporan-bulanan-ringkasan`
- **ADR terkait:** ADR-001 (Prisma + Neon), ADR-006 (DTO camelCase, repository per request)
- **Engineer:** Dev · **Status:** PM disetujui 2026-10-25; implementasi selesai, menunggu QA · **Estimasi:** 3 hari

## Ringkasan Teknis

Tab ketiga `Ringkasan` hidup di halaman `/transactions` yang sudah ada. Seluruh angka berasal dari satu endpoint agregasi `GET /api/reports/monthly`; client hanya merender DTO dan tidak pernah menjumlahkan baris transaksi. Server menghitung saldo awal, masuk, keluar, penyesuaian dompet baru, pergerakan transfer, saldo akhir, rincian kategori, delta bulan sebelumnya, dan seri saldo harian dari `transaction` + `wallet` tanpa tabel atau migrasi baru.

## Batas dan Prinsip

1. Tidak ada tabel, kolom, atau migrasi baru. Sumber data hanya `transaction` dan `wallet` dengan `deleted_at IS NULL`.
2. Uang selalu integer rupiah skala 0. Agregasi SQL memakai `SUM(...)::bigint` lalu dikirim sebagai teks dan diubah ke `number` di service. Tidak ada cast int32 di jalur agregasi.
3. Batas bulan memakai kalender Asia/Jakarta melalui `PeriodService` dan `startOfJakartaDay` / `endOfJakartaDay`.
4. Cakupan `Bersama` dan `Pribadi` tidak pernah dijumlahkan (A-44), termasuk delta dan grafik.
5. Satu respons server untuk satu kombinasi bulan + cakupan + dompet. Perubahan filter memicu satu permintaan baru.
6. Tidak ada import kode server di komponen client. DTO tinggal di `types/api.ts` (pure types).
7. Server Component tetap default; hanya `ActivityView`, `MonthlyReport`, dan `BalanceMovementChart` yang client karena butuh state, fetch, dan interaksi.

## Kontrak API

### Route

| Route | Method | Auth | Query | Response |
|---|---|---|---|---|
| `/api/reports/monthly` | GET | APPROVED | `month=YYYY-MM` (opsional, default bulan Jakarta saat ini), `scope=shared\|personal` (opsional, default `shared`), `walletId=<uuid>` (opsional) | `MonthlyReportDTO` |

- `walletId` wajib berada dalam cakupan dan terlihat oleh actor. Jika tidak, `404 NOT_FOUND` generik (`Dompet tidak ditemukan.`). Tidak membocorkan apakah dompet itu milik household lain atau milik anggota lain.
- `scope=personal` tanpa dompet pribadi milik actor mengembalikan `422 REPORT_SCOPE_UNAVAILABLE` dengan `fieldErrors.scope`. UI tidak memanggil endpoint untuk cakupan ini; respons ini hanya pagar untuk deep link/API langsung.
- `month` tidak valid, `scope` tidak dikenal, atau `walletId` bukan UUID: `422 VALIDATION_ERROR`.
- Sesi tidak APPROVED: `403` sesuai `accessDeniedForStatus` (pola route lain).
- Respons memakai cookie sesi sliding seperti route dashboard (`setSessionCookie`).

### DTO (`types/api.ts`)

```ts
export type ReportScopeDTO = "SHARED" | "PERSONAL";

export type ReportCategoryDTO = {
  /** Nama kategori tersimpan; tidak pernah dikarang. */
  name: string;
  amountMinor: number;
};

export type ReportBreakdownDTO = {
  /** Total server; wajib sama dengan subtotal yang dirender. */
  totalMinor: number;
  /** Maksimal empat kategori bernama terbesar, urut nominal menurun. */
  categories: ReportCategoryDTO[];
  /** 0 bila tidak ada transaksi tanpa kategori. */
  uncategorizedMinor: number;
  /** Jumlah kategori bernama yang tidak masuk empat teratas. */
  otherCategoryCount: number;
  /** Nominal gabungan kategori yang tidak masuk empat teratas. */
  otherAmountMinor: number;
};

export type MonthlyReportDeltaDTO = {
  /** Null bila bulan sebelumnya tidak punya data pada kombinasi yang sama. */
  closingMinor: number | null;
  moneyInMinor: number | null;
  moneyOutMinor: number | null;
};

export type DailyBalanceDTO = {
  /** `YYYY-MM-DD` pada kalender Asia/Jakarta. */
  date: string;
  closingMinor: number;
};

export type MonthlyReportDTO = {
  month: string;
  periodStart: string;
  periodEnd: string;
  isCurrentMonth: boolean;
  scope: ReportScopeDTO;
  wallet: { id: string; name: string } | null;
  openingMinor: number;
  newWalletOpeningMinor: number;
  moneyInMinor: number;
  moneyOutMinor: number;
  /** Kaki transfer yang masuk ke dompet dalam cakupan. */
  transferInMinor: number;
  /** Kaki transfer yang keluar dari dompet dalam cakupan. */
  transferOutMinor: number;
  transferNetMinor: number;
  closingMinor: number;
  /** Jumlah baris transaksi aktif di periode, termasuk kedua kaki transfer. */
  transactionCount: number;
  /** True bila ada dompet baru dengan transaksi bertanggal sebelum dompet dibuat. */
  hasBackdatedNewWallet: boolean;
  delta: MonthlyReportDeltaDTO;
  income: ReportBreakdownDTO;
  expense: ReportBreakdownDTO;
  /** Satu titik per hari kalender, termasuk hari tanpa transaksi. */
  dailyBalances: DailyBalanceDTO[];
};
```

### Validasi

| Field | Rules | Pesan |
|---|---|---|
| `month` | opsional, regex `^\d{4}-(0[1-9]\|1[0-2])$` | `Bulan tidak valid.` |
| `scope` | `shared` atau `personal`, default `shared` | `Cakupan laporan tidak dikenal.` |
| `walletId` | opsional, UUID | `Dompet tidak valid.` |

## Aturan Agregasi

### Cakupan dompet

- `SHARED`: `wallet.household_id = actor.householdId AND wallet.scope = 'SHARING'`.
- `PERSONAL`: `wallet.household_id = actor.householdId AND wallet.scope = 'PERSONAL' AND wallet.created_by_user_id = actor.userId`. Tidak ada override Owner.
- Dompet terarsip tetap masuk. Arsip bukan penghapusan.
- `walletId` mempersempit seluruh perhitungan ke satu dompet itu, setelah filter cakupan dan visibilitas.

### Dompet yang dihitung pada periode

`period_wallets` = dompet dalam cakupan yang memenuhi salah satu:

1. `created_at <= period.end` (dompet sudah ada saat periode berjalan), atau
2. punya minimal satu transaksi aktif (`deleted_at IS NULL`) dengan `occurred_at` di dalam periode.

Aturan ini membuat dompet yang dibuat setelah periode berakhir tetapi punya transaksi backdate ikut dihitung, sedangkan dompet baru tanpa aktivitas pada periode lampau tidak ikut.

### Saldo awal dan dompet baru

- `openingMinor` = Σ `opening_balance_minor` untuk `period_wallets` dengan `created_at < period.start` + Σ net semua transaksi aktif dengan `occurred_at < period.start` pada `period_wallets`.
  - Transaksi sebelum periode pada dompet yang dibuat di dalam periode ikut dihitung di sini supaya saldo awal yang ditampilkan adalah saldo nyata saat periode mulai. Ini pengecualian sempit dari kalimat "dompet yang sudah ada sebelum awal periode" dan dicatat di Keputusan Teknis.
- `newWalletOpeningMinor` = Σ `opening_balance_minor` untuk `period_wallets` dengan `created_at >= period.start`.
- Baris `Saldo awal dompet baru` hanya dirender bila `newWalletOpeningMinor != 0`.

Invarian server yang mengikat:

```text
closing = opening
        + newWalletOpening
        + moneyIn
        - moneyOut
        + transferIn
        - transferOut
```

`transferNetMinor = transferIn - transferOut`.

### Transfer

- Kaki transfer dikenali dari `transfer_group_id IS NOT NULL`.
- `moneyIn` / `moneyOut` hanya menjumlahkan `transfer_group_id IS NULL`.
- `transferIn` / `transferOut` menjumlahkan kaki transfer yang dompetnya ada di `period_wallets` dan `occurred_at` di periode.
- Transfer dalam satu cakupan dengan `Semua dompet` akan saling meniadakan (`transferNet = 0`) sehingga tidak menambah baris transfer di jejak saldo.
- Transfer lintas cakupan hanya menyumbang kaki milik cakupan itu. Kaki cakupan lain tidak pernah dibaca.
- `Saldo akhir` dan grafik memakai pergerakan bersih seluruh transaksi, termasuk transfer. Ini memenuhi AC-F7-12 dan rekonsiliasi AC-F7-9.

### Rincian kategori

- Ambil `SUM(amount_minor)` per `(type, category)` dari transaksi non-transfer di periode.
- `categories` = maksimal 4 kategori bernama terbesar; tie-break nama ascending.
- `uncategorizedMinor` = gabungan `category IS NULL` atau string kosong.
- `otherCategoryCount` = jumlah kategori bernama selain 4 teratas.
- `otherAmountMinor` = gabungan nominal kategori tersebut.
- `totalMinor` diambil dari total `moneyIn`/`moneyOut` server, bukan hasil penjumlahan ulang di client. Subtotal UI memakai nilai ini.

### Delta bulan sebelumnya

- Hitung laporan yang sama untuk bulan sebelumnya dengan cakupan dan `walletId` yang sama.
- `previousHasData` = ada minimal satu transaksi aktif di periode sebelumnya pada `period_wallets` sebelumnya (termasuk transfer).
- Bila false, ketiga field `delta` = `null`; UI tidak merender blok delta sama sekali.
- Bila true, delta = nilai bulan berjalan - nilai bulan sebelumnya (bertanda). UI memakai `Math.abs` dan kata `Naik`/`Turun`. Delta nol dirender `Naik Rp0 dari bulan lalu` agar copy tetap memakai format yang disetujui; tidak ada persentase.

### Grafik harian

- Hasilkan satu baris per tanggal kalender dari `period.start` sampai `period.end` memakai `generate_series`.
- Saldo hari ke-n = `opening + newWalletOpening + Σ net transaksi periode dari hari pertama sampai hari itu`, termasuk transfer.
- Hari tanpa transaksi tetap muncul dengan nilai yang sama seperti hari sebelumnya (garis datar, tidak putus).
- Jumlah titik = jumlah hari bulan itu (28..31) dan tidak berubah antar breakpoint.

### Rekonsiliasi dashboard (AC-F7-9)

Untuk bulan berjalan, `scope=shared`, `Semua dompet`, `closingMinor` harus sama dengan `sharedBalanceMinor` dashboard. Untuk `scope=personal`, sama dengan `personalBalanceMinor`. Keduanya memakai definisi saldo yang sama: opening balance + seluruh transaksi aktif (termasuk transfer) pada dompet yang termasuk cakupan, termasuk dompet arsip.

## SQL Plan

Satu query agregat untuk total + opening + previous + backdate, satu query kategori, satu query harian. Semua query memakai CTE yang sama agar definisi dompet konsisten.

```sql
WITH scoped_wallets AS (
  SELECT w.id, w.name, w.opening_balance_minor::bigint AS opening_balance_minor, w.created_at
  FROM wallet w
  WHERE w.household_id = $1::uuid
    AND (
      ($2 = 'SHARING' AND w.scope = 'SHARING')
      OR ($2 = 'PERSONAL' AND w.scope = 'PERSONAL' AND w.created_by_user_id = $3::uuid)
    )
    AND ($4::uuid IS NULL OR w.id = $4::uuid)
),
period_wallets AS (
  SELECT sw.* FROM scoped_wallets sw
  WHERE sw.created_at <= $6::timestamptz
     OR EXISTS (
       SELECT 1 FROM transaction t
       WHERE t.wallet_id = sw.id AND t.deleted_at IS NULL
         AND t.occurred_at BETWEEN $5::timestamptz AND $6::timestamptz
     )
),
prev_wallets AS (
  SELECT sw.* FROM scoped_wallets sw
  WHERE sw.created_at <= $8::timestamptz
     OR EXISTS (
       SELECT 1 FROM transaction t
       WHERE t.wallet_id = sw.id AND t.deleted_at IS NULL
         AND t.occurred_at BETWEEN $7::timestamptz AND $8::timestamptz
     )
),
period_tx AS (
  SELECT t.* FROM transaction t
  JOIN period_wallets pw ON pw.id = t.wallet_id
  WHERE t.deleted_at IS NULL
    AND t.occurred_at BETWEEN $5::timestamptz AND $6::timestamptz
),
before_tx AS (
  SELECT t.* FROM transaction t
  JOIN period_wallets pw ON pw.id = t.wallet_id
  WHERE t.deleted_at IS NULL AND t.occurred_at < $5::timestamptz
),
prev_tx AS (
  SELECT t.* FROM transaction t
  JOIN prev_wallets pw ON pw.id = t.wallet_id
  WHERE t.deleted_at IS NULL
    AND t.occurred_at BETWEEN $7::timestamptz AND $8::timestamptz
),
prev_before_tx AS (
  SELECT t.* FROM transaction t
  JOIN prev_wallets pw ON pw.id = t.wallet_id
  WHERE t.deleted_at IS NULL AND t.occurred_at < $7::timestamptz
),
opening AS (
  SELECT
    COALESCE(SUM(CASE WHEN pw.created_at < $5 THEN pw.opening_balance_minor ELSE 0 END), 0)::bigint
    + COALESCE((SELECT SUM(CASE WHEN t.type = 'MONEY_IN' THEN t.amount_minor ELSE -t.amount_minor END)
                FROM before_tx t), 0)::bigint AS amount
  FROM period_wallets pw
),
new_wallet AS (
  SELECT COALESCE(SUM(pw.opening_balance_minor), 0)::bigint AS amount
  FROM period_wallets pw WHERE pw.created_at >= $5
),
period_totals AS (
  SELECT
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type = 'MONEY_IN' THEN t.amount_minor END), 0)::bigint AS money_in,
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type = 'MONEY_OUT' THEN t.amount_minor END), 0)::bigint AS money_out,
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type = 'MONEY_IN' THEN t.amount_minor END), 0)::bigint AS transfer_in,
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type = 'MONEY_OUT' THEN t.amount_minor END), 0)::bigint AS transfer_out,
    COUNT(*)::bigint AS tx_count
  FROM period_tx t
),
prev_opening AS (
  SELECT
    COALESCE(SUM(CASE WHEN pw.created_at < $7 THEN pw.opening_balance_minor ELSE 0 END), 0)::bigint
    + COALESCE((SELECT SUM(CASE WHEN t.type = 'MONEY_IN' THEN t.amount_minor ELSE -t.amount_minor END)
                FROM prev_before_tx t), 0)::bigint AS amount
  FROM prev_wallets pw
),
prev_new_wallet AS (
  SELECT COALESCE(SUM(pw.opening_balance_minor), 0)::bigint AS amount
  FROM prev_wallets pw WHERE pw.created_at >= $7
),
prev_totals AS (
  SELECT
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type = 'MONEY_IN' THEN t.amount_minor END), 0)::bigint AS money_in,
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type = 'MONEY_OUT' THEN t.amount_minor END), 0)::bigint AS money_out,
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type = 'MONEY_IN' THEN t.amount_minor END), 0)::bigint AS transfer_in,
    COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type = 'MONEY_OUT' THEN t.amount_minor END), 0)::bigint AS transfer_out,
    COUNT(*)::bigint AS tx_count
  FROM prev_tx t
),
backdate AS (
  SELECT EXISTS (
    SELECT 1 FROM period_wallets pw
    JOIN transaction t ON t.wallet_id = pw.id
    WHERE pw.created_at >= $5
      AND t.deleted_at IS NULL
      AND t.occurred_at < pw.created_at
  ) AS has_backdated_new_wallet
)
SELECT
  opening.amount::text AS opening,
  new_wallet.amount::text AS new_wallet_opening,
  period_totals.money_in::text AS money_in,
  period_totals.money_out::text AS money_out,
  period_totals.transfer_in::text AS transfer_in,
  period_totals.transfer_out::text AS transfer_out,
  period_totals.tx_count::text AS tx_count,
  prev_opening.amount::text AS prev_opening,
  prev_new_wallet.amount::text AS prev_new_wallet_opening,
  prev_totals.money_in::text AS prev_money_in,
  prev_totals.money_out::text AS prev_money_out,
  prev_totals.transfer_in::text AS prev_transfer_in,
  prev_totals.transfer_out::text AS prev_transfer_out,
  prev_totals.tx_count::text AS prev_tx_count,
  backdate.has_backdated_new_wallet
FROM opening, new_wallet, period_totals, prev_opening, prev_new_wallet, prev_totals, backdate;
```

Query kategori:

```sql
SELECT t.type::text AS type, t.category, SUM(t.amount_minor)::text AS amount, COUNT(*)::text AS count
FROM transaction t
JOIN period_wallets pw ON pw.id = t.wallet_id
WHERE t.deleted_at IS NULL
  AND t.occurred_at BETWEEN $5::timestamptz AND $6::timestamptz
  AND t.transfer_group_id IS NULL
GROUP BY t.type, t.category;
```

Query harian:

```sql
WITH days AS (
  SELECT generate_series($9::date, $10::date, interval '1 day')::date AS day
),
daily_net AS (
  SELECT (t.occurred_at AT TIME ZONE 'Asia/Jakarta')::date AS day,
         SUM(CASE WHEN t.type = 'MONEY_IN' THEN t.amount_minor ELSE -t.amount_minor END)::bigint AS net
  FROM transaction t
  JOIN period_wallets pw ON pw.id = t.wallet_id
  WHERE t.deleted_at IS NULL
    AND t.occurred_at BETWEEN $5::timestamptz AND $6::timestamptz
  GROUP BY 1
)
SELECT d.day::text AS date,
       (opening.amount + new_wallet.amount +
        COALESCE(SUM(COALESCE(dn.net, 0)) OVER (ORDER BY d.day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0)
       )::text AS closing
FROM days d
CROSS JOIN opening
CROSS JOIN new_wallet
LEFT JOIN daily_net dn ON dn.day = d.day
ORDER BY d.day;
```

Catatan implementasi: `period_wallets`, `opening`, dan `new_wallet` diulang di query harian atau dibungkus satu `WITH` per query. Tidak ada `::int` pada `SUM`/`COUNT`; semua hasil bigint dikonversi ke teks lalu `Number()` di service.

## Layer Server

### Repository (`lib/server/repositories/reports.ts`)

```ts
export interface ReportWalletRecord {
  id: string;
  name: string;
  scope: "PERSONAL" | "SHARING";
  openingBalanceMinor: number;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface ReportCategorySum {
  type: "MONEY_IN" | "MONEY_OUT";
  category: string | null;
  amountMinor: number;
}

export interface ReportAggregate {
  openingMinor: number;
  newWalletOpeningMinor: number;
  moneyInMinor: number;
  moneyOutMinor: number;
  transferInMinor: number;
  transferOutMinor: number;
  transactionCount: number;
  hasBackdatedNewWallet: boolean;
  categories: ReportCategorySum[];
  dailyBalances: Array<{ date: string; closingMinor: number }>;
  previous: {
    hasData: boolean;
    closingMinor: number;
    moneyInMinor: number;
    moneyOutMinor: number;
  };
}

export interface ReportRepository {
  listScopedWallets(
    actor: WalletActor,
    scope: "PERSONAL" | "SHARING",
    walletId?: string,
  ): Promise<ReportWalletRecord[]>;
  aggregate(
    actor: WalletActor,
    query: { scope: "PERSONAL" | "SHARING"; walletId?: string; period: MonthPeriod; previous: MonthPeriod },
  ): Promise<ReportAggregate>;
}
```

- `listScopedWallets` memakai Prisma `wallet.findMany` (bukan raw) untuk validasi + nama + opsi arsip.
- `aggregate` memakai `db.$queryRaw` sesuai SQL Plan.
- Semua method menerima `WalletActor`, bukan hanya `householdId`.

### Service (`lib/server/services/report.ts`)

```ts
export class ReportService {
  constructor(private readonly repo: ReportRepository, private readonly periods = new PeriodService()) {}

  async get(
    actor: WalletActor,
    query: { month?: string; scope?: "shared" | "personal"; walletId?: string },
  ): Promise<MonthlyReportDTO>;
}
```

- `month` default = `jakartaDateOnly().slice(0, 7)`.
- `scope` wire `shared|personal` → `SHARING|PERSONAL`.
- `period = periods.month(month)`, `previous = periods.month(shiftMonthKey(month, -1))`.
- Validasi dompet: `listScopedWallets`; jika `walletId` diberikan dan hasil kosong → `404`.
- `scope === "PERSONAL"` dan tidak ada dompet pribadi → `422 REPORT_SCOPE_UNAVAILABLE`.
- Bangun `income`/`expense` dari `aggregate.categories` (top 4, `Tanpa kategori`, `Lainnya`).
- Bangun `delta` hanya jika `previous.hasData`.
- `closingMinor` = formula invarian. `transferNetMinor = transferIn - transferOut`.
- `isCurrentMonth` = `month === jakartaDateOnly().slice(0, 7)`.

### PeriodService

Tambahkan `month(key: string): MonthPeriod` yang memvalidasi `YYYY-MM` dan memakai `daysInMonth` yang sudah ada. `PeriodService.currentMonth` tetap. Tidak ada perubahan perilaku method lama.

### Wiring

- `createServices` membuat `createReportRepository(prisma)` dan `new ReportService(..., periods)`.
- `Services` dan `AuthenticatedContext` mendapat `reports: ReportService`.
- Route baru `app/api/reports/monthly/route.ts` mengikuti pola `app/api/dashboard/route.ts`.
- `lib/server/contracts/reports.ts` + `parseReportQuery` di `lib/server/http.ts`.

## Layer Client

### URL dan page (`app/transactions/page.tsx`)

Parameter yang didukung:

| Param | Nilai | Berlaku |
|---|---|---|
| `view` | `active`, `ringkasan`, `trash` | semua; absen = active |
| `month` | `YYYY-MM` | active + ringkasan |
| `from`, `to` | `YYYY-MM-DD` | active saja |
| `filter` | `all`, `in`, `out`, `transfer` | active saja |
| `wallet` | UUID | active + ringkasan; arti mengikuti view |
| `scope` | `shared`, `personal` | ringkasan; absen = shared |
| `add` | `1` | intent sheet |

- `view` divalidasi persis seperti sekarang; `ringkasan` baru.
- `filter` divalidasi ke union; nilai tidak dikenal → `all`.
- `wallet` hanya dipakai bila cocok regex UUID.
- `scope` hanya `personal` yang ditulis di URL; `shared` adalah default dan dihilangkan.
- `ActivityView` tetap di-key `${view}-${month}`. Perubahan bulan memicu remount tapi `scope`/`wallet` sudah ada di URL, jadi pilihan report dipertahankan lewat props awal.

### `activityUrl.ts`

- `ActivityViewMode = "active" | "ringkasan" | "trash"`.
- `ActivityTypeFilter = "all" | "in" | "out" | "transfer"`.
- `activityHref` menerima `filter`, `wallet`, `reportScope`, `reportWalletId`.
  - `view=active` ditulis eksplisit hanya bila ada `filter` atau `wallet` (agar tautan AC-F7-6 berbentuk `?view=active&month=...&filter=out`).
  - `view=ringkasan` selalu ditulis.
  - `scope=personal` ditulis untuk ringkasan; `shared` dihilangkan.
  - `wallet` ditulis untuk active (filter dompet) atau ringkasan (dompet laporan).
- `activityListUrl` mengirim `type=MONEY_IN|MONEY_OUT` untuk `filter=in|out` (AC-F2-6), sehingga cursor dan pagination mengikuti filter tipe. `filter=transfer` tetap client-side. Tidak ada perubahan kontrak list.
- Test URL diperluas untuk ketiga view, filter, scope, wallet, dan add intent.

### `ActivityView.tsx`

- `initialView` mencakup `ringkasan`; `initialFilter`, `initialWalletId`, `initialReportScope`, `initialReportWalletId` baru.
- State `listFilter` diinisialisasi dari `initialFilter` (`in`→`MONEY_IN`, `out`→`MONEY_OUT`).
- State `walletId` diinisialisasi dari `initialWalletId`; dropdown transaksi hanya menampilkan dompet non-arsip, tetapi dompet arsip yang sedang terpilih tetap ditampilkan dengan akhiran `, Arsip` agar URL dari ringkasan tidak menghasilkan pilihan kosong.
- Fetch wallet diubah ke `/api/wallets?view=all`; daftar transaksi tetap memfilter `archivedAt === null` kecuali dompet terpilih.
- Tiga tab: `Transaksi`, `Ringkasan`, `Trash`; `role="tablist"`, `aria-label="Tampilan aktivitas"`.
  - `<480px`: `px-4 gap-1.5`; `>=480px`: `sm:px-5 sm:gap-2`.
  - `min-h-11`, `text-sm`, `flex-wrap`, tanpa scroll horizontal.
  - Tab Ringkasan tidak pernah dirender untuk state Trash (tab tetap ada, tetapi Trash bukan state yang menampilkan panel Ringkasan).
- Kontrol bulan dirender untuk `active` dan `ringkasan`; tidak untuk `trash`.
- Filter tanggal hanya dirender untuk `active`.
- `writeUrl` diperluas dan menjadi satu-satunya penulis URL. Ganti bulan mempertahankan `scope`/`wallet` report dan `filter`/`wallet` transaksi. Ganti tab mempertahankan bulan.
- Blok `Ringkasan aktivitas` lama dihapus. Di tempatnya, untuk view active dan list siap, render ghost link `Lihat ringkasan bulan ini` dengan `activityHref({ view: "ringkasan", month, reportScope: "shared" })`.
- `MonthlyReport` dirender saat `view === "ringkasan"`, menerima `month`, `wallets`, `walletsLoading`, `walletsError`, `scope`, `walletId`, callbacks, dan `onAddTransaction`.
- Jika `wallets` selesai dimuat dan `scope === "personal"` tetapi tidak ada dompet pribadi, reset ke `shared` dan tulis URL.
- Jika `reportWalletId` tidak ada di daftar dompet cakupan, reset ke `Semua dompet` dan tampilkan notice.
- `changeView("ringkasan")` mereset filter transaksi dan tanggal, tidak mereset bulan.

### `MonthlyReport.tsx`

Client component. Menangani fetch sendiri dengan `apiRequest<MonthlyReportDTO>` dan abort saat props berubah.

- URL: `/api/reports/monthly?month=...&scope=...&walletId=...`.
- State: `data`, `loading`, `error`, `reloadToken`.
- 401 → `/login`; 403 → `/waiting-for-approval` (pola ActivityView).
- Kontrol cakupan + dompet selalu terlihat, termasuk saat loading/error.
- Cakupan: `SegmentedControl` `Pribadi`/`Bersama`, default `Bersama`, `aria-label="Lingkup laporan"`. Opsi `Pribadi` disabled bila tidak ada dompet pribadi; alasan tampil di bawah kontrol.
- Dompet: native `select`, label `Dompet`, `aria-label="Pilih dompet"`, `min-h-11`; opsi default `Semua dompet ({n})`; opsi `{nama}` atau `{nama}, Arsip`; hanya dompet cakupan aktif.
- Ganti cakupan: `onScopeChange` mereset dompet ke `Semua dompet` di parent dan menulis satu URL (diam, tanpa toast; AC-F7-8).
- Ganti dompet: panggil `onWalletChange(id)`.
- Loading: skeleton shape sama. Kartu navy memakai `animate-pulse bg-white/10 motion-reduce:animate-none`; kartu putih memakai `Skeleton`.
- Error: satu `Card variant="danger"` menggantikan seluruh blok laporan: judul `Laporan belum bisa dimuat.`, body `Kendala jaringan menghentikan pengambilan data.`, tombol `Coba lagi` memanggil `reloadToken++`.
- Empty:
  - `transactionCount === 0` + tanpa dompet: kartu utama + jejak + grafik tetap dirender; dua kartu grup diganti satu band dengan `Belum ada transaksi pada {bulan}.` + `Tambah transaksi`.
  - `transactionCount === 0` + dompet dipilih: band `Belum ada transaksi pada dompet {nama} untuk {bulan}.` + `Tambah transaksi`.
  - satu arah kosong: kartu arah itu menampilkan `Belum ada pemasukan pada {bulan}.` / `Belum ada pengeluaran pada {bulan}.`, tanpa tombol.
- Kartu Sisa: `Card variant="navy"`, label adaptif, nominal `formatIDR`, delta hanya bila ada pembanding, explainer.
- Jejak saldo: 4 sel + baris `Saldo awal dompet baru` bila perlu + baris `Transfer masuk`/`Transfer keluar` bila perlu + helper invarian kondisional.
- Kartu grup: badge, total, delta, maksimal 4 kategori + `Tanpa kategori` + `Lainnya (n)`, subtotal; tautan `Lihat semua pengeluaran` hanya di kartu Pengeluaran.
- Grafik: `BalanceMovementChart`.
- Catatan kaki: 1) jumlah transaksi + rentang tanggal panjang, 2) transfer selalu, 3) cakupan + dompet, 4) backdate kondisional.

### `BalanceMovementChart.tsx`

Client component baru, mengulang pola interaksi/a11y `SpendingChart`.

- Props: `data`, `monthLabel`, `scopeLabel`.
- SVG line + area, `#1D4F87` garis, `#DCEBFA` area, `#E5EDF5` baseline 0 bila ada nilai negatif.
- Kontainer `w-full min-w-0`, tinggi `h-40 sm:h-56`, `preserveAspectRatio="none"`, `vectorEffect="non-scaling-stroke"`.
- Semua hari digambar; tidak ada filter hari kosong.
- Label sumbu pertama, terakhir, dan tiap 7 hari; anchor kiri/kanan di tepi.
- Tooltip pill navy dengan teks `{Hari}, {tgl} {bln}: {formatIDR}`; posisi clamp seperti `SpendingChart`.
- Satu Tab stop pada grup; `ArrowLeft/Right`, `Home/End`, `Escape`; titik aktif diberi ring; teks pill dicerminkan ke `aria-live="polite"`.
- `aria-label` grup: `Grafik saldo harian {bersama|pribadi}, {bulan}. Gunakan panah kiri kanan untuk membaca saldo tiap tanggal.`
- Judul `Pergerakan saldo harian`; helper `Saldo akhir tiap hari pada {bulan}. Tap atau gunakan panah untuk melihat nilai tiap tanggal.`

### `SegmentedControl.tsx`

Tambahkan `disabled?: boolean` dan `disabledReason?: string` pada `SegmentedOption`. Perilaku:

- Opsi disabled: `disabled`, `aria-disabled`, `tabIndex={-1}`, tidak memanggil `onChange`, teks tetap kontras (`text-[#46597A]`), `cursor-not-allowed`.
- Navigasi keyboard melewati opsi disabled; `Home`/`End` mencari opsi enabled terdekat.
- Semua pemakaian lama tetap kompatibel karena field baru opsional.

## Konflik Spec yang Harus Disetujui PM

> **Putusan PM 2026-10-25: disetujui.** Spec AC-F7-4 diamanatkan agar invarian memuat `transfer masuk − transfer keluar`; design 08 §6.4 juga sudah diamanatkan. Baris `Tanpa kategori` di luar kuota empat, delta nol sebagai `Naik Rp0`, dan backdate pada saldo awal dompet baru juga disetujui sebagai bagian dari amandemen yang sama.

AC-F7-4 menetapkan invarian `saldo akhir = saldo awal + masuk - keluar + penyesuaian dompet baru` untuk **setiap** kombinasi bulan, cakupan, dan dompet. AC-F7-12 menetapkan kaki transfer tidak masuk `Masuk`/`Keluar` tetapi tetap mempengaruhi `Saldo akhir`. Untuk transfer lintas cakupan, atau transfer pada dompet terpilih, `transferNet != 0`, sehingga kedua AC tidak bisa benar bersamaan tanpa baris penyesuaian transfer.

**Resolusi yang dipakai plan ini:** server mengekspos `transferInMinor`/`transferOutMinor`; UI menampilkan baris `Transfer masuk` dan/atau `Transfer keluar` hanya bila nilainya bukan nol, dan helper invarian menyebut transfer secara kondisional. Ini menyelamatkan AC-F7-4, AC-F7-9, dan AC-F7-12 sekaligus, tetapi menambah dua baris yang tidak ada di copy deck design 08 §6.4. Deviasi ini transparan dan **wajib disetujui PM** sebelum rilis. Bila PM memilih mempertahankan copy deck persis, spec harus diubah lebih dulu; implementasi tidak boleh menampilkan angka yang tidak bisa diaudit.

Interpretasi kecil lain yang dicatat:

- `Tanpa kategori` tidak dihitung dalam kuota empat kategori bernama, mengikuti design 08 §6.5.
- Delta nol dirender `Naik Rp0 dari bulan lalu` karena copy deck hanya menyediakan `Naik`/`Turun`; tidak ada persentase atau chip `Baru`.
- Saldo awal dompet baru memakai `opening_balance_minor` saja. Transaksi sebelum periode pada dompet baru dimasukkan ke `openingMinor` agar saldo awal yang ditampilkan adalah saldo nyata dan rekonsiliasi dashboard tetap tepat.

## Test Plan

### Unit/route server

File: `app/api/reports/monthly/report-routes.test.ts`, fake: `lib/server/testing/report-fakes.ts`.

- default shared current month mengembalikan `MonthlyReportDTO` lengkap dan `closingMinor` sama dengan `sharedBalanceMinor` dashboard.
- scope personal hanya memuat dompet `PERSONAL` milik actor; dompet pribadi anggota lain tidak terlihat, termasuk bagi Owner.
- `walletId` mempersempit opening, in/out, kategori, grafik, dan closing ke satu dompet.
- dompet arsip tetap dihitung dan tetap muncul di `listScopedWallets`.
- transfer dalam satu cakupan + semua dompet: `moneyIn`/`moneyOut` tidak berubah, `transferIn == transferOut`, `closing` tidak berubah.
- transfer lintas cakupan: laporan Bersama hanya melihat kaki masuk; laporan Pribadi hanya melihat kaki keluar; tidak ada kebocoran.
- dompet baru di tengah periode dengan opening > 0: `newWalletOpeningMinor` muncul dan invarian tepat.
- dompet dibuat setelah periode berakhir dengan transaksi backdate: ikut dihitung, transaksi muncul di in/out, `hasBackdatedNewWallet` true.
- dompet dibuat setelah periode berakhir tanpa aktivitas: tidak dihitung pada bulan lampau.
- transaksi soft-deleted tidak dihitung.
- kategori: maksimal 4 kategori bernama, `Tanpa kategori` terpisah, `Lainnya (n)` memuat nominal gabungan, subtotal = total.
- delta: null saat bulan sebelumnya tidak punya data; bertanda saat ada data; tidak mencampur cakupan/dompet.
- grafik: jumlah titik = jumlah hari bulan, hari tanpa transaksi tetap ada, nilai kumulatif benar.
- validasi: month invalid/scope invalid/walletId bukan UUID → 422; wallet di luar cakupan/anggota lain → 404; personal tanpa dompet → 422; PENDING → 403.
- query `month`/`scope`/`walletId` diteruskan ke service dan `set-cookie` sliding ada.

### Unit client

File: `components/transactions/activityUrl.test.ts` (perluas).

- active tanpa filter tetap `/transactions?month=...`.
- active dengan `filter=out` menghasilkan `?view=active&month=...&filter=out`; `activityListUrl` memetakannya ke `type=MONEY_OUT` dan mempertahankan `type` pada halaman cursor berikutnya.
- filter `transfer` yang tetap client-side: halaman pertama tanpa match + `nextCursor` menampilkan `Muat lebih banyak`, bukan kosong palsu.
- ringkasan menghasilkan `?view=ringkasan&month=...`; scope personal dan wallet ikut.
- trash tidak menulis filter/scope/wallet.
- add intent tetap hanya `add=1` dan tidak menghapus view/month/filter/wallet.
- `from`/`to` hanya untuk active.

### Integration (dijalankan pada DB lokal)

- File: `lib/server/repositories/reports.integration.test.ts`.
- Seed dua wallet SHARING + satu PERSONAL + dompet arsip + dompet baru + dompet backdate; verifikasi opening, new-wallet opening, transfer, soft delete, kategori, 31 titik harian, scope terpisah, dan filter dompet arsip terhadap PostgreSQL nyata.
- Suite integration penuh masih memiliki satu kegagalan lama di `docs/qa/harness/t008-auth-lifecycle.integration.test.ts` (`household` relation pada `db.transaction.create`), tidak terkait Fitur 7.

## Task Breakdown

### Server

- [x] `types/api.ts`: DTO laporan.
- [x] `lib/server/contracts/reports.ts`: schema query.
- [x] `lib/server/http.ts`: `parseReportQuery`.
- [x] `lib/server/errors.ts`: `reportScopeUnavailable`.
- [x] `lib/server/services/period.ts`: `month(key)`.
- [x] `lib/server/repositories/reports.ts`: interface + raw SQL.
- [x] `lib/server/services/report.ts`: agregasi DTO, delta, kategori.
- [x] `lib/server/auth.ts`: wiring `reports`.
- [x] `app/api/reports/monthly/route.ts`.
- [x] `lib/server/testing/report-fakes.ts`.
- [x] `app/api/reports/monthly/report-routes.test.ts`.
- [x] `lib/server/repositories/reports.integration.test.ts`.
- [x] Update semua `AuthenticatedContext` literal di test yang sudah ada.

### Client

- [x] `components/transactions/activityUrl.ts` + test.
- [x] `app/transactions/page.tsx`: parse `view=ringkasan`, `filter`, `wallet`, `scope`.
- [x] `components/transactions/ActivityView.tsx`: tiga tab, kontrol bulan, URL writer, hapus ringkasan lama.
- [x] `components/ui/SegmentedControl.tsx`: opsi disabled.
- [x] `components/reports/MonthlyReport.tsx`.
- [x] `components/reports/BalanceMovementChart.tsx`.
- [x] Jejak saldo ditampilkan sebagai urutan hitung vertikal: saldo awal, arus plus/minus, lalu saldo akhir.
- [x] Extension F7.1: tombol print native, stylesheet A4 satu halaman ringkasan, dan detail transaksi mulai halaman kedua.
- [x] `components/reports/reportDetail.ts`: grouping, urutan stabil, label tanggal WIB, dan subtotal dari DTO laporan.
- [ ] Verifikasi manual hasil print/Save as PDF: warna, halaman ringkasan, pemisah halaman, dan rincian transaksi.

### Verifikasi

- [x] `bun run lint` (0 error, 13 warning lama di luar Fitur 7)
- [x] `bun run test` (516 test, 49 file, semua lulus)
- [x] `bunx tsc --noEmit`
- [x] `bunx vitest run -c vitest.integration.config.mts lib/server/repositories/reports.integration.test.ts` (4 test lulus)
- [ ] Cek manual 360px/390px/768px/1280px untuk tab, kartu, dan grafik
- [x] Update Progress Log + Keputusan Teknis

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-25 | Dev plan disusun | Konflik AC-F7-4 vs AC-F7-12 dicatat di §Konflik Spec; butuh persetujuan PM sebelum rilis. |
| 2026-10-25 | Server lengkap: DTO, kontrak, periode, repository SQL, service, route, fake, unit test | `scope` DTO dipetakan `SHARING` internal menjadi `SHARED` wire. Unit route 17 test lulus. |
| 2026-10-25 | Client lengkap: URL, page, tiga tab, kontrol scope/dompet, `MonthlyReport`, `BalanceMovementChart`, `SegmentedControl` disabled | Ganti cakupan memakai satu URL writer dari parent. `initialReportWalletId` hanya diisi saat `view=ringkasan`. |
| 2026-10-25 | Verifikasi | `bun run lint` 0 error (13 warning lama); `bun run test` 516/516; `bunx tsc --noEmit` bersih; integration report 4/4 lulus. Suite integration penuh gagal di T-008 lama, bukan Fitur 7. |
| 2026-10-25 | Perbaikan 4 temuan QA Fitur 7 (BUG-QA-F7-01..04) | Filter Uang masuk/keluar kini server-side lewat `type`; filter client-side menampilkan `Muat lebih banyak` saat halaman kosong; copy invarian dan footnote diselaraskan; tablist memakai `aria-controls` + `role="tabpanel"`. `bun run lint` 0 error (13 warning lama), `bun run test` 523/523 (50 file), `bunx tsc --noEmit` bersih, targeted activityUrl + activityRows 21/21. Integration tidak dijalankan ulang karena tidak ada perubahan area server. |
| 2026-10-25 | QA putaran 1: verdict PASS WITH RISKS, 14 PASS / 1 PARTIAL, 4 bug (laporan `docs/qa/feat-reporting-verification.md`) | AC-F7-13 PARTIAL karena dua state hanya via inspeksi dan 360px belum diuji saat itu. |
| 2026-10-25 | QA putaran 2 (regresi): 4/4 bug PASS, tidak ada regresi produk, rekomendasi ship | `bun run test` 523/523; lint 0 error; tsc bersih; probe fitur 6/6, undo/trash 3/3, add-intent 12/13 (1 kandidat flaky pre-existing di spek test, bukan produk). Follow-up yang dilacak PM: (1) test permanen untuk copy invarian, gating footnote, dan atribut tab; (2) perbaiki locator ambigu `e2e/transaction-add-intent.spec.ts:212` (test-only, pre-existing). |
| 2026-10-25 | Implementasi extension F7.1: print stylesheet dan detail transaksi multi-halaman | `MonthlyReport` mengambil semua cursor sebelum memanggil dialog print; helper mengelompokkan jenis transaksi, menjaga urutan tanggal/id, serta memakai total ringkasan untuk subtotal. Layout cetak dipadatkan untuk A4 portrait dan detail dipaksa mulai halaman kedua. Verifikasi browser print masih terbuka. |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? | Persetujuan |
|---|---|---|---|---|
| 2026-10-25 | Satu endpoint `GET /api/reports/monthly` | AC-F7-14: satu sumber angka per kombinasi filter; client tidak menjumlahkan baris. | Tidak | PM-approved 2026-10-25 |
| 2026-10-25 | Raw SQL `$queryRaw` dengan CTE + bigint `::text` | Menghindari cast int32 dan menjaga presisi agregasi; limitasi Prisma groupBy pada kategori/transfer. | Tidak | PM-approved 2026-10-25 |
| 2026-10-25 | `openingMinor` memasukkan transaksi sebelum periode pada dompet baru; `newWalletOpeningMinor` hanya opening balance | Menjaga invarian dan rekonsiliasi dashboard untuk dompet baru dengan riwayat backdate sebelum periode. | Perlu catatan PM (spec belum mengatur kasus ini) | PM-approved 2026-10-25 |
| 2026-10-25 | Baris `Transfer masuk`/`Transfer keluar` kondisional di jejak saldo | Satu-satunya cara memenuhi AC-F7-4, AC-F7-9, dan AC-F7-12 bersamaan saat `transferNet != 0`. | **Ya, wajib persetujuan PM** | PM-approved 2026-10-25 |
| 2026-10-25 | `Tanpa kategori` di luar kuota 4 kategori bernama | Mengikuti design 08 §6.5 dan menjaga audit subtotal. | Tidak | PM-approved 2026-10-25 |
| 2026-10-25 | Delta nol memakai `Naik Rp0 dari bulan lalu` | Copy deck hanya menyediakan Naik/Turun; tidak boleh mengarang copy baru. | Tidak | PM-approved 2026-10-25 |
| 2026-10-25 | Wallet list client memakai `/api/wallets?view=all`, filter transaksi tetap menyembunyikan arsip kecuali yang terpilih | Report butuh dompet arsip; tab Transaksi tidak boleh berubah perilaku. | Tidak | PM-approved 2026-10-25 |
| 2026-10-25 | Integration test repository report ditambahkan | Raw SQL CTE tidak bisa dibuktikan oleh fake; test PostgreSQL nyata memverifikasi transfer, arsip, dompet baru, backdate, soft delete, dan seri harian. | Tidak | PM-approved 2026-10-25 |
| 2026-10-25 | BUG-QA-F7-01: footnote dompet backdate tidak merujuk baris yang belum tentu tampil | Baris `Saldo awal dompet baru` hanya dirender saat nilainya bukan nol, jadi kalimat footnote harus berdiri sendiri. | Tidak | Putaran 1 QA, PM-approved |
| 2026-10-25 | BUG-QA-F7-02: helper invarian memakai copy deck #13 (`ditambah ... dan ...`) | Design 08 §6.4 adalah satu sumber kebenaran; baris yang tidak ada tidak diucapkan pada varian ringkas. | Tidak | Putaran 1 QA, PM-approved |
| 2026-10-25 | BUG-QA-F7-03: tablist memakai `aria-controls` dan panel `role="tabpanel"` berlabel | Mengikuti pola ARIA tabs baku; aditif, tanpa mengubah perilaku atau navigasi tab. | Tidak | Putaran 1 QA, PM-approved |
| 2026-10-25 | BUG-QA-F7-04: filter Uang masuk/keluar dipetakan ke `type` server-side; filter client-side menawarkan `Muat lebih banyak` saat halaman kosong | Pagination dihitung setelah filter tipe, dan halaman tanpa match tidak lagi tampil sebagai kosong palsu. | Tidak | Putaran 1 QA, PM-approved |

## Mapping AC ke File/Test

| AC | Implementasi | Test |
|---|---|---|
| AC-F7-1 | `app/transactions/page.tsx`, `ActivityView.tsx`, `activityUrl.ts` | `activityUrl.test.ts`; manual 360/390 |
| AC-F7-2 | `ActivityView.tsx` (satu kontrol bulan), `activityUrl.ts` | `activityUrl.test.ts`; route test bulan |
| AC-F7-3 | `MonthlyReport.tsx` kartu navy | route test DTO; manual label bulan |
| AC-F7-4 | `reports.ts` SQL opening/new wallet, `MonthlyReport.tsx` jejak | `report-routes.test.ts` invariant, new wallet, backdate; `reports.integration.test.ts` |
| AC-F7-5 | `report.ts` breakdown, `MonthlyReport.tsx` kartu Pemasukan | route test kategori + subtotal |
| AC-F7-6 | `MonthlyReport.tsx` link, `activityUrl.ts` filter/wallet | `activityUrl.test.ts`; manual link |
| AC-F7-7 | `SegmentedControl.tsx`, `MonthlyReport.tsx`, `report.ts` scope | route test personal privacy + no wallet 422 |
| AC-F7-8 | `MonthlyReport.tsx` select, `reports.ts` scoped wallets | route test wallet filter + arsip; `reports.integration.test.ts` |
| AC-F7-9 | `reports.ts` closing, dashboard parity | route test current-month parity |
| AC-F7-10 | `report.ts` delta, `MonthlyReport.tsx` delta | route test null/bertanda; manual copy |
| AC-F7-11 | `BalanceMovementChart.tsx`, `reports.ts` daily SQL | route test titik/hari; `reports.integration.test.ts`; manual 390/768/1280 |
| AC-F7-12 | `reports.ts` transferIn/Out, `MonthlyReport.tsx` footnote/rows | route test transfer same/cross scope; `reports.integration.test.ts` |
| AC-F7-13 | `MonthlyReport.tsx` loading/empty/error, `ActivityView.tsx` wallet fallback | manual + route error/empty |
| AC-F7-14 | Satu fetch `MonthlyReport.tsx`, hapus summary lama | `ActivityView` review; route test single DTO |
| AC-F7-15 | `MonthlyReport.tsx` footer, no Potongan/Tabungan | manual copy review; lint |
| AC-F7-16 | `MonthlyReport.tsx`, `app/globals.css` | manual dialog print dan print stylesheet |
| AC-F7-17 | `MonthlyReport.tsx`, `reportDetail.ts` | `reportDetail.test.ts`; manual pagination dan page break |
