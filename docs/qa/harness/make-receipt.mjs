import { chromium } from "@playwright/test";
const html = `<!doctype html><html><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#fff">
<div style="width:520px;padding:28px;color:#111">
  <div style="text-align:center;font-size:24px;font-weight:800">WARUNG SEGAR JAYA</div>
  <div style="text-align:center;font-size:13px;margin-top:4px">Jl. Merdeka No. 12, Jakarta</div>
  <div style="text-align:center;font-size:13px">Telp 021-555-0199</div>
  <hr style="margin:16px 0;border:none;border-top:1px dashed #999"/>
  <div style="font-size:14px;line-height:1.7">
    <div>Tanggal: 06/10/2026 10:24</div>
    <div>Kasir: Siti</div>
    <div>No. Struk: 0042</div>
  </div>
  <hr style="margin:16px 0;border:none;border-top:1px dashed #999"/>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td>Beras Pandan 5kg</td><td style="text-align:right">Rp 65.000</td></tr>
    <tr><td>Minyak Goreng 2L</td><td style="text-align:right">Rp 34.000</td></tr>
    <tr><td>Telur Ayam 1kg</td><td style="text-align:right">Rp 28.000</td></tr>
    <tr><td>Sabun Cuci 1kg</td><td style="text-align:right">Rp 23.000</td></tr>
  </table>
  <hr style="margin:16px 0;border:none;border-top:1px dashed #999"/>
  <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800"><span>TOTAL</span><span>Rp 150.000</span></div>
  <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:8px"><span>TUNAI</span><span>Rp 200.000</span></div>
  <div style="display:flex;justify-content:space-between;font-size:14px"><span>KEMBALI</span><span>Rp 50.000</span></div>
  <div style="text-align:center;margin-top:20px;font-size:13px">Terima kasih telah berbelanja</div>
</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 700 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: "docs/qa/harness/fixtures/receipt.png", fullPage: true });
await browser.close();
console.log("receipt image written");
