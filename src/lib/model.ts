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
  /** The saved journey this mileage came from. */
  journeyId?: string
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
  /** Small image shown at the top of invoices (data URL). */
  logo?: string
  /** For HMRC mileage rates. */
  vehicle: Vehicle
  /** Postcode the journey calculator starts from. */
  homePostcode?: string
  /** Scottish taxpayer (different income tax bands). */
  scotland?: boolean
  /** Yearly income from employment (PAYE), to place self-employed profit in the right tax bands. */
  otherIncome?: number
  /** Count income when it's paid (cash basis, HMRC's default) or when the work was done. */
  taxBasis?: "cash" | "earned"
}
export type Vehicle = "car" | "motorcycle" | "bicycle"
/** A place used by the journey calculator. */
export type Place = { label: string; query: string; postcode?: string; lat: number; lng: number }
export type Journey = {
  id: string
  from: Place
  to: Place
  /** One way, in miles. */
  miles: number
  minutes?: number
  returnTrip: boolean
  /** Route line for the map: [lat, lng] pairs, simplified. */
  path?: [number, number][]
  approximate?: boolean
  clientId?: string
  created: string
  lastUsed?: string
  uses: number
}
export type ExpenseCategory = "travel" | "accommodation" | "subsistence" | "fees" | "insurance" | "training" | "phone" | "equipment" | "accountancy" | "other"
export type Expense = {
  id: string
  date: string
  category: ExpenseCategory
  amount: number
  desc: string
  clientId?: string
  /** A receipt photo stored separately (users/{uid}/receipts/{id}). */
  receiptId?: string
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
/* ---------- budget (Accounting tab) ---------- */
export type SaverStyle = "heavy" | "balanced" | "light" | "debt"
export type PotKind = "tax" | "business" | "essentials" | "debt" | "emergency" | "savings" | "invest" | "spending" | "custom"
/** One slice of the pie. `color` is a fixed palette slot (0–7) that stays with the pot. */
export type Pot = { id: string; name: string; pct: number; color: number; kind: PotKind; why?: string }
export type IncomeKind = "employment" | "selfemployed" | "rental" | "benefits" | "investment" | "gift" | "other"
/** Money from somewhere other than an invoice. */
export type OtherIncome = { id: string; date: string; amount: number; kind: IncomeKind; desc: string; setAsideTax: boolean }
export type BudgetBasis = "month" | "last" | "avg3" | "own"
export type Budget = {
  /** Which split is in use. */
  active: "suggested" | "custom"
  style: SaverStyle
  /** Monthly figures the suggested split works from. */
  essentials: number
  debt: number
  emergencyDone: boolean
  /** Which income the split is worked out from. */
  basis: BudgetBasis
  ownIncome: number
  custom: Pot[]
  incomes: OtherIncome[]
  /** Pots ticked off as moved, by month (YYYY-MM). */
  moved: Record<string, string[]>
}
export const defaultBudget = (): Budget => ({
  active: "suggested", style: "balanced", essentials: 0, debt: 0, emergencyDone: false,
  basis: "month", ownIncome: 0, custom: [], incomes: [], moved: {},
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normBudget(raw: any): Budget {
  const b: Budget = Object.assign(defaultBudget(), raw && typeof raw === "object" ? raw : {})
  b.custom = Array.isArray(b.custom) ? b.custom.slice(0, 8) : []
  b.incomes = Array.isArray(b.incomes) ? b.incomes : []
  b.moved = b.moved && typeof b.moved === "object" ? b.moved : {}
  return b
}

/* ---------- shifts (booked work, before it's logged) ---------- */
export type Shift = {
  id: string
  date: string // YYYY-MM-DD the shift starts
  start: string // HH:MM
  end: string // HH:MM (earlier than start means it ends the next day)
  /** Unpaid break, in minutes. */
  breakMins: number
  clientId?: string
  /** Where, when it isn't a saved pharmacy. */
  place?: string
  pay: "hourly" | "fixed"
  /** £ per hour, or £ for the whole shift. */
  rate: number
  notes: string
  /** The log entry made from this shift once it was worked. */
  entryId?: string
  /** The matching Google Calendar event, and the shift as it was when last sent there. */
  gcalId?: string
  gcalSent?: string
  created: string
}
export type ShiftCal = {
  /** Put shifts in Google Calendar automatically while connected. */
  sync: boolean
  /** Google events still to delete (their shift was deleted while not connected). */
  deletes: string[]
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normShiftCal(raw: any): ShiftCal {
  const c = raw && typeof raw === "object" ? raw : {}
  return { sync: c.sync !== false, deletes: Array.isArray(c.deletes) ? c.deletes : [] }
}

export type Data = {
  shifts: Shift[]
  shiftCal: ShiftCal
  budget: Budget
  services: Service[]
  clients: Client[]
  journeys: Journey[]
  expenses: Expense[]
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
  vehicle: "car", scotland: false, otherIncome: 0, taxBasis: "cash",
})
export function newData(name = ""): Data {
  const profile = defaultProfile()
  profile.fullName = name
  profile.accountName = name
  return { shifts: [], shiftCal: normShiftCal(null), budget: defaultBudget(), services: STD_SERVICES(), clients: [], journeys: [], expenses: [], entries: [], invoices: [], profile, meta: { ratesV: "d1", mileage: 1, clients: 1 } }
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
    shifts: Array.isArray(d.shifts) ? d.shifts : [],
    shiftCal: normShiftCal(d.shiftCal),
    budget: normBudget(d.budget),
    services,
    clients,
    journeys: Array.isArray(d.journeys) ? d.journeys : [],
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
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
  // Journeys keep a route line each, so they get their own document instead of growing "core"
  if (d.journeys.length) docs.journeys = { journeys: d.journeys }
  // The budget (pots and other income) has its own document too
  docs.budget = { budget: d.budget }
  // Booked shifts too
  docs.shifts = { shifts: d.shifts, cal: d.shiftCal }
  const monthKey = (date: string) => "m-" + (/^\d{4}-\d{2}/.test(date || "") ? date.slice(0, 7) : "other")
  for (const e of d.entries) ((docs[monthKey(e.date)] ??= { entries: [] }).entries as Entry[]).push(e)
  for (const x of d.expenses) {
    const m = (docs[monthKey(x.date)] ??= { entries: [] })
    ;((m.expenses ??= []) as Expense[]).push(x)
  }
  for (const i of d.invoices) docs["inv-" + i.id] = { invoice: i }
  return JSON.parse(JSON.stringify(docs))
}
export function assembleDocs(docs: DocMap): Data | null {
  const core = docs.core
  if (!core) return null
  const d = { services: core.services, clients: core.clients, profile: core.profile, meta: core.meta || {}, journeys: (docs.journeys?.journeys as Journey[]) || [], budget: docs.budget?.budget as Budget | undefined, shifts: (docs.shifts?.shifts as Shift[]) || [], shiftCal: docs.shifts?.cal, entries: [] as Entry[], expenses: [] as Expense[], invoices: [] as Invoice[] }
  for (const k of Object.keys(docs).sort()) {
    if (k.startsWith("m-")) {
      d.entries.push(...((docs[k].entries as Entry[]) || []))
      d.expenses.push(...((docs[k].expenses as Expense[]) || []))
    }
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
/**
 * The last `n` months, by the month the work was done: what was logged (earned),
 * and how much of that work has been paid for so far (whenever the money arrived).
 */
export function monthly(d: Data, n = 6): MonthPoint[] {
  const now = new Date()
  const out: MonthPoint[] = []
  const paidIds = new Set(d.invoices.filter((i) => i.status === "paid").map((i) => i.id))
  // Paid invoices whose entries are no longer in the log (e.g. older data) count in the month they were issued
  const linked = new Set(d.entries.map((e) => e.invoiceId).filter(Boolean))
  const unlinkedPaid = d.invoices.filter((i) => i.status === "paid" && !linked.has(i.id))
  for (let k = n - 1; k >= 0; k--) {
    const m = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const ym = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
    out.push({
      ym,
      label: m.toLocaleDateString("en-GB", { month: "short" }),
      logged: sum(d.entries.filter((e) => ymOf(e.date) === ym).map(entryAmt)),
      paid:
        sum(d.entries.filter((e) => ymOf(e.date) === ym && e.invoiceId && paidIds.has(e.invoiceId)).map(entryAmt)) +
        sum(unlinkedPaid.filter((i) => ymOf(i.issued) === ym).map((i) => i.total)),
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

/* ---------- expenses ---------- */
export const EXPENSE_CATEGORIES: [ExpenseCategory, string, string][] = [
  ["travel", "Travel", "Train, bus, taxi, parking and tolls"],
  ["accommodation", "Accommodation", "Hotels for shifts away from home"],
  ["subsistence", "Food on overnight trips", "Meals while staying away for work"],
  ["fees", "Professional fees", "GPhC, RPS and other memberships"],
  ["insurance", "Indemnity insurance", "Professional indemnity cover"],
  ["training", "Training and CPD", "Courses, exams and books for your role"],
  ["phone", "Phone and internet", "The business share of your bills"],
  ["equipment", "Equipment and stationery", "Tools, uniform, printing and postage"],
  ["accountancy", "Accountancy", "Accountant and software fees"],
  ["other", "Other", "Anything else wholly for work"],
]
export const categoryName = (c: ExpenseCategory) => EXPENSE_CATEGORIES.find((x) => x[0] === c)?.[1] ?? "Other"

/* ---------- mileage (HMRC simplified rates) ---------- */
export const VEHICLES: [Vehicle, string][] = [["car", "Car or van"], ["motorcycle", "Motorcycle"], ["bicycle", "Bicycle"]]
/** HMRC approved mileage rates for a tax year (first 10,000 business miles, then the rest). */
export function mileageRates(vehicle: Vehicle, taxYearStart: number) {
  if (vehicle === "motorcycle") return { first: 0.24, after: 0.24 }
  if (vehicle === "bicycle") return { first: 0.2, after: 0.2 }
  return { first: taxYearStart >= 2026 ? 0.55 : 0.45, after: 0.25 }
}
export function mileageAllowance(miles: number, vehicle: Vehicle, taxYearStart: number) {
  const r = mileageRates(vehicle, taxYearStart)
  const first = Math.min(miles, 10000)
  const after = Math.max(0, miles - 10000)
  return { first, after, rates: r, amount: first * r.first + after * r.after }
}
/** "LS1 4AP" style postcode inside any text (for pharmacy addresses). */
export const postcodeIn = (t: string) => (t.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/) || []).slice(1).join(" ") || ""

/* ---------- UK tax estimate (2026/27 rates) ---------- */
// Sources: House of Commons Library "Direct taxes: rates and allowances 2026/27"; mygov.scot current rates.
const PA = 12570
const RUK_BANDS: [number, number, string][] = [[37700, 0.2, "Basic rate 20%"], [125140, 0.4, "Higher rate 40%"], [Infinity, 0.45, "Additional rate 45%"]]
// Scottish bands as widths of taxable income above the personal allowance
const SCOT_BANDS: [number, number, string][] = [
  [16537 - PA, 0.19, "Starter rate 19%"], [29526 - PA, 0.2, "Basic rate 20%"], [43662 - PA, 0.21, "Intermediate rate 21%"],
  [75000 - PA, 0.42, "Higher rate 42%"], [125140, 0.45, "Advanced rate 45%"], [Infinity, 0.48, "Top rate 48%"],
]
export type TaxLine = { label: string; amount: number; tax: number }
export function incomeTax(totalIncome: number, scotland = false) {
  const allowance = Math.max(0, PA - Math.max(0, totalIncome - 100000) / 2)
  let taxable = Math.max(0, totalIncome - allowance)
  const lines: TaxLine[] = []
  let floor = 0
  for (const [top, rate, label] of scotland ? SCOT_BANDS : RUK_BANDS) {
    const amt = Math.max(0, Math.min(taxable, top - floor))
    if (amt > 0) lines.push({ label, amount: amt, tax: amt * rate })
    taxable -= amt
    floor = top
    if (taxable <= 0) break
  }
  return { allowance, lines, tax: lines.reduce((a, l) => a + l.tax, 0) }
}
export function class4(profit: number) {
  const main = Math.max(0, Math.min(profit, 50270) - 12570)
  const upper = Math.max(0, profit - 50270)
  const lines: TaxLine[] = []
  if (main) lines.push({ label: "Class 4 NI 6%", amount: main, tax: main * 0.06 })
  if (upper) lines.push({ label: "Class 4 NI 2%", amount: upper, tax: upper * 0.02 })
  return { lines, tax: lines.reduce((a, l) => a + l.tax, 0) }
}

/** Tax-free allowance on gross rental income (used instead of rental expenses, which aren't recorded). */
export const PROPERTY_ALLOWANCE = 1000
/**
 * A year's income tax and Class 4 NI caused by self-employment and rent, on top of any salary.
 * Rent is income tax only (no National Insurance); `extra` is other taxable income, also income tax only.
 */
export function yearTax(o: { trading: number; property: number; extra?: number; salary: number; scotland: boolean }) {
  const trading = Math.max(0, o.trading), salary = Math.max(0, o.salary)
  const propertyAllowance = Math.min(Math.max(0, o.property), PROPERTY_ALLOWANCE)
  const propertyTaxable = Math.max(0, o.property - PROPERTY_ALLOWANCE)
  const tax = incomeTax(salary + trading + propertyTaxable + Math.max(0, o.extra || 0), o.scotland)
  const incomeTaxDue = Math.max(0, tax.tax - incomeTax(salary, o.scotland).tax)
  const ni = class4(trading)
  return { tax, incomeTaxDue, ni, propertyAllowance, propertyTaxable, total: incomeTaxDue + ni.tax }
}

export type TaxSummary = {
  year: ReturnType<typeof taxYear>
  income: number
  incomeLines: { label: string; amount: number }[]
  expenses: number
  byCategory: { category: ExpenseCategory; amount: number }[]
  miles: number
  mileage: ReturnType<typeof mileageAllowance>
  /** Self-employment (trading) profit. */
  profit: number
  /** Rental income received in the tax year (from the Accounting tab). */
  property: { income: number; allowance: number; taxable: number; count: number }
  tax: ReturnType<typeof incomeTax>
  /** Income tax caused by self-employment and rent (on top of tax on a salary). */
  incomeTaxDue: number
  ni: ReturnType<typeof class4>
  total: number
  /** Share of the tax year that has passed (0–1). */
  elapsed: number
}
export function taxSummary(d: Data, yearOf = today()): TaxSummary {
  const ty = taxYear(yearOf)
  const inYear = (date?: string | null) => !!date && date >= ty.from && date <= ty.to
  const p = d.profile
  const basis = p.taxBasis || "cash"
  const incomeLines: { label: string; amount: number }[] = []
  if (basis === "cash") {
    const paid = d.invoices.filter((i) => i.status === "paid" && inYear(i.paidDate))
    incomeLines.push({ label: `Invoices paid (${paid.length})`, amount: sum(paid.map((i) => i.total)) })
  } else {
    incomeLines.push({ label: "Work logged", amount: sum(d.entries.filter((e) => inYear(e.date)).map(entryAmt)) })
  }
  // Other self-employed work and rent, added on the Accounting tab (counted when received)
  const otherSE = d.budget.incomes.filter((x) => x.kind === "selfemployed" && inYear(x.date))
  if (otherSE.length) incomeLines.push({ label: `Other self-employed work (${otherSE.length})`, amount: sum(otherSE.map((x) => Number(x.amount) || 0)) })
  const rent = d.budget.incomes.filter((x) => x.kind === "rental" && inYear(x.date))
  const rentIncome = sum(rent.map((x) => Number(x.amount) || 0))
  const income = sum(incomeLines.map((l) => l.amount))
  const ex = d.expenses.filter((x) => inYear(x.date))
  const cats: Record<string, number> = {}
  for (const x of ex) cats[x.category] = (cats[x.category] || 0) + (Number(x.amount) || 0)
  const byCategory = Object.entries(cats).map(([category, amount]) => ({ category: category as ExpenseCategory, amount })).sort((a, b) => b.amount - a.amount)
  const expenses = sum(byCategory.map((c) => c.amount))
  const mileSvc = new Set(d.services.filter((s) => unitOf(s) === "mile").map((s) => s.id))
  const miles = sum(d.entries.filter((e) => mileSvc.has(e.serviceId) && inYear(e.date)).map((e) => Number(e.qty) || 0))
  const startYear = Number(ty.from.slice(0, 4))
  const mileage = mileageAllowance(miles, p.vehicle || "car", startYear)
  const profit = Math.max(0, income - expenses - mileage.amount)
  const y = yearTax({ trading: profit, property: rentIncome, salary: Number(p.otherIncome) || 0, scotland: !!p.scotland })
  const { tax, incomeTaxDue, ni } = y
  const property = { income: rentIncome, allowance: y.propertyAllowance, taxable: y.propertyTaxable, count: rent.length }
  const t = today()
  const elapsed = t < ty.from ? 0 : t > ty.to ? 1 : Math.min(1, (daysBetween(ty.from, t) + 1) / 365)
  return { year: ty, income, incomeLines, expenses, byCategory, miles, mileage, profit, property, tax, incomeTaxDue, ni, total: y.total, elapsed }
}
/** Tax years that have any activity, newest first (always includes the current one). */
export function taxYearsWithData(d: Data) {
  const dates = [...d.entries.map((e) => e.date), ...d.expenses.map((x) => x.date), ...d.invoices.map((i) => i.paidDate || i.issued), ...d.budget.incomes.map((x) => x.date), today()]
  const ys = new Map<string, ReturnType<typeof taxYear>>()
  for (const x of dates) if (x) { const y = taxYear(x); ys.set(y.from, y) }
  return [...ys.values()].sort((a, b) => b.from.localeCompare(a.from))
}
