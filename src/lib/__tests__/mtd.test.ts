// Making Tax Digital: update periods and deadlines (gov.uk/guidance/use-making-tax-digital-for-income-tax/
// send-quarterly-updates) and HMRC categories (quarterly update direction; SA103F notes).
import { describe, expect, it } from "vitest"
import { newData } from "../model"
import { digitalRecords, HMRC_FOR, updatePeriods, updateTotals } from "../mtd"

describe("Update periods", () => {
  it("standard periods run from 6 April with HMRC's deadlines", () => {
    expect(updatePeriods(2026, "standard").map((p) => [p.from, p.to, p.deadline])).toEqual([
      ["2026-04-06", "2026-07-05", "2026-08-07"],
      ["2026-04-06", "2026-10-05", "2026-11-07"],
      ["2026-04-06", "2027-01-05", "2027-02-07"],
      ["2026-04-06", "2027-04-05", "2027-05-07"],
    ])
  })
  it("calendar periods run from 1 April, same deadlines", () => {
    expect(updatePeriods(2026, "calendar").map((p) => [p.from, p.to, p.deadline])).toEqual([
      ["2026-04-01", "2026-06-30", "2026-08-07"],
      ["2026-04-01", "2026-09-30", "2026-11-07"],
      ["2026-04-01", "2026-12-31", "2027-02-07"],
      ["2026-04-01", "2027-03-31", "2027-05-07"],
    ])
  })
})

describe("Categories (SA103F notes)", () => {
  it("indemnity insurance → box 28, travel and hotels → box 20, phone → box 23, journals → box 30", () => {
    expect(HMRC_FOR.insurance).toBe("Accountancy, legal and other professional fees")
    expect(HMRC_FOR.travel).toBe("Car, van, and travel expenses")
    expect(HMRC_FOR.accommodation).toBe("Car, van, and travel expenses")
    expect(HMRC_FOR.phone).toBe("Phone, fax, stationery, and other office costs")
    expect(HMRC_FOR.fees).toBe("Other business expenses")
  })
})

describe("Digital records", () => {
  const d = newData("T")
  const mile = d.services.find((s) => s.unit === "mile")!
  const inv = (id: string, issued: string, paid: string | null, total: number) => ({
    id, number: id, issued, due: issued, terms: "14th" as const, period: "", status: (paid ? "paid" : "unpaid") as "paid" | "unpaid", paidDate: paid, total,
    from: { name: "", trading: "", address: "", phone: "", email: "", gphc: "" }, to: { name: "P", address: "", email: "" },
    pay: { accountName: "", bankName: "", sortCode: "", accountNumber: "" }, lines: [], entryIds: [], reminders: [], created: "",
  })
  d.invoices.push(inv("A", "2026-04-01", "2026-04-20", 1000), inv("B", "2026-06-30", "2026-07-10", 2000), inv("C", "2026-09-01", null, 500))
  d.expenses.push({ id: "x", date: "2026-05-01", category: "insurance", amount: 300, desc: "Indemnity" })
  d.entries.push({ id: "m1", serviceId: mile.id, date: "2026-05-02", qty: 9990, fee: 0.5, desc: "", invoiced: false })
  d.entries.push({ id: "m2", serviceId: mile.id, date: "2026-06-02", qty: 20, fee: 0.5, desc: "", invoiced: false })

  it("cash basis: invoices count on the date paid; unpaid ones don't", () => {
    const income = digitalRecords(d, 2026, "standard").filter((r) => r.type === "Income")
    expect(income.map((r) => [r.date, r.amount])).toEqual([["2026-04-20", 1000], ["2026-07-10", 2000]])
  })
  it("mileage drops from 55p to 25p at exactly 10,000 miles", () => {
    const miles = digitalRecords(d, 2026, "standard").filter((r) => r.source.startsWith("Mileage"))
    expect(miles.map((r) => r.amount)).toEqual([5494.5, 8]) // 9,990 × 55p; then 10 × 55p + 10 × 25p
  })
  it("each update covers the year so far", () => {
    const u = updateTotals(digitalRecords(d, 2026, "standard"), updatePeriods(2026, "standard"))
    expect(u.map((x) => x.income)).toEqual([1000, 3000, 3000, 3000])
    expect(u[0].totals["Accountancy, legal and other professional fees"]).toBe(300)
  })
})
