/*
  Vector PDF for the monthly report. The summary owns page 1; transaction
  detail starts on page 2 and paginates with a repeated table header. Text is
  drawn with jsPDF (not a screenshot) so nothing is cut off at page edges.
*/

import { jsPDF } from "jspdf";
import { categoryLabel } from "@/components/transactions/categories";
import { formatIDR } from "@/lib/format";
import { formatReportDetailDate, type ReportLedgerRow } from "./reportDetail";
import type { MonthlyReportDTO, ReportBreakdownDTO } from "@/types/api";

type Rgb = readonly [number, number, number];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_RIGHT = MARGIN + CONTENT_W;

const INK: Rgb = [23, 48, 79];
const INK_2: Rgb = [70, 89, 122];
const INK_3: Rgb = [92, 113, 145];
const GREEN: Rgb = [22, 101, 52];
const DANGER: Rgb = [185, 28, 28];
const BORDER: Rgb = [216, 226, 238];
const SURFACE: Rgb = [244, 248, 251];
const WHITE: Rgb = [255, 255, 255];

const COL_DATE = MARGIN;
const COL_DESC = MARGIN + 62;
const COL_AMOUNT = CONTENT_RIGHT - 105;
const COL_BALANCE = CONTENT_RIGHT;
const DESC_W = COL_AMOUNT - COL_DESC - 80;

const generatedFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export type ReportPdfInput = {
  report: MonthlyReportDTO;
  ledger: ReportLedgerRow[];
  periodLabel: string;
  scopeLabel: string;
  walletLabel: string;
  generatedAt?: Date;
};

export type ReportPdfResult = {
  blob: Blob;
  filename: string;
};

function textColor(pdf: jsPDF, color: Rgb) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function fillColor(pdf: jsPDF, color: Rgb) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function drawColor(pdf: jsPDF, color: Rgb) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function formatSigned(amount: number): string {
  if (amount === 0) return formatIDR(0);
  return `${amount > 0 ? "+" : "-"}${formatIDR(Math.abs(amount))}`;
}

function shareLabel(amountMinor: number, totalMinor: number): string {
  if (totalMinor <= 0) return "0%";
  const share = Math.round((amountMinor / totalMinor) * 100);
  return share === 0 && amountMinor > 0 ? "<1%" : `${share}%`;
}

type CategoryRow = { name: string; amountMinor: number };

function categoryRows(breakdown: ReportBreakdownDTO): CategoryRow[] {
  const rows: CategoryRow[] = breakdown.categories.map((category) => ({
    name: categoryLabel(category.name),
    amountMinor: category.amountMinor,
  }));
  if (breakdown.otherCategoryCount > 0 && breakdown.otherAmountMinor > 0) {
    rows.push({
      name: `Lainnya (${breakdown.otherCategoryCount} kategori)`,
      amountMinor: breakdown.otherAmountMinor,
    });
  }
  if (breakdown.uncategorizedMinor > 0) {
    rows.push({ name: "Tanpa kategori", amountMinor: breakdown.uncategorizedMinor });
  }
  return rows;
}

function drawSummaryHeader(pdf: jsPDF, input: ReportPdfInput) {
  fillColor(pdf, GREEN);
  pdf.rect(0, 0, PAGE_W, 118, "F");
  textColor(pdf, WHITE);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("RINGKASAN BULANAN", MARGIN, 34);

  pdf.setFontSize(24);
  pdf.text(input.periodLabel, MARGIN, 64);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Cakupan: ${input.scopeLabel} - ${input.walletLabel}`, MARGIN, 84);

  pdf.setFontSize(8);
  pdf.text(`Dibuat ${generatedFormatter.format(input.generatedAt ?? new Date())}`, MARGIN, 98);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("FINDIARY", CONTENT_RIGHT, 34, { align: "right" });
}

function drawMetricCard(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  valueColor: Rgb,
) {
  fillColor(pdf, SURFACE);
  drawColor(pdf, BORDER);
  pdf.roundedRect(x, y, width, height, 8, 8, "FD");

  textColor(pdf, INK_3);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(label.toUpperCase(), x + 10, y + 16);

  textColor(pdf, valueColor);
  pdf.setFontSize(value.length > 18 ? 8.5 : value.length > 13 ? 10.5 : 13.5);
  pdf.text(value, x + 10, y + 36);
}

function drawSectionTitle(pdf: jsPDF, title: string, y: number) {
  fillColor(pdf, GREEN);
  pdf.rect(MARGIN, y - 8, 3, 10, "F");
  textColor(pdf, INK);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text(title, MARGIN + 8, y);
  return y + 16;
}

type MoneyRow = {
  label: string;
  value: string;
  color: Rgb;
  emphasis?: boolean;
};

function drawMoneyRows(pdf: jsPDF, rows: MoneyRow[], y: number) {
  for (const row of rows) {
    if (row.emphasis) {
      drawColor(pdf, BORDER);
      pdf.line(MARGIN, y - 10, CONTENT_RIGHT, y - 10);
    }
    pdf.setFont("helvetica", row.emphasis ? "bold" : "normal");
    pdf.setFontSize(9);
    textColor(pdf, row.emphasis ? INK : INK_2);
    pdf.text(row.label, MARGIN, y);
    textColor(pdf, row.color);
    pdf.text(row.value, CONTENT_RIGHT, y, { align: "right" });
    y += 16;
  }
  return y;
}

function drawCategorySection(
  pdf: jsPDF,
  title: string,
  breakdown: ReportBreakdownDTO,
  totalColor: Rgb,
  y: number,
) {
  y = drawSectionTitle(pdf, title, y);
  const rows = categoryRows(breakdown);

  if (rows.length === 0) {
    textColor(pdf, INK_3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Belum ada data pada periode ini.", MARGIN, y);
    return y + 20;
  }

  for (const row of rows) {
    textColor(pdf, INK);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(row.name, MARGIN, y);

    textColor(pdf, INK_3);
    pdf.setFontSize(8);
    pdf.text(shareLabel(row.amountMinor, breakdown.totalMinor), CONTENT_RIGHT - 96, y, {
      align: "right",
    });

    textColor(pdf, INK);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(formatIDR(row.amountMinor), CONTENT_RIGHT, y, { align: "right" });
    y += 15;
  }

  drawColor(pdf, BORDER);
  pdf.line(MARGIN, y - 9, CONTENT_RIGHT, y - 9);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  textColor(pdf, INK_2);
  pdf.text("Subtotal", MARGIN, y + 4);
  textColor(pdf, totalColor);
  pdf.text(formatIDR(breakdown.totalMinor), CONTENT_RIGHT, y + 4, { align: "right" });
  return y + 22;
}

function drawBalanceTrace(
  pdf: jsPDF,
  dailyBalances: MonthlyReportDTO["dailyBalances"],
  y: number,
) {
  if (dailyBalances.length < 2) return y;

  y = drawSectionTitle(pdf, "Jejak saldo harian", y);
  const chartTop = y;
  const chartHeight = 82;
  const values = dailyBalances.map((point) => point.closingMinor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pointX = (index: number) => MARGIN + (index / (dailyBalances.length - 1)) * CONTENT_W;
  const pointY = (value: number) => chartTop + chartHeight - ((value - min) / span) * chartHeight;

  textColor(pdf, INK_3);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text(
    `Tertinggi ${formatIDR(max)}  |  Terendah ${formatIDR(min)}`,
    CONTENT_RIGHT,
    chartTop - 4,
    { align: "right" },
  );

  drawColor(pdf, BORDER);
  pdf.line(MARGIN, chartTop + chartHeight, CONTENT_RIGHT, chartTop + chartHeight);
  pdf.line(MARGIN, chartTop, CONTENT_RIGHT, chartTop);

  drawColor(pdf, GREEN);
  pdf.setLineWidth(1.4);
  for (let index = 1; index < dailyBalances.length; index += 1) {
    pdf.line(
      pointX(index - 1),
      pointY(values[index - 1]),
      pointX(index),
      pointY(values[index]),
    );
  }
  pdf.setLineWidth(1);

  textColor(pdf, INK_3);
  pdf.setFontSize(7);
  pdf.text(formatReportDetailDate(dailyBalances[0].date), MARGIN, chartTop + chartHeight + 10);
  pdf.text(
    formatReportDetailDate(dailyBalances[dailyBalances.length - 1].date),
    CONTENT_RIGHT,
    chartTop + chartHeight + 10,
    { align: "right" },
  );

  return chartTop + chartHeight + 24;
}

function drawDetailHeader(pdf: jsPDF, input: ReportPdfInput) {
  textColor(pdf, INK);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Rincian transaksi", MARGIN, 52);

  textColor(pdf, INK_3);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(
    `${input.periodLabel} - ${input.scopeLabel} - ${input.walletLabel} - ${input.report.transactionCount} transaksi`,
    MARGIN,
    68,
  );
  return 86;
}

function drawTableHeader(pdf: jsPDF, y: number) {
  fillColor(pdf, SURFACE);
  pdf.rect(MARGIN, y, CONTENT_W, 18, "F");

  textColor(pdf, INK_3);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text("TANGGAL", COL_DATE + 4, y + 12);
  pdf.text("KETERANGAN", COL_DESC, y + 12);
  pdf.text("NOMINAL", COL_AMOUNT, y + 12, { align: "right" });
  pdf.text("SISA", COL_BALANCE, y + 12, { align: "right" });
  return y + 18;
}

function drawFooters(pdf: jsPDF, input: ReportPdfInput) {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    drawColor(pdf, BORDER);
    pdf.line(MARGIN, PAGE_H - 36, CONTENT_RIGHT, PAGE_H - 36);
    textColor(pdf, INK_3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text(`FinDiary - Ringkasan ${input.periodLabel}`, MARGIN, PAGE_H - 22);
    pdf.text(`Halaman ${page} dari ${total}`, CONTENT_RIGHT, PAGE_H - 22, {
      align: "right",
    });
  }
}

function safeFilename(periodLabel: string): string {
  return `Ringkasan ${periodLabel}.pdf`
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createReportPdf(input: ReportPdfInput): ReportPdfResult {
  const { report } = input;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  pdf.setProperties({
    title: `Ringkasan ${input.periodLabel}`,
    subject: `Laporan ${input.periodLabel}`,
    author: "FinDiary",
    creator: "FinDiary",
  });

  drawSummaryHeader(pdf, input);
  let y = 140;
  const cardWidth = (CONTENT_W - 10) / 2;
  const cardHeight = 58;

  drawMetricCard(pdf, MARGIN, y, cardWidth, cardHeight, "Pengeluaran", formatIDR(report.moneyOutMinor), DANGER);
  drawMetricCard(pdf, MARGIN + cardWidth + 10, y, cardWidth, cardHeight, "Pemasukan", formatIDR(report.moneyInMinor), GREEN);
  y += cardHeight + 10;

  const spendingDelta = report.delta.moneyOutMinor;
  const deltaValue =
    spendingDelta === null
      ? "Belum ada pembanding"
      : spendingDelta === 0
        ? "Sama seperti bulan lalu"
        : `${spendingDelta < 0 ? "Turun" : "Naik"} ${formatIDR(Math.abs(spendingDelta))}`;
  const deltaColor = spendingDelta === null ? INK_3 : spendingDelta <= 0 ? GREEN : DANGER;

  drawMetricCard(pdf, MARGIN, y, cardWidth, cardHeight, "Saldo akhir", formatIDR(report.closingMinor), INK);
  drawMetricCard(pdf, MARGIN + cardWidth + 10, y, cardWidth, cardHeight, "Perubahan pengeluaran", deltaValue, deltaColor);
  y += cardHeight + 26;

  y = drawSectionTitle(pdf, "Arus saldo", y);
  const balanceRows: MoneyRow[] = [
    { label: "Saldo awal", value: formatIDR(report.openingMinor), color: INK_2 },
    { label: "Uang masuk", value: `+${formatIDR(report.moneyInMinor)}`, color: GREEN },
    { label: "Uang keluar", value: `-${formatIDR(report.moneyOutMinor)}`, color: DANGER },
  ];
  if (report.transferNetMinor !== 0) {
    balanceRows.push({
      label: "Transfer bersih",
      value: formatSigned(report.transferNetMinor),
      color: INK_2,
    });
  }
  balanceRows.push({
    label: "Saldo akhir",
    value: formatIDR(report.closingMinor),
    color: INK,
    emphasis: true,
  });
  y = drawMoneyRows(pdf, balanceRows, y) + 14;

  y = drawCategorySection(pdf, "Pengeluaran per kategori", report.expense, DANGER, y);
  y = drawCategorySection(pdf, "Pemasukan per kategori", report.income, GREEN, y);
  y = drawBalanceTrace(pdf, report.dailyBalances, y);

  const notes: string[] = [];
  if (report.newWalletOpeningMinor !== 0) {
    notes.push(`Saldo awal dompet baru ${formatIDR(report.newWalletOpeningMinor)} ikut dihitung.`);
  }
  if (report.hasBackdatedNewWallet) {
    notes.push("Ada transaksi pada dompet baru yang bertanggal sebelum dompet dibuat.");
  }
  if (notes.length > 0) {
    textColor(pdf, INK_3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    const lines = pdf.splitTextToSize(notes.join(" "), CONTENT_W);
    pdf.text(lines, MARGIN, y);
  }

  if (input.ledger.length > 0) {
    pdf.addPage();
    y = drawDetailHeader(pdf, input);
    y = drawTableHeader(pdf, y);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);

    for (const row of input.ledger) {
      const lines = pdf.splitTextToSize(row.description, DESC_W);
      const rowHeight = Math.max(15, lines.length * 11 + 5);

      if (y + rowHeight > PAGE_H - 56) {
        pdf.addPage();
        y = drawDetailHeader(pdf, input);
        y = drawTableHeader(pdf, y);
      }

      const summaryRow = row.kind === "opening" || row.kind === "closing";
      if (summaryRow) {
        fillColor(pdf, SURFACE);
        pdf.rect(MARGIN, y, CONTENT_W, rowHeight, "F");
      }

      textColor(pdf, INK_3);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(formatReportDetailDate(row.occurredAt), COL_DATE + 4, y + 10);

      textColor(pdf, INK);
      pdf.setFont("helvetica", summaryRow ? "bold" : "normal");
      pdf.setFontSize(8.5);
      pdf.text(lines, COL_DESC, y + 10);

      if (row.amountMinor === null) {
        textColor(pdf, INK_3);
        pdf.text("-", COL_AMOUNT, y + 10, { align: "right" });
      } else {
        textColor(pdf, row.amountMinor > 0 ? GREEN : INK);
        pdf.text(formatSigned(row.amountMinor), COL_AMOUNT, y + 10, { align: "right" });
      }

      textColor(pdf, INK);
      pdf.setFont("helvetica", "bold");
      pdf.text(formatIDR(row.balanceMinor), COL_BALANCE, y + 10, { align: "right" });

      drawColor(pdf, BORDER);
      pdf.line(MARGIN, y + rowHeight, CONTENT_RIGHT, y + rowHeight);
      y += rowHeight;
    }
  }

  drawFooters(pdf, input);

  return {
    blob: pdf.output("blob"),
    filename: safeFilename(input.periodLabel),
  };
}
