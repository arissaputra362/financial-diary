import type { Db } from "./types";
import type { WalletActor } from "./ledger";

/*
  Monthly report reads (feat-reporting). One scoped wallet set feeds every
  figure, so "Bersama" and "Pribadi" can never be mixed (A-44). All sums are
  aggregated by Postgres as bigint and transferred as text; the application
  converts them to number only at the DTO boundary, never through int32.
*/

export interface ReportPeriod {
  start: Date;
  end: Date;
  periodStartDateOnly: string;
  periodEndDateOnly: string;
}

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
    query: {
      scope: "PERSONAL" | "SHARING";
      walletId?: string;
      period: ReportPeriod;
      previous: ReportPeriod;
    },
  ): Promise<ReportAggregate>;
}

type TotalRow = {
  opening: string;
  new_wallet_opening: string;
  money_in: string;
  money_out: string;
  transfer_in: string;
  transfer_out: string;
  tx_count: string;
  prev_opening: string;
  prev_new_wallet_opening: string;
  prev_money_in: string;
  prev_money_out: string;
  prev_transfer_in: string;
  prev_transfer_out: string;
  prev_tx_count: string;
  has_backdated_new_wallet: boolean;
};

type CategoryRow = {
  type: "MONEY_IN" | "MONEY_OUT";
  category: string | null;
  amount: string;
};

type DailyRow = {
  date: string;
  closing: string;
};

function minor(value: string | null | undefined): number {
  return Number(value ?? 0);
}

export function createReportRepository(db: Db): ReportRepository {
  return {
    async listScopedWallets(actor, scope, walletId) {
      const rows = await db.wallet.findMany({
        where: {
          householdId: actor.householdId,
          ...(scope === "SHARING"
            ? { scope: "SHARING" as const }
            : { scope: "PERSONAL" as const, createdByUserId: actor.userId }),
          ...(walletId ? { id: walletId } : {}),
        },
        select: {
          id: true,
          name: true,
          scope: true,
          openingBalanceMinor: true,
          archivedAt: true,
          createdAt: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({
        ...row,
        scope: row.scope as "PERSONAL" | "SHARING",
      }));
    },

    async aggregate(actor, { scope, walletId, period, previous }) {
      const [totalsRows, categoryRows, dailyRows] = await Promise.all([
        db.$queryRaw<TotalRow[]>`
          WITH scoped_wallets AS (
            SELECT w.id, w.opening_balance_minor::bigint AS opening_balance_minor, w.created_at
            FROM "wallet" w
            WHERE w.household_id = ${actor.householdId}::uuid
              AND w.scope::text = ${scope}
              AND (${walletId ?? null}::uuid IS NULL OR w.id = ${walletId ?? null}::uuid)
              AND (${scope} <> 'PERSONAL' OR w.created_by_user_id = ${actor.userId}::uuid)
          ),
          period_wallets AS (
            SELECT sw.* FROM scoped_wallets sw
            WHERE sw.created_at <= ${period.end}::timestamptz
               OR EXISTS (
                 SELECT 1 FROM "transaction" t
                 WHERE t.wallet_id = sw.id
                   AND t.deleted_at IS NULL
                   AND t.occurred_at >= ${period.start}::timestamptz
                   AND t.occurred_at <= ${period.end}::timestamptz
               )
          ),
          prev_wallets AS (
            SELECT sw.* FROM scoped_wallets sw
            WHERE sw.created_at <= ${previous.end}::timestamptz
               OR EXISTS (
                 SELECT 1 FROM "transaction" t
                 WHERE t.wallet_id = sw.id
                   AND t.deleted_at IS NULL
                   AND t.occurred_at >= ${previous.start}::timestamptz
                   AND t.occurred_at <= ${previous.end}::timestamptz
               )
          ),
          period_tx AS (
            SELECT t.* FROM "transaction" t
            JOIN period_wallets pw ON pw.id = t.wallet_id
            WHERE t.deleted_at IS NULL
              AND t.occurred_at >= ${period.start}::timestamptz
              AND t.occurred_at <= ${period.end}::timestamptz
          ),
          before_tx AS (
            SELECT t.* FROM "transaction" t
            JOIN period_wallets pw ON pw.id = t.wallet_id
            WHERE t.deleted_at IS NULL
              AND t.occurred_at < ${period.start}::timestamptz
          ),
          prev_tx AS (
            SELECT t.* FROM "transaction" t
            JOIN prev_wallets pw ON pw.id = t.wallet_id
            WHERE t.deleted_at IS NULL
              AND t.occurred_at >= ${previous.start}::timestamptz
              AND t.occurred_at <= ${previous.end}::timestamptz
          ),
          prev_before_tx AS (
            SELECT t.* FROM "transaction" t
            JOIN prev_wallets pw ON pw.id = t.wallet_id
            WHERE t.deleted_at IS NULL
              AND t.occurred_at < ${previous.start}::timestamptz
          ),
          opening AS (
            SELECT
              COALESCE(SUM(CASE WHEN pw.created_at < ${period.start}::timestamptz
                                THEN pw.opening_balance_minor ELSE 0 END), 0)::bigint
              + COALESCE((
                  SELECT SUM(CASE WHEN t.type::text = 'MONEY_IN'
                                  THEN t.amount_minor ELSE -t.amount_minor END)::bigint
                  FROM before_tx t
                ), 0)::bigint AS amount
            FROM period_wallets pw
          ),
          new_wallet AS (
            SELECT COALESCE(SUM(pw.opening_balance_minor), 0)::bigint AS amount
            FROM period_wallets pw
            WHERE pw.created_at >= ${period.start}::timestamptz
          ),
          period_totals AS (
            SELECT
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type::text = 'MONEY_IN'
                                THEN t.amount_minor END), 0)::bigint AS money_in,
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type::text = 'MONEY_OUT'
                                THEN t.amount_minor END), 0)::bigint AS money_out,
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type::text = 'MONEY_IN'
                                THEN t.amount_minor END), 0)::bigint AS transfer_in,
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type::text = 'MONEY_OUT'
                                THEN t.amount_minor END), 0)::bigint AS transfer_out,
              COUNT(*)::bigint AS tx_count
            FROM period_tx t
          ),
          prev_opening AS (
            SELECT
              COALESCE(SUM(CASE WHEN pw.created_at < ${previous.start}::timestamptz
                                THEN pw.opening_balance_minor ELSE 0 END), 0)::bigint
              + COALESCE((
                  SELECT SUM(CASE WHEN t.type::text = 'MONEY_IN'
                                  THEN t.amount_minor ELSE -t.amount_minor END)::bigint
                  FROM prev_before_tx t
                ), 0)::bigint AS amount
            FROM prev_wallets pw
          ),
          prev_new_wallet AS (
            SELECT COALESCE(SUM(pw.opening_balance_minor), 0)::bigint AS amount
            FROM prev_wallets pw
            WHERE pw.created_at >= ${previous.start}::timestamptz
          ),
          prev_totals AS (
            SELECT
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type::text = 'MONEY_IN'
                                THEN t.amount_minor END), 0)::bigint AS money_in,
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NULL AND t.type::text = 'MONEY_OUT'
                                THEN t.amount_minor END), 0)::bigint AS money_out,
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type::text = 'MONEY_IN'
                                THEN t.amount_minor END), 0)::bigint AS transfer_in,
              COALESCE(SUM(CASE WHEN t.transfer_group_id IS NOT NULL AND t.type::text = 'MONEY_OUT'
                                THEN t.amount_minor END), 0)::bigint AS transfer_out,
              COUNT(*)::bigint AS tx_count
            FROM prev_tx t
          ),
          backdate AS (
            SELECT EXISTS (
              SELECT 1 FROM period_wallets pw
              JOIN "transaction" t ON t.wallet_id = pw.id
              WHERE pw.created_at >= ${period.start}::timestamptz
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
          FROM opening, new_wallet, period_totals, prev_opening, prev_new_wallet, prev_totals, backdate
        `,
        db.$queryRaw<CategoryRow[]>`
          WITH scoped_wallets AS (
            SELECT w.id, w.opening_balance_minor::bigint AS opening_balance_minor, w.created_at
            FROM "wallet" w
            WHERE w.household_id = ${actor.householdId}::uuid
              AND w.scope::text = ${scope}
              AND (${walletId ?? null}::uuid IS NULL OR w.id = ${walletId ?? null}::uuid)
              AND (${scope} <> 'PERSONAL' OR w.created_by_user_id = ${actor.userId}::uuid)
          ),
          period_wallets AS (
            SELECT sw.* FROM scoped_wallets sw
            WHERE sw.created_at <= ${period.end}::timestamptz
               OR EXISTS (
                 SELECT 1 FROM "transaction" t
                 WHERE t.wallet_id = sw.id
                   AND t.deleted_at IS NULL
                   AND t.occurred_at >= ${period.start}::timestamptz
                   AND t.occurred_at <= ${period.end}::timestamptz
               )
          )
          SELECT t.type::text AS type, t.category AS category,
                 SUM(t.amount_minor)::text AS amount
          FROM "transaction" t
          JOIN period_wallets pw ON pw.id = t.wallet_id
          WHERE t.deleted_at IS NULL
            AND t.occurred_at >= ${period.start}::timestamptz
            AND t.occurred_at <= ${period.end}::timestamptz
            AND t.transfer_group_id IS NULL
          GROUP BY t.type, t.category
        `,
        db.$queryRaw<DailyRow[]>`
          WITH scoped_wallets AS (
            SELECT w.id, w.opening_balance_minor::bigint AS opening_balance_minor, w.created_at
            FROM "wallet" w
            WHERE w.household_id = ${actor.householdId}::uuid
              AND w.scope::text = ${scope}
              AND (${walletId ?? null}::uuid IS NULL OR w.id = ${walletId ?? null}::uuid)
              AND (${scope} <> 'PERSONAL' OR w.created_by_user_id = ${actor.userId}::uuid)
          ),
          period_wallets AS (
            SELECT sw.* FROM scoped_wallets sw
            WHERE sw.created_at <= ${period.end}::timestamptz
               OR EXISTS (
                 SELECT 1 FROM "transaction" t
                 WHERE t.wallet_id = sw.id
                   AND t.deleted_at IS NULL
                   AND t.occurred_at >= ${period.start}::timestamptz
                   AND t.occurred_at <= ${period.end}::timestamptz
               )
          ),
          before_tx AS (
            SELECT t.* FROM "transaction" t
            JOIN period_wallets pw ON pw.id = t.wallet_id
            WHERE t.deleted_at IS NULL
              AND t.occurred_at < ${period.start}::timestamptz
          ),
          opening AS (
            SELECT
              COALESCE(SUM(CASE WHEN pw.created_at < ${period.start}::timestamptz
                                THEN pw.opening_balance_minor ELSE 0 END), 0)::bigint
              + COALESCE((
                  SELECT SUM(CASE WHEN t.type::text = 'MONEY_IN'
                                  THEN t.amount_minor ELSE -t.amount_minor END)::bigint
                  FROM before_tx t
                ), 0)::bigint AS amount
            FROM period_wallets pw
          ),
          new_wallet AS (
            SELECT COALESCE(SUM(pw.opening_balance_minor), 0)::bigint AS amount
            FROM period_wallets pw
            WHERE pw.created_at >= ${period.start}::timestamptz
          ),
          days AS (
            SELECT generate_series(
              ${period.periodStartDateOnly}::date,
              ${period.periodEndDateOnly}::date,
              interval '1 day'
            )::date AS day
          ),
          daily_net AS (
            SELECT (t.occurred_at AT TIME ZONE 'Asia/Jakarta')::date AS day,
                   SUM(CASE WHEN t.type::text = 'MONEY_IN'
                            THEN t.amount_minor ELSE -t.amount_minor END)::bigint AS net
            FROM "transaction" t
            JOIN period_wallets pw ON pw.id = t.wallet_id
            WHERE t.deleted_at IS NULL
              AND t.occurred_at >= ${period.start}::timestamptz
              AND t.occurred_at <= ${period.end}::timestamptz
            GROUP BY 1
          )
          SELECT d.day::text AS date,
                 (opening.amount + new_wallet.amount
                  + COALESCE(SUM(COALESCE(dn.net, 0)) OVER (
                      ORDER BY d.day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ), 0)
                 )::text AS closing
          FROM days d
          CROSS JOIN opening
          CROSS JOIN new_wallet
          LEFT JOIN daily_net dn ON dn.day = d.day
          ORDER BY d.day
        `,
      ]);

      const totals = totalsRows[0];
      const openingMinor = minor(totals?.opening);
      const newWalletOpeningMinor = minor(totals?.new_wallet_opening);
      const moneyInMinor = minor(totals?.money_in);
      const moneyOutMinor = minor(totals?.money_out);
      const transferInMinor = minor(totals?.transfer_in);
      const transferOutMinor = minor(totals?.transfer_out);
      const prevOpening = minor(totals?.prev_opening);
      const prevNewOpening = minor(totals?.prev_new_wallet_opening);
      const prevMoneyIn = minor(totals?.prev_money_in);
      const prevMoneyOut = minor(totals?.prev_money_out);
      const prevTransferIn = minor(totals?.prev_transfer_in);
      const prevTransferOut = minor(totals?.prev_transfer_out);

      return {
        openingMinor,
        newWalletOpeningMinor,
        moneyInMinor,
        moneyOutMinor,
        transferInMinor,
        transferOutMinor,
        transactionCount: minor(totals?.tx_count),
        hasBackdatedNewWallet: totals?.has_backdated_new_wallet ?? false,
        categories: categoryRows.map((row) => ({
          type: row.type,
          category: row.category,
          amountMinor: minor(row.amount),
        })),
        dailyBalances: dailyRows.map((row) => ({
          date: row.date,
          closingMinor: minor(row.closing),
        })),
        previous: {
          hasData: minor(totals?.prev_tx_count) > 0,
          closingMinor:
            prevOpening + prevNewOpening + prevMoneyIn - prevMoneyOut + prevTransferIn - prevTransferOut,
          moneyInMinor: prevMoneyIn,
          moneyOutMinor: prevMoneyOut,
        },
      };
    },
  };
}
