// Insights figures: counts, revenue, payment speed and ageing all come straight from entries and invoices.
import { describe, expect, it } from "vitest"
import { finance, periodOf, previousOf } from "../finance"
import { newData, type Invoice } from "../model"

function sample() {
  const d = newData("T")
  d.services = [
    { id: "pf", name: "Pharmacy First", fee: 15 },
    { id: "nms", name: "NMS", fee: 28 },
    { id: "hr", name: "Hours Worked", fee: 25, unit: "hour" },
    { id: "mi", name: "Mileage", fee: 0.45, unit: "mile" },
  ]
  d.clients = [{ id: "c1", name: "Riverside", contact: "", email: "", phone: "", address: "", notes: "", created: "" }]
  const e = (id: string, serviceId: string, date: string, qty: number, fee: number, invoiceId?: string) =>
    d.entries.push({ id, serviceId, date, qty, fee, desc: "", invoiced: !!invoiceId, invoiceId })
  e("a", "pf", "2026-05-03", 4, 15, "i1") // £60
  e("b", "nms", "2026-05-10", 2, 28, "i1") // £56
  e("c", "hr", "2026-06-01", 8, 25, "i2") // £200
  e("d", "mi", "2026-06-01", 20, 0.45) // £9
  e("old", "pf", "2025-12-01", 1, 15) // before the tax year
  const inv = (id: string, issued: string, due: string, total: number, paidDate: string | null): Invoice => ({
    id, number: id, issued, due, terms: "14", period: "", clientId: "c1",
    from: { name: "", trading: "", address: "", phone: "", email: "", gphc: "" }, to: { name: "Riverside", address: "", email: "" },
    pay: { accountName: "", bankName: "", sortCode: "", accountNumber: "" }, lines: [], total, entryIds: [],
    status: paidDate ? "paid" : "unpaid", paidDate, reminders: [], created: issued,
  })
  d.invoices = [
    inv("i1", "2026-06-01", "2026-06-15", 116, "2026-06-11"), // 10 days, on time
    inv("i2", "2026-07-01", "2026-07-15", 200, "2026-07-21"), // 20 days, late
    inv("i3", "2026-09-01", "2026-09-15", 300, null), // 70 days overdue on 24 Nov
    inv("i4", "2026-11-20", "2026-12-04", 50, null), // not due yet
  ]
  return d
}

describe("Insights", () => {
  const t = "2026-11-24"
  it("counts services separately from hours and miles, and adds up revenue", () => {
    const d = sample()
    const p = periodOf("ty", d, t)
    expect(p.from).toBe("2026-04-06")
    const f = finance(d, p.from, p.to, t)
    expect(f.services).toBe(6)
    expect(f.hours).toBe(8)
    expect(f.miles).toBe(20)
    expect(f.revenue).toBeCloseTo(325)
    expect(f.paidFor).toBeCloseTo(316)
    expect(f.byService.map((r) => r.name)).toEqual(["Hours Worked", "Pharmacy First", "NMS", "Mileage"])
  })
  it("averages days to payment and counts on-time payments", () => {
    const d = sample()
    const f = finance(d, "2026-04-06", t, t)
    expect(f.pay).toEqual({ count: 2, avgDays: 15, fastest: 10, slowest: 20, onTime: 1 })
    expect(f.payByPharmacy).toEqual([{ name: "Riverside", avgDays: 15, count: 2 }])
  })
  it("ages outstanding invoices as of today", () => {
    const f = finance(sample(), "2026-04-06", t, t)
    expect(f.outstanding.total).toBe(350)
    expect(f.outstanding.overdueCount).toBe(1)
    expect(f.outstanding.ageing.map((b) => b.total)).toEqual([50, 0, 0, 300])
  })
  it("lists every month of the period and compares with a year earlier", () => {
    const d = sample()
    const p = periodOf("12m", d, t)
    const f = finance(d, p.from, p.to, t)
    expect(f.byMonth).toHaveLength(12)
    expect(f.byMonth[0].ym).toBe("2025-12")
    expect(f.byMonth.find((m) => m.ym === "2026-06")!.revenue).toBeCloseTo(209)
    expect(previousOf(p)).toEqual({ from: "2024-12-01", to: "2025-11-24" })
    expect(previousOf(periodOf("all", d, t))).toBeNull()
    expect(periodOf("lastTy", d, t)).toMatchObject({ from: "2025-04-06", to: "2026-04-05" })
  })
})

import { dueSoon, expectedPayment, expectedThisMonth, readyToInvoice, repeatLatePayers } from "../finance"
import { draftInvoice, reminderStage, reminderText } from "../model"
describe("What to do next", () => {
  const t = "2026-11-24"
  it("groups uninvoiced work by pharmacy and month, oldest first, ignoring future dates", () => {
    const d = sample()
    d.entries.push({ id: "f", serviceId: "pf", date: "2026-11-30", qty: 1, fee: 15, desc: "", invoiced: false, clientId: "c1" })
    d.entries.push({ id: "g", serviceId: "pf", date: "2026-11-02", qty: 2, fee: 15, desc: "", invoiced: false, clientId: "c1" })
    const g = readyToInvoice(d, t)
    expect(g.map((x) => [x.name, x.ym, x.total])).toEqual([
      ["Not linked to a pharmacy", "2025-12", 15],
      ["Not linked to a pharmacy", "2026-06", 9],
      ["Riverside", "2026-11", 30],
    ])
  })
  it("drafts a strict invoice for one group with only that pharmacy's work", () => {
    const d = sample()
    d.entries.push({ id: "g", serviceId: "pf", date: "2026-11-02", qty: 2, fee: 15, desc: "", invoiced: false, clientId: "c1" })
    d.entries.push({ id: "u", serviceId: "pf", date: "2026-11-03", qty: 5, fee: 15, desc: "", invoiced: false })
    const inv = draftInvoice(d, { mode: "custom", from: "2026-11-01", to: "2026-11-30" }, "T", "c1", { strict: true, period: "November 2026" })!
    expect(inv.total).toBe(30)
    expect(inv.entryIds).toEqual(["g"])
    expect(inv.period).toBe("November 2026")
  })
  it("expects payment from the pharmacy's record, and flags repeat late payers", () => {
    const d = sample()
    expect(expectedPayment(d, d.invoices[3])).toEqual({ date: "2026-12-05", basis: "history", days: 15 })
    expect(repeatLatePayers(d, t).map((r) => r.name)).toEqual(["Riverside"]) // 1 paid late + 1 overdue now, of 3
    expect(dueSoon(d, t).map((i) => i.id)).toEqual([])
    expect(dueSoon(d, t, 14).map((i) => i.id)).toEqual(["i4"])
    expect(expectedThisMonth(d, t)).toMatchObject({ received: 0, expected: 0, overdue: 300, overdueCount: 1 })
  })
  it("reminders get firmer the later the payment", () => {
    const d = sample()
    const inv = { ...d.invoices[2], reminders: [] as string[] }
    expect(reminderStage({ ...inv, due: "2026-11-20" }, t)).toBe(1)
    expect(reminderStage({ ...inv, due: "2026-11-20", reminders: ["x"] }, t)).toBe(2)
    expect(reminderStage(inv, t)).toBe(3) // 70 days late
    expect(reminderText(inv, d.profile).body).toContain("within 7 days")
  })
})
