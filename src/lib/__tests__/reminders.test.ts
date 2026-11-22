import { describe, expect, it } from "vitest"
import { newData } from "../model"
import { buildReminders } from "../reminders"

const on = { on: true, invoices: true, shifts: true }
const blankInv = (id: string, due: string, status: "paid" | "unpaid" = "unpaid") => ({
  id, number: id, issued: due, due, terms: "14th" as const, period: "", status, paidDate: null, total: 100,
  from: { name: "", trading: "", address: "", phone: "", email: "", gphc: "" }, to: { name: "Riverside", address: "", email: "" },
  pay: { accountName: "", bankName: "", sortCode: "", accountNumber: "" }, lines: [], entryIds: [], reminders: [], created: "",
})
const shift = (id: string, date: string, start: string) => ({ id, date, start, end: "17:00", breakMins: 0, place: "Riverside", pay: "hourly" as const, rate: 25, notes: "", created: "" })

describe("Reminders", () => {
  const now = new Date("2026-11-22T12:00:00")
  it("overdue invoice: due now; paid invoices never", () => {
    const d = newData("T"); d.profile.followUpDays = 0
    d.invoices.push(blankInv("A", "2026-11-10"), blankInv("B", "2026-11-10", "paid"))
    const r = buildReminders(d, on, now)
    expect(r.map((x) => x.id)).toEqual(["inv-A-2026-11-11"])
    expect(r[0].at).toBe(now.getTime()) // long overdue: remind now, not on the old date

  })
  it("shift: the evening before at 7pm, or 2 hours before if booked late", () => {
    const d = newData("T")
    d.shifts.push(shift("s1", "2026-11-25", "09:00"), shift("s2", "2026-11-22", "18:00"))
    const r = buildReminders(d, on, now)
    const s1 = r.find((x) => x.id.startsWith("shift-s1"))!, s2 = r.find((x) => x.id.startsWith("shift-s2"))!
    expect(new Date(s1.at).toString()).toBe(new Date("2026-11-24T19:00:00").toString())
    expect(s1.title).toMatch(/^Tomorrow/)
    expect(new Date(s2.at).toString()).toBe(new Date("2026-11-22T16:00:00").toString())
  })
  it("respects the on/off choices", () => {
    const d = newData("T"); d.invoices.push(blankInv("A", "2026-11-10")); d.shifts.push(shift("s1", "2026-11-25", "09:00"))
    expect(buildReminders(d, { on: true, invoices: false, shifts: true }, now).every((x) => x.tab === "shifts")).toBe(true)
    expect(buildReminders(d, { on: true, invoices: true, shifts: false }, now).every((x) => x.tab === "invoices")).toBe(true)
  })
})
