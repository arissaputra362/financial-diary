import type { ReactNode } from "react";
import { formatIDR, formatSignedIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDTO } from "@/types/api";
import { CategoryIcon, isTransferLeg } from "./categories";

export interface TransactionRowProps {
  row: TransactionDTO;
  title: string;
  subtitle: string;
  note?: string | null;
  action?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  busy?: boolean;
  className?: string;
  transferAmount?: "signed" | "raw";
}

export function TransactionRow({
  row,
  title,
  subtitle,
  note = null,
  action,
  onOpen,
  openLabel,
  busy = false,
  className,
  transferAmount = "signed",
}: TransactionRowProps) {
  const transfer = isTransferLeg(row);
  const isIncome = row.type === "MONEY_IN";
  const signedAmount = formatSignedIDR(isIncome ? row.amountMinor : -row.amountMinor);
  const amount = transfer && transferAmount === "raw" ? formatIDR(row.amountMinor) : signedAmount;
  const longAmount = amount.length > 13;
  const amountColor = transfer ? "text-ink" : isIncome ? "text-green" : "text-ink";
  const content = (
    <>
      <CategoryIcon category={row.category} transfer={transfer} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-3">{subtitle}</span>
        {note ? (
          <span className="mt-0.5 block truncate text-[11px] leading-4 text-ink-3">{note}</span>
        ) : null}
        {longAmount ? (
          <span className={cn("mt-1 block text-sm font-bold tabular-nums sm:hidden", amountColor)}>
            {amount}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap font-bold tabular-nums",
          longAmount ? "hidden text-sm sm:block" : "text-[15px]",
          amountColor,
        )}
      >
        {amount}
      </span>
    </>
  );

  return (
    <li className={className}>
      <div className="flex items-center gap-2 py-2">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={busy}
            aria-label={openLabel}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 text-left hover:bg-mint"
          >
            {content}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
        )}
        {action}
      </div>
    </li>
  );
}
