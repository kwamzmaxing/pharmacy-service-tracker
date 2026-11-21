// Invoice and tax summary PDFs, drawn with jsPDF (real text, small files).
import { jsPDF } from "jspdf"
import { feeText, fmtDate, invStatus, money, qtyText, termsText, categoryName, type Invoice, type TaxSummary } from "./model"

const INK: [number, number, number] = [22, 33, 29]
const MUTED: [number, number, number] = [94, 110, 104]
const LINE: [number, number, number] = [222, 230, 226]
const BRAND: [number, number, number] = [18, 86, 74]
const L = 18, R = 192 // page margins (A4 is 210mm wide)

function setup() {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...INK)
  return doc
}
const label = (doc: jsPDF, t: string, x: number, y: number, align: "left" | "right" = "left") => {
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
  const s = t.toUpperCase(), cs = 0.25
  // jsPDF doesn't allow for letter-spacing when right-aligning, so place it by hand
  const w = doc.getTextWidth(s) + cs * (s.length - 1)
  doc.text(s, align === "right" ? x - w : x, y, { charSpace: cs })
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK)
}
const lines = (doc: jsPDF, text: string, x: number, y: number, align: "left" | "right" = "left", gap = 4.6) => {
  const rows = text.split("\n").map((s) => s.trim()).filter(Boolean)
  rows.forEach((r, i) => doc.text(r, x, y + i * gap, { align }))
  return y + rows.length * gap
}
const rule = (doc: jsPDF, y: number, w = 0.2, color = LINE) => { doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(L, y, R, y) }

function imageFormat(dataUrl: string) {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG"
}

export function invoicePdf(inv: Invoice, logo?: string) {
  const doc = setup()
  let y = 20
  // Header: logo + "Invoice" on the left, who it's from on the right
  if (logo) {
    try {
      const p = doc.getImageProperties(logo)
      const h = Math.min(16, (p.height / p.width) * 48), w = (p.width / p.height) * h
      doc.addImage(logo, imageFormat(logo), L, y - 4, w, h, undefined, "FAST")
      y += h + 2
    } catch { /* skip a logo that can't be read */ }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(22)
  doc.text("Invoice", L, y + 4)
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...MUTED)
  doc.text(inv.number, L, y + 10)
  doc.setTextColor(...INK)
  if (invStatus(inv) === "paid") {
    doc.setDrawColor(...BRAND); doc.setTextColor(...BRAND); doc.setLineWidth(0.5)
    doc.roundedRect(L, y + 13, 34, 7, 1.2, 1.2)
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5)
    doc.text(`PAID ${fmtDate(inv.paidDate)}`.toUpperCase(), L + 17, y + 17.8, { align: "center" })
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK)
  }
  const f = inv.from
  doc.setFontSize(10)
  let ry = 20
  doc.setFont("helvetica", "bold"); doc.text(f.trading || f.name || "", R, ry, { align: "right" }); doc.setFont("helvetica", "normal")
  ry += 4.8
  if (f.trading && f.name) { doc.text(f.name, R, ry, { align: "right" }); ry += 4.6 }
  if (f.address) ry = lines(doc, f.address, R, ry, "right")
  for (const t of [f.phone, f.email, f.gphc ? `GPhC no. ${f.gphc}` : ""]) if (t) { doc.text(t, R, ry, { align: "right" }); ry += 4.6 }
  y = Math.max(y + 24, ry + 4)
  rule(doc, y, 0.6, INK)
  y += 9

  // Bill to | dates
  label(doc, "Bill to", L, y)
  doc.setFont("helvetica", "bold"); doc.text(inv.to.name || "-", L, y + 5.5); doc.setFont("helvetica", "normal")
  let by = y + 10.2
  if (inv.to.address) by = lines(doc, inv.to.address, L, by)
  if (inv.to.email) { doc.text(inv.to.email, L, by); by += 4.6 }
  const dates: [string, string][] = [["Invoice date", fmtDate(inv.issued)], ["Due date", fmtDate(inv.due)], ["Service period", inv.period]]
  dates.forEach(([k, v], i) => { label(doc, k, R, y + i * 10, "right"); doc.text(v, R, y + i * 10 + 5, { align: "right" }) })
  y = Math.max(by, y + 30) + 6

  // Lines
  const col = { qty: 128, rate: 158, amt: R }
  doc.setFillColor(243, 246, 244); doc.rect(L, y - 5, R - L, 8, "F")
  label(doc, "Service", L + 2, y); label(doc, "Qty", col.qty, y, "right"); label(doc, "Rate", col.rate, y, "right"); label(doc, "Amount", col.amt - 2, y, "right")
  y += 8
  for (const l of inv.lines) {
    const name = doc.splitTextToSize(l.name, 92) as string[]
    if (y + name.length * 4.6 > 262) { doc.addPage(); y = 22 }
    doc.text(name, L + 2, y)
    doc.text(qtyText(l.qty, l.unit), col.qty, y, { align: "right" })
    doc.text(feeText(l.fee, l.unit), col.rate, y, { align: "right" })
    doc.text(money(l.amt), col.amt - 2, y, { align: "right" })
    y += name.length * 4.6 + 2.4
    rule(doc, y - 3.4)
    y += 2
  }
  y += 3
  doc.setFont("helvetica", "bold"); doc.setFontSize(13)
  doc.text("Total due", 140, y, { align: "right" }); doc.text(money(inv.total), R - 2, y, { align: "right" })
  doc.setFont("helvetica", "normal"); doc.setFontSize(10)
  y += 12

  const pay = inv.pay
  if (pay.sortCode || pay.accountNumber) {
    if (y > 240) { doc.addPage(); y = 22 }
    const rows: [string, string][] = [["Account name", pay.accountName], ["Bank", pay.bankName], ["Sort code", pay.sortCode], ["Account number", pay.accountNumber], ["Reference", inv.number]].filter(([, v]) => v) as [string, string][]
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3)
    doc.roundedRect(L, y - 5, 92, rows.length * 5.4 + 10, 1.5, 1.5)
    label(doc, "Payment details", L + 4, y)
    rows.forEach(([k, v], i) => {
      doc.setTextColor(...MUTED); doc.text(k, L + 4, y + 6 + i * 5.4)
      doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.text(v, L + 40, y + 6 + i * 5.4); doc.setFont("helvetica", "normal")
    })
    y += rows.length * 5.4 + 12
  }
  doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text(doc.splitTextToSize(termsText(inv.terms || "14th", inv.due), R - L) as string[], L, y)
  return doc
}

export const pdfBlob = (doc: jsPDF) => doc.output("blob")
export const pdfBase64 = (doc: jsPDF) => doc.output("datauristring").split(",")[1]

export function taxSummaryPdf(t: TaxSummary, who: string, opts: { scotland: boolean; vehicle: string; basis: string; otherIncome: number }) {
  const doc = setup()
  let y = 22
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text(`Tax estimate ${t.year.label}`, L, y)
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED)
  doc.text(`${who} · self-employment · ${fmtDate(t.year.from)} to ${fmtDate(t.year.to)} · produced ${fmtDate(new Date().toISOString().slice(0, 10))}`, L, y + 6.5)
  doc.setTextColor(...INK)
  y += 16
  rule(doc, y, 0.6, INK)
  y += 8
  const row = (k: string, v: string, bold = false, indent = 0) => {
    if (y > 270) { doc.addPage(); y = 22 }
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.text(k, L + indent, y); doc.text(v, R, y, { align: "right" })
    doc.setFont("helvetica", "normal")
    y += 6
  }
  const section = (t2: string) => { y += 2; label(doc, t2, L, y); y += 6 }
  section("Income")
  for (const l of t.incomeLines) row(l.label, money(l.amount), false, 3)
  if (t.method === "allowance") {
    section("Trading allowance")
    row(`Trading allowance (instead of expenses and mileage of ${money(t.expenses + t.mileage.amount)})`, `-${money(t.compare.allowance.deduct)}`, false, 3)
  } else {
    section("Allowable expenses")
    for (const c of t.byCategory) row(categoryName(c.category), `-${money(c.amount)}`, false, 3)
    if (t.miles > 0) row(`Mileage allowance (${Math.round(t.miles).toLocaleString("en-GB")} miles at HMRC rates)`, `-${money(t.mileage.amount)}`, false, 3)
    if (!t.byCategory.length && !t.miles) row("None recorded", money(0), false, 3)
  }
  y += 1; rule(doc, y - 4); row("Taxable profit", money(t.profit), true)
  if (t.property.income > 0) {
    row(`Rental income (${t.property.count})`, money(t.property.income), false, 3)
    row("Property allowance", `-${money(t.property.allowance)}`, false, 3)
    row("Taxable rental profit (income tax only)", money(t.property.taxable), true)
  }
  section("Income tax")
  if (opts.otherIncome) row(`Employment income included for bands: ${money(opts.otherIncome)}`, "", false, 3)
  row(`Personal allowance`, money(t.tax.allowance), false, 3)
  for (const l of t.tax.lines) row(`${l.label} on ${money(l.amount)}`, money(l.tax), false, 3)
  row(t.property.income > 0 ? "Income tax on your self-employment and rent" : "Income tax on your self-employment", money(t.incomeTaxDue), true)
  section("National Insurance")
  if (!t.ni.lines.length) row("Profit below the Class 4 threshold", money(0), false, 3)
  for (const l of t.ni.lines) row(`${l.label} on ${money(l.amount)}`, money(l.tax), false, 3)
  y += 2; rule(doc, y - 4, 0.6, INK)
  doc.setFontSize(12); row("Estimated total to pay", money(t.total), true); doc.setFontSize(10)
  y += 6
  doc.setFontSize(8.5); doc.setTextColor(...MUTED)
  const notes = [
    `Settings: ${opts.scotland ? "Scottish" : "England, Wales and Northern Ireland"} income tax rates; ${opts.basis === "cash" ? "cash basis (income counted when paid)" : "income counted when the work was done"}; vehicle: ${opts.vehicle}.`,
    `${t.year.label} rates: personal allowance £12,570; Class 4 National Insurance 6% on profits £12,570–£50,270 and 2% above; trading allowance ${money(t.allowance)}; mileage ${Math.round(t.mileage.rates.first * 100)}p a mile for the first 10,000 business miles, then ${Math.round(t.mileage.rates.after * 100)}p.`,
    `Expenses or trading allowance: claiming expenses and mileage gives tax and NI of ${money(t.compare.expenses.total)}; the trading allowance gives ${money(t.compare.allowance.total)}. This estimate uses ${t.method === "allowance" ? "the trading allowance" : "expenses and mileage"}. You can't claim both.`,
    ...(t.property.income > 0 ? ["Rental income uses the £1,000 property allowance instead of actual rental expenses, with no National Insurance (it is voluntary on rental income). If your rental expenses are more than £1,000, claiming them instead would lower the tax."] : []),
    "This is an estimate to help you plan. It is not financial or tax advice and doesn’t include student loans, pension contributions, savings interest, dividends or payments on account. Check your figures with HMRC or an accountant before filing.",
  ]
  for (const n of notes) { const t2 = doc.splitTextToSize(n, R - L) as string[]; if (y + t2.length * 4 > 285) { doc.addPage(); y = 22 } doc.text(t2, L, y); y += t2.length * 4 + 2 }
  return doc
}
