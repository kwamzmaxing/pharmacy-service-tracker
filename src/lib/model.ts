// Data model and pure helpers for the service tracker.

export type Unit = "each" | "mile" | "hour"
export type Service = { id: string; name: string; fee: number; unit?: Unit }
/** A pharmacy (or other employer) you invoice. Saved once, reused on every invoice. */
export type Client = {
  id: string
  name: string
  contact: string
  email: string
  phone: string
  address: string
  notes: string
  created: string
}
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
  /** Which pharmacy this work was for. */
  clientId?: string
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
export type InvoiceLine = { name: string; fee: number; qty: number; amt: number; unit?: Unit }
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
  clientId?: string
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
  clients: Client[]
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
  { id: uid(), name: "Hours Worked (£25/hr)", fee: 25, unit: "hour" },
  { id: uid(), name: "Mileage", fee: 0.5, unit: "mile" },
]
export const UNITS: [Unit, string, string][] = [["each", "each", "Quantity"], ["mile", "per mile", "Miles"], ["hour", "per hour", "Hours"]]
export const unitOf = (s?: Pick<Service, "unit" | "name">): Unit => s?.unit || (s && /hour/i.test(s.name) ? "hour" : s && /mile/i.test(s.name) ? "mile" : "each")
/** "12.5 miles", "7.5 hours", "3" */
export function qtyText(qty: number, unit?: Unit) {
  const n = Number(qty) || 0
  const v = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "")
  if (unit === "mile") return `${v} ${n === 1 ? "mile" : "miles"}`
  if (unit === "hour") return `${v} ${n === 1 ? "hour" : "hours"}`
  return v
}
export const feeText = (fee: number, unit?: Unit) => money(fee) + (unit === "mile" ? "/mile" : unit === "hour" ? "/hr" : "")
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
  return { services: STD_SERVICES(), clients: [], entries: [], invoices: [], profile, meta: { ratesV: "d1", mileage: 1, clients: 1 } }
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
  const services: Service[] = Array.isArray(d.services) ? d.services : STD_SERVICES()
  // Mileage became a standard service: add it once to older trackers
  if (!meta.mileage) {
    if (!services.some((s) => /mile/i.test(s.name))) services.push({ id: uid(), name: "Mileage", fee: 0.5, unit: "mile" })
    meta.mileage = 1
  }
  const clients: Client[] = Array.isArray(d.clients) ? d.clients : []
  // Pharmacy profiles replaced the single "Bill to" block: turn it into the first saved pharmacy
  if (!meta.clients) {
    if (!clients.length && profile.billToName) {
      clients.push({ id: uid(), name: profile.billToName, contact: "", email: profile.billToEmail, phone: "", address: profile.billToAddress, notes: "", created: new Date().toISOString() })
    }
    // Earlier invoices: link them to a saved pharmacy with the same name, saving any that aren't there yet
    for (const i of invoices) {
      if (i.clientId || !i.to?.name) continue
      let c = clients.find((x) => x.name.trim().toLowerCase() === i.to.name.trim().toLowerCase())
      if (!c) clients.push((c = { id: uid(), name: i.to.name, contact: "", email: i.to.email || "", phone: "", address: i.to.address || "", notes: "", created: i.created || new Date().toISOString() }))
      i.clientId = c.id
    }
    meta.clients = 1
  }
  return {
    services,
    clients,
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
    ...inv.lines.map((l) => `• ${l.name}: ${qtyText(l.qty, l.unit)} × ${feeText(l.fee, l.unit)} = ${money(l.amt)}`),
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

/** Entries ready to invoice for a pharmacy: in range, not invoiced, logged for it (or for no pharmacy). */
export const pendingFor = (d: Data, r: Range, clientId?: string) =>
  d.entries.filter((e) => inRange(r, e.date) && !e.invoiced && (!clientId || !e.clientId || e.clientId === clientId))

/** Build an invoice from the entries in range that aren't on an invoice yet. */
export function draftInvoice(d: Data, r: Range, fallbackName: string, clientId?: string) {
  const pend = pendingFor(d, r, clientId)
  if (!pend.length) return null
  const svc = (id: string) => d.services.find((s) => s.id === id)
  const groups: Record<string, InvoiceLine> = {}
  for (const e of pend) {
    const s = svc(e.serviceId)
    const name = s?.name ?? "—"
    const fee = Number(e.fee) || 0
    const k = name + "|" + fee
    groups[k] ??= { name, fee, qty: 0, amt: 0, unit: unitOf(s) }
    groups[k].qty += Number(e.qty) || 0
    groups[k].amt += entryAmt(e)
  }
  const lines = Object.values(groups).sort((a, b) => b.amt - a.amt)
  const total = lines.reduce((s, l) => s + l.amt, 0)
  const dates = pend.map((e) => e.date).sort()
  const first = dates[0], last = dates[dates.length - 1]
  const p = d.profile
  const client = clientId ? d.clients.find((c) => c.id === clientId) : undefined
  const issued = today()
  const period =
    r.mode === "month" || r.mode === "last" ? rangeLabel(r) : first === last ? fmtDate(first) : `${fmtDate(first)} – ${fmtDate(last)}`
  const inv: Invoice = {
    id: uid(), number: nextNumber(p), issued, due: dueDate(issued, p.terms), terms: p.terms, period,
    from: { name: p.fullName || fallbackName, trading: p.tradingName, address: p.address, phone: p.phone, email: p.email, gphc: p.gphc },
    to: client ? { name: client.name, address: client.address, email: client.email } : { name: p.billToName, address: p.billToAddress, email: p.billToEmail },
    clientId: client?.id,
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
  const docs: DocMap = { core: { services: d.services, clients: d.clients, profile: d.profile, meta: d.meta, v: 2 } }
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
  const d = { services: core.services, clients: core.clients, profile: core.profile, meta: core.meta || {}, entries: [] as Entry[], invoices: [] as Invoice[] }
  for (const k of Object.keys(docs).sort()) {
    if (k.startsWith("m-")) d.entries.push(...((docs[k].entries as Entry[]) || []))
    else if (k.startsWith("inv-") && docs[k].invoice) d.invoices.push(docs[k].invoice as Invoice)
  }
  return normalize(d)
}

/* ---------- figures for the invoices page ---------- */
const ymOf = (iso: string) => iso.slice(0, 7)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** The UK tax year (6 April – 5 April) containing a date. */
export function taxYear(onDate = today()) {
  const y = Number(onDate.slice(0, 4))
  const start = onDate >= `${y}-04-06` ? y : y - 1
  return { from: `${start}-04-06`, to: `${start + 1}-04-05`, label: `${start}/${String(start + 1).slice(2)}` }
}
export const daysToPay = (i: Invoice) => (i.status === "paid" && i.paidDate ? Math.max(0, daysBetween(i.issued, i.paidDate)) : null)
const avg = (xs: number[]) => (xs.length ? Math.round(sum(xs) / xs.length) : null)

export type MonthPoint = { ym: string; label: string; logged: number; paid: number }
/** The last `n` months: what was logged (earned) and what was paid. */
export function monthly(d: Data, n = 6): MonthPoint[] {
  const now = new Date()
  const out: MonthPoint[] = []
  for (let k = n - 1; k >= 0; k--) {
    const m = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const ym = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
    out.push({
      ym,
      label: m.toLocaleDateString("en-GB", { month: "short" }),
      logged: sum(d.entries.filter((e) => ymOf(e.date) === ym).map(entryAmt)),
      paid: sum(d.invoices.filter((i) => i.status === "paid" && i.paidDate && ymOf(i.paidDate) === ym).map((i) => i.total)),
    })
  }
  return out
}

export type ClientStats = { billed: number; paid: number; owed: number; overdue: number; invoices: number; avgDays: number | null; lastInvoice: string | null; oldestDue: string | null }
export function clientStats(d: Data, clientId: string): ClientStats {
  const invs = d.invoices.filter((i) => i.clientId === clientId)
  const open = invs.filter((i) => i.status !== "paid")
  return {
    billed: sum(invs.map((i) => i.total)),
    paid: sum(invs.filter((i) => i.status === "paid").map((i) => i.total)),
    owed: sum(open.map((i) => i.total)),
    overdue: sum(open.filter((i) => invStatus(i) === "overdue").map((i) => i.total)),
    invoices: invs.length,
    avgDays: avg(invs.map(daysToPay).filter((x): x is number => x !== null)),
    lastInvoice: invs.map((i) => i.issued).sort().pop() ?? null,
    oldestDue: open.map((i) => i.due).sort()[0] ?? null,
  }
}

export type Insight = { tone: "good" | "warn" | "danger" | "info"; text: string; action?: "summary" | "followups" | "clients" }
/** Plain-English observations, most useful first. */
export function insights(d: Data): Insight[] {
  const out: Insight[] = []
  const t = today()
  const months = monthly(d, 2)
  const [prev, cur] = months
  const overdue = d.invoices.filter((i) => invStatus(i) === "overdue")
  if (overdue.length) {
    const oldest = Math.max(...overdue.map((i) => daysBetween(i.due, t)))
    out.push({ tone: "danger", text: `${plural(overdue.length, "invoice")} overdue (${money(sum(overdue.map((i) => i.total)))}), the oldest by ${plural(oldest, "day")}.`, action: "followups" })
  }
  const uninvoiced = sum(d.entries.filter((e) => !e.invoiced && e.date < `${cur.ym}-01`).map(entryAmt))
  if (uninvoiced > 0) out.push({ tone: "warn", text: `${money(uninvoiced)} of work from earlier months hasn’t been invoiced yet.`, action: "summary" })
  if (cur.logged > 0 && prev.logged > 0) {
    const pct = Math.round(((cur.logged - prev.logged) / prev.logged) * 100)
    const dayOfMonth = Number(t.slice(8, 10))
    if (pct >= 0) out.push({ tone: "good", text: `You’ve logged ${money(cur.logged)} so far this month, ${pct}% more than all of last month.` })
    else if (dayOfMonth >= 25) out.push({ tone: "info", text: `${money(cur.logged)} logged this month, ${Math.abs(pct)}% less than last month.` })
    else out.push({ tone: "info", text: `${money(cur.logged)} logged so far this month (last month: ${money(prev.logged)}).` })
  }
  const payers = d.clients
    .map((c) => ({ c, s: clientStats(d, c.id), n: d.invoices.filter((i) => i.clientId === c.id && daysToPay(i) !== null).length }))
    .filter((x) => x.s.avgDays !== null && x.n >= 2)
    .sort((a, b) => (b.s.avgDays ?? 0) - (a.s.avgDays ?? 0))
  if (payers.length >= 2) out.push({ tone: "info", text: `${payers[0].c.name} is your slowest payer, at ${payers[0].s.avgDays} days on average; ${payers[payers.length - 1].c.name} pays fastest (${payers[payers.length - 1].s.avgDays} days).`, action: "clients" })
  else if (payers.length === 1) out.push({ tone: "info", text: `${payers[0].c.name} pays in ${payers[0].s.avgDays} days on average.`, action: "clients" })
  const ty = taxYear(t)
  const mileSvc = new Set(d.services.filter((s) => unitOf(s) === "mile").map((s) => s.id))
  const miles = d.entries.filter((e) => mileSvc.has(e.serviceId) && e.date >= ty.from && e.date <= ty.to)
  if (miles.length) out.push({ tone: "info", text: `${qtyText(sum(miles.map((e) => Number(e.qty) || 0)), "mile")} claimed in the ${ty.label} tax year (${money(sum(miles.map(entryAmt)))}).` })
  const bySvc: Record<string, number> = {}
  for (const e of d.entries.filter((e) => ymOf(e.date) === cur.ym)) bySvc[e.serviceId] = (bySvc[e.serviceId] || 0) + entryAmt(e)
  const top = Object.entries(bySvc).sort((a, b) => b[1] - a[1])[0]
  if (top && cur.logged > 0) {
    const s = d.services.find((x) => x.id === top[0])
    if (s) out.push({ tone: "info", text: `${s.name} is your biggest earner this month: ${money(top[1])}, ${Math.round((top[1] / cur.logged) * 100)}% of the total.` })
  }
  return out.slice(0, 5)
}
