/*
  Gold portfolio PDF. Page 1 is the valuation summary; the asset register
  starts on page 2 and paginates with a repeated table header. Values come from
  the same portfolio DTO the Emas page renders, so the report never invents a
  price.
*/

import { jsPDF } from "jspdf";
import { formatIDR } from "@/lib/format";
import { formatGrams } from "@/lib/gold";
import type { GoldAssetDTO, GoldPortfolioSummaryDTO } from "@/types/gold";

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

const COL_NAME = MARGIN;
const COL_WEIGHT = MARGIN + 145;
const COL_PURITY = MARGIN + 195;
const COL_DATE = MARGIN + 238;
const COL_VALUE = MARGIN + 355;
const COL_PNL = CONTENT_RIGHT - 55;
const COL_SCOPE = CONTENT_RIGHT;
const NAME_W = COL_WEIGHT - COL_NAME - 30;

const BRAND_LABELS: Record<GoldAssetDTO["brand"], string> = {
  ANTAM: "Antam",
  UBS: "UBS",
  LOTUS_ARCHI: "Lotus Archi",
  GALERI_24: "Galeri 24",
  OTHER: "Lainnya",
};

const generatedFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function textColor(pdf: jsPDF, color: Rgb) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function fillColor(pdf: jsPDF, color: Rgb) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function drawColor(pdf: jsPDF, color: Rgb) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function formatSourceDate(value: string): string {
  const date = new Date(`${value}T12:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? value : generatedFormatter.format(date);
}

function signedMoney(value: number): string {
  if (value === 0) return formatIDR(0);
  return `${value > 0 ? "+" : "-"}${formatIDR(Math.abs(value))}`;
}

function assetBrand(asset: GoldAssetDTO): string {
  return asset.brandCustomName?.trim() || BRAND_LABELS[asset.brand];
}

function assetKind(asset: GoldAssetDTO): string {
  return asset.type === "BULLION" ? "Batangan" : "Perhiasan";
}

function drawSummaryHeader(pdf: jsPDF, generatedAt: Date) {
  fillColor(pdf, GREEN);
  pdf.rect(0, 0, PAGE_W, 118, "F");
  textColor(pdf, WHITE);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("LAPORAN ASET EMAS", MARGIN, 34);
  pdf.setFontSize(24);
  pdf.text("Tabungan Emas", MARGIN, 64);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Catatan logam mulia dan perhiasan keluarga", MARGIN, 84);
  pdf.setFontSize(8);
  pdf.text(`Dibuat ${generatedFormatter.format(generatedAt)}`, MARGIN, 98);
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

function drawPriceReference(pdf: jsPDF, data: GoldPortfolioSummaryDTO, y: number) {
  y = drawSectionTitle(pdf, "Acuan harga", y);
  const prices = data.priceInfo?.prices ?? [];
  const antam = prices.find((price) => price.brand === "ANTAM");
  const ubs = prices.find((price) => price.brand === "UBS");
  const sourceDate = prices[0]?.sourceDate ?? "belum tersedia";

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  textColor(pdf, INK_2);
  const antamLabel = antam ? `Antam buyback ${formatIDR(antam.buybackPriceMinor)}/gr` : "Antam: belum tersedia";
  const ubsLabel = ubs ? `UBS buyback ${formatIDR(ubs.buybackPriceMinor)}/gr` : "UBS: belum tersedia";
  pdf.text(antamLabel, MARGIN, y);
  pdf.text(ubsLabel, MARGIN, y + 14);
  pdf.text(`Sumber harga: ${formatSourceDate(sourceDate)}`, MARGIN, y + 28);

  textColor(pdf, INK_3);
  pdf.setFontSize(7.5);
  const note = pdf.splitTextToSize(
    "Nilai pasar adalah estimasi berdasarkan harga buyback acuan. Harga jual aktual dapat berbeda di setiap toko dan bukan jaminan harga jual.",
    CONTENT_W,
  );
  pdf.text(note, MARGIN, y + 44);
  return y + 44 + note.length * 9 + 12;
}

function drawTableHeader(pdf: jsPDF, y: number) {
  fillColor(pdf, SURFACE);
  pdf.rect(MARGIN, y, CONTENT_W, 18, "F");
  textColor(pdf, INK_3);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("ASET", COL_NAME, y + 12);
  pdf.text("BERAT", COL_WEIGHT, y + 12);
  pdf.text("KADAR", COL_PURITY, y + 12);
  pdf.text("DIBELI", COL_DATE, y + 12);
  pdf.text("NILAI PASAR", COL_VALUE, y + 12, { align: "right" });
  pdf.text("LABA/RUGI", COL_PNL, y + 12, { align: "right" });
  pdf.text("CAKUPAN", COL_SCOPE, y + 12, { align: "right" });
  return y + 18;
}

function assetLines(pdf: jsPDF, asset: GoldAssetDTO): string[] {
  return pdf.splitTextToSize(asset.name, NAME_W);
}

export type GoldReportPdfResult = {
  blob: Blob;
  filename: string;
};

export function createGoldReportPdf(
  data: GoldPortfolioSummaryDTO,
  generatedAt: Date = new Date(),
): GoldReportPdfResult {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  const filename =
    `Laporan Aset Emas ${generatedAt.toISOString().slice(0, 10)}.pdf`
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  pdf.setProperties({
    title: "Laporan Aset Emas",
    subject: "Tabungan emas dan perhiasan",
    author: "FinDiary",
    creator: "FinDiary",
  });

  drawSummaryHeader(pdf, generatedAt);
  let y = 140;
  const cardWidth = (CONTENT_W - 10) / 2;
  const cardHeight = 58;
  const pnlColor = data.totalUnrealizedPnLMinor >= 0 ? GREEN : DANGER;

  drawMetricCard(pdf, MARGIN, y, cardWidth, cardHeight, "Total nilai pasar", formatIDR(data.totalEstimatedValueMinor), INK);
  drawMetricCard(pdf, MARGIN + cardWidth + 10, y, cardWidth, cardHeight, "Modal beli", formatIDR(data.totalCostBasisMinor), INK_2);
  y += cardHeight + 10;
  drawMetricCard(
    pdf,
    MARGIN,
    y,
    cardWidth,
    cardHeight,
    "Laba/rugi (estimasi)",
    `${signedMoney(data.totalUnrealizedPnLMinor)} (${data.totalUnrealizedPnLPercent}%)`,
    pnlColor,
  );
  drawMetricCard(pdf, MARGIN + cardWidth + 10, y, cardWidth, cardHeight, "Total berat", formatGrams(data.totalWeightGrams), INK);
  y += cardHeight + 24;

  textColor(pdf, INK_2);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    `${data.itemCount} item · Batangan ${formatGrams(data.bullionWeightGrams)} · Perhiasan ${formatGrams(data.jewelryWeightGrams)}`,
    MARGIN,
    y,
  );
  y += 24;

  y = drawPriceReference(pdf, data, y);

  if (data.assets.length === 0) {
    textColor(pdf, INK_3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Belum ada catatan aset emas.", MARGIN, y);
  } else {
    pdf.addPage();
    y = 52;
    textColor(pdf, INK);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Rincian aset", MARGIN, y);
    y += 18;
    textColor(pdf, INK_3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(
      `${data.itemCount} aset · ${formatGrams(data.totalWeightGrams)} · ${formatIDR(data.totalEstimatedValueMinor)}`,
      MARGIN,
      y,
    );
    y += 20;
    y = drawTableHeader(pdf, y);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    for (const asset of data.assets) {
      const lines = assetLines(pdf, asset);
      const rowHeight = Math.max(20, lines.length * 9 + 13);
      if (y + rowHeight > PAGE_H - 56) {
        pdf.addPage();
        y = 52;
        y = drawTableHeader(pdf, y);
      }

      textColor(pdf, INK);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.text(lines, COL_NAME, y + 10);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      textColor(pdf, INK_3);
      pdf.text(`${assetBrand(asset)} · ${assetKind(asset)}`, COL_NAME, y + 10 + lines.length * 9);

      textColor(pdf, INK_2);
      pdf.setFontSize(7.5);
      pdf.text(formatGrams(asset.weightGrams), COL_WEIGHT, y + 10);
      pdf.text(asset.purityLabel, COL_PURITY, y + 10);
      pdf.text(asset.purchaseDate, COL_DATE, y + 10);
      textColor(pdf, INK);
      pdf.text(formatIDR(asset.estimatedValuationMinor), COL_VALUE, y + 10, { align: "right" });
      textColor(pdf, asset.unrealizedPnLMinor >= 0 ? GREEN : DANGER);
      pdf.text(signedMoney(asset.unrealizedPnLMinor), COL_PNL, y + 10, { align: "right" });
      textColor(pdf, INK_3);
      pdf.text(asset.scope === "PERSONAL" ? "Pribadi" : "Bersama", COL_SCOPE, y + 10, { align: "right" });

      drawColor(pdf, BORDER);
      pdf.line(MARGIN, y + rowHeight, CONTENT_RIGHT, y + rowHeight);
      y += rowHeight;
    }
  }

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    drawColor(pdf, BORDER);
    pdf.line(MARGIN, PAGE_H - 36, CONTENT_RIGHT, PAGE_H - 36);
    textColor(pdf, INK_3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text("FinDiary - Laporan Aset Emas", MARGIN, PAGE_H - 22);
    pdf.text(`Halaman ${page} dari ${totalPages}`, CONTENT_RIGHT, PAGE_H - 22, { align: "right" });
  }

  return { blob: pdf.output("blob"), filename };
}
