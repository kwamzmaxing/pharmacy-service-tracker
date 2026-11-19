// Data model and pure helpers for the service tracker.

export type Service = { id: string; name: string; fee: number }
export type Entry = {
  id: string
  serviceId: string
  date: string // YYYY-MM-DD
  qty: number
  fee: number
  desc: string
  invoiced: boolean
  invoiceId?: string
  hours?: boolean
}
export type Terms = "14th" | "0" | "7" | "14" | "30"
export type Profile = {
  fullName: string
  tradingName: string
  gphc: string
  phone: string
  email: string
  address: string
  billToName: string
  billToEmail: string
  billToAddress: string
  accountName: string
  bankName: string
  sortCode: string
  accountNumber: string
  terms: Terms
  prefix: string
  nextNo: number
  /** Days after the due date before the first follow-up. */
  followUpDays: number
  /** Days between follow-ups after that. */
  followUpRepeat: number
  /** Add each invoice's due date to the account holder's Google Calendar. */
  calendar: boolean
  /** How invoice and follow-up emails go out by default. */
  sendVia: "mine" | "admin"
}
export type InvoiceLine = { name: string; fee: number; qty: number; amt: number }
export type Invoice = {
  id: string
  number: string
  issued: string
  due: string
  terms: Terms
  period: string
  from: { name: string; trading: string; address: string; phone: string; email: string; gphc: string }
  to: { name: string; address: string; email: string }
  pay: { accountName: string; bankName: string; sortCode: string; accountNumber: string }
  lines: InvoiceLine[]
  total: number
  entryIds: string[]
  status: "paid" | "unpaid"
  paidDate: string | null
  reminders: string[]
  created: string
  /** When the invoice email was first sent or drafted. */
  sentAt?: string | null
  sentVia?: "gmail" | "draft" | "admin" | "copied" | "email-app" | "marked"
  /** When a calendar reminder was added for the due date. */
  calendarAt?: string | null
}
export type Data = {
  services: Service[]
  entries: Entry[]
  invoices: Invoice[]
  profile: Profile
  meta: { ratesV?: string; [k: string]: unknown }
}
export type Status = "paid" | "unpaid" | "overdue"

/* ---------- small helpers ---------- */
export const uid = () => {
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("")
}
const pad = (n: number) => String(n).padStart(2, "0")
/** Local calendar date, never UTC (avoids off-by-one in UK summer time). */
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => isoOf(new Date())
export const parseISO = (s: string) => new Date(s + "T00:00:00")
export const addDays = (s: string, n: number) => {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return isoOf(d)
}
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
export const money = (n: number) =>
  "£" + (Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtDate = (s?: string | null) => {
  if (!s) return ""
  const d = parseISO(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}
export const plural = (n: number, w: string, p?: string) => `${n} ${n === 1 ? w : p || w + "s"}`
export const initials = (name: string) =>
  (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?"
export const entryAmt = (e: Pick<Entry, "qty" | "fee">) => (Number(e.qty) || 0) * (Number(e.fee) || 0)

/* ---------- defaults ---------- */
export const STD_SERVICES = (): Service[] => [
  { id: uid(), name: "Pharmacy First", fee: 2 },
  { id: uid(), name: "Hypertension Case Finding", fee: 2 },
  { id: uid(), name: "Contraception Service", fee: 2 },
  { id: uid(), name: "DMS Completed", fee: 4 },
  { id: uid(), name: "Flu Vaccine", fee: 2 },
  { id: uid(), name: "Covid Vaccine", fee: 2 },
  { id: uid(), name: "Travel Vaccine", fee: 5 },
  { id: uid(), name: "Anti-Malaria Sale", fee: 5 },
  { id: uid(), name: "Private Weight Loss Clinic", fee: 10 },
  { id: uid(), name: "Hours Worked (£25/hr)", fee: 25 },
]
export const defaultProfile = (): Profile => ({
  fullName: "", tradingName: "", gphc: "", phone: "", email: "", address: "",
  billToName: "", billToEmail: "", billToAddress: "",
  accountName: "", bankName: "", sortCode: "", accountNumber: "",
  terms: "14th", prefix: "INV", nextNo: 1,
  followUpDays: 0, followUpRepeat: 7, calendar: true, sendVia: "mine",
})
export function newData(name = ""): Data {
  const profile = defaultProfile()
  profile.fullName = name
  profile.accountName = name
  return { services: STD_SERVICES(), entries: [], invoices: [], profile, meta: { ratesV: "d1" } }
}
/** Fill in anything missing, so old back-ups and older saved data still load. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalize(raw: any): Data {
  const d = raw && typeof raw === "object" ? raw : {}
  const meta = d.meta && typeof d.meta === "object" ? d.meta : {}
  const profile: Profile = Object.assign(defaultProfile(), d.profile || {})
  if (!profile.fullName && meta.yourName) profile.fullName = meta.yourName
  if (!profile.billToName && meta.pharmacyName) profile.billToName = meta.pharmacyName
  const invoices: Invoice[] = (Array.isArray(d.invoices) ? d.invoices : []).map((i: Invoice) => ({
    ...i, reminders: i.reminders || [], to: i.to || { name: "", address: "", email: "" },
    from: i.from || ({} as Invoice["from"]), pay: i.pay || ({} as Invoice["pay"]), lines: i.lines || [],
  }))
  return {
    services: Array.isArray(d.services) ? d.services : STD_SERVICES(),
    entries: Array.isArray(d.entries) ? d.entries : [],
    invoices,
    profile,
    meta,
  }
}

/* ---------- date ranges ---------- */
export type RangeMode = "month" | "last" | "all" | "custom"
export type Range = { mode: RangeMode; from: string; to: string }
function monthBounds(offset: number) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + offset
  return [isoOf(new Date(y, m, 1)), isoOf(new Date(y, m + 1, 0))]
}
export function inRange(r: Range, d: string) {
  if (r.mode === "all") return true
  if (r.mode === "month" || r.mode === "last") {
    const [a, b] = monthBounds(r.mode === "last" ? -1 : 0)
    return d >= a && d <= b
  }
  if (r.from && d < r.from) return false
  if (r.to && d > r.to) return false
  return true
}
export function rangeLabel(r: Range) {
  const now = new Date()
  if (r.mode === "all") return "All time"
  if (r.mode === "month") return now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
  if (r.mode === "last")
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
  return (r.from ? fmtDate(r.from) : "Start") + " – " + (r.to ? fmtDate(r.to) : "today")
}

/* ---------- invoices ---------- */
export function dueDate(issued: string, terms: Terms) {
  if (terms === "14th") {
    const d = parseISO(issued)
    return isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 14))
  }
  return addDays(issued, Number(terms) || 0)
}
export function termsText(terms: Terms, due: string) {
  if (terms === "14th") return `Payment due no later than the 14th of the following month (${fmtDate(due)}).`
  if (terms === "0") return "Payment due on receipt."
  return `Payment due within ${terms} days (${fmtDate(due)}).`
}
export const TERMS_OPTIONS: [Terms, string][] = [
  ["14th", "By the 14th of the following month"],
  ["0", "On receipt"],
  ["7", "Within 7 days"],
  ["14", "Within 14 days"],
  ["30", "Within 30 days"],
]
export const invStatus = (i: Invoice): Status => (i.status === "paid" ? "paid" : today() > i.due ? "overdue" : "unpaid")
export const overdueList = (d: Data) =>
  d.invoices.filter((i) => invStatus(i) === "overdue").sort((a, b) => a.due.localeCompare(b.due))
/** The date the next follow-up is due for an unpaid invoice, or null when paid. */
export function nextFollowUp(i: Invoice, p: Profile): string | null {
  if (i.status === "paid") return null
  const first = addDays(i.due, Math.max(0, Number(p.followUpDays) || 0) + 1)
  const last = i.reminders[i.reminders.length - 1]
  if (!last) return first
  const again = addDays(isoOf(new Date(last)), Math.max(1, Number(p.followUpRepeat) || 7))
  return again > first ? again : first
}
export const followUpsDue = (d: Data) =>
  d.invoices
    .filter((i) => {
      const n = nextFollowUp(i, d.profile)
      return n !== null && today() >= n
    })
    .sort((a, b) => a.due.localeCompare(b.due))
export const FOLLOW_UP_DAYS: [number, string][] = [[0, "The day after it’s due"], [3, "3 days after it’s due"], [7, "A week after it’s due"], [14, "Two weeks after it’s due"]]
export const FOLLOW_UP_REPEAT: [number, string][] = [[3, "Every 3 days"], [7, "Every week"], [14, "Every two weeks"], [30, "Every month"]]

export function invoiceEmailText(inv: Invoice, p: Profile) {
  const subject = `Invoice ${inv.number} from ${inv.from.trading || inv.from.name} (${money(inv.total)})`
  const lines = [
    `Dear ${inv.to.name || "Sir or Madam"},`,
    "",
    `Please find below invoice ${inv.number} for services in ${inv.period}.`,
    "",
    ...inv.lines.map((l) => `• ${l.name}: ${l.qty} × ${money(l.fee)} = ${money(l.amt)}`),
    "",
    `Total due: ${money(inv.total)}`,
    `Invoice date: ${fmtDate(inv.issued)}`,
    `Due date: ${fmtDate(inv.due)}`,
    "",
  ]
  const pay = inv.pay
  if (pay.sortCode || pay.accountNumber) {
    lines.push("Payment details:")
    if (pay.accountName) lines.push("Account name: " + pay.accountName)
    if (pay.bankName) lines.push("Bank: " + pay.bankName)
    if (pay.sortCode) lines.push("Sort code: " + pay.sortCode)
    if (pay.accountNumber) lines.push("Account number: " + pay.accountNumber)
    lines.push("Reference: " + inv.number, "")
  }
  lines.push(termsText(inv.terms || "14th", inv.due), "", "Kind regards,", inv.from.name || p.fullName)
  if (p.phone) lines.push(p.phone)
  return { subject, body: lines.join("\n") }
}

export const nextNumber = (p: Profile) => `${(p.prefix || "INV").trim()}-${String(p.nextNo || 1).padStart(4, "0")}`

/** Build an invoice from the entries in range that aren't on an invoice yet. */
export function draftInvoice(d: Data, r: Range, fallbackName: string) {
  const pend = d.entries.filter((e) => inRange(r, e.date) && !e.invoiced)
  if (!pend.length) return null
  const svc = (id: string) => d.services.find((s) => s.id === id)
  const groups: Record<string, InvoiceLine> = {}
  for (const e of pend) {
    const name = svc(e.serviceId)?.name ?? "—"
    const fee = Number(e.fee) || 0
    const k = name + "|" + fee
    groups[k] ??= { name, fee, qty: 0, amt: 0 }
    groups[k].qty += Number(e.qty) || 0
    groups[k].amt += entryAmt(e)
  }
  const lines = Object.values(groups).sort((a, b) => b.amt - a.amt)
  const total = lines.reduce((s, l) => s + l.amt, 0)
  const dates = pend.map((e) => e.date).sort()
  const first = dates[0], last = dates[dates.length - 1]
  const p = d.profile
  const issued = today()
  const period =
    r.mode === "month" || r.mode === "last" ? rangeLabel(r) : first === last ? fmtDate(first) : `${fmtDate(first)} – ${fmtDate(last)}`
  const inv: Invoice = {
    id: uid(), number: nextNumber(p), issued, due: dueDate(issued, p.terms), terms: p.terms, period,
    from: { name: p.fullName || fallbackName, trading: p.tradingName, address: p.address, phone: p.phone, email: p.email, gphc: p.gphc },
    to: { name: p.billToName, address: p.billToAddress, email: p.billToEmail },
    pay: { accountName: p.accountName, bankName: p.bankName, sortCode: p.sortCode, accountNumber: p.accountNumber },
    lines, total, entryIds: pend.map((e) => e.id),
    status: "unpaid", paidDate: null, reminders: [], created: new Date().toISOString(),
  }
  return inv
}

export function reminderText(inv: Invoice, p: Profile) {
  const late = daysBetween(inv.due, today())
  const subject = `Payment reminder: invoice ${inv.number} (${money(inv.total)})`
  const lines = [
    `Dear ${inv.to.name || "Sir or Madam"},`,
    "",
    `This is a friendly reminder that invoice ${inv.number} for ${money(inv.total)}, issued on ${fmtDate(inv.issued)} for services in ${inv.period}, was due for payment on ${fmtDate(inv.due)}` +
      (late > 0 ? ` and is now ${plural(late, "day")} overdue.` : "."),
    "",
  ]
  const pay = inv.pay
  if (pay.sortCode || pay.accountNumber) {
    lines.push("Payment can be made to:")
    if (pay.accountName) lines.push("Account name: " + pay.accountName)
    if (pay.bankName) lines.push("Bank: " + pay.bankName)
    if (pay.sortCode) lines.push("Sort code: " + pay.sortCode)
    if (pay.accountNumber) lines.push("Account number: " + pay.accountNumber)
    lines.push("Reference: " + inv.number, "")
  }
  lines.push("If payment has already been made, please ignore this message.", "", "Kind regards,", inv.from.name || p.fullName)
  if (p.phone) lines.push(p.phone)
  return { subject, body: lines.join("\n") }
}

/* ---------- storage layout ---------- */
// Saved as small documents: core settings, one per month of entries, one per invoice.
export type DocMap = Record<string, Record<string, unknown>>
export function buildDocs(d: Data): DocMap {
  const docs: DocMap = { core: { services: d.services, profile: d.profile, meta: d.meta, v: 2 } }
  for (const e of d.entries) {
    const k = "m-" + (/^\d{4}-\d{2}/.test(e.date || "") ? e.date.slice(0, 7) : "other")
    ;((docs[k] ??= { entries: [] }).entries as Entry[]).push(e)
  }
  for (const i of d.invoices) docs["inv-" + i.id] = { invoice: i }
  return JSON.parse(JSON.stringify(docs))
}
export function assembleDocs(docs: DocMap): Data | null {
  const core = docs.core
  if (!core) return null
  const d = { services: core.services, profile: core.profile, meta: core.meta || {}, entries: [] as Entry[], invoices: [] as Invoice[] }
  for (const k of Object.keys(docs).sort()) {
    if (k.startsWith("m-")) d.entries.push(...((docs[k].entries as Entry[]) || []))
    else if (k.startsWith("inv-") && docs[k].invoice) d.invoices.push(docs[k].invoice as Invoice)
  }
  return normalize(d)
}
