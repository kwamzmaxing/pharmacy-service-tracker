// Invoice sums: lines add up to the total to the penny, and due dates follow the payment terms.
import { describe, expect, it } from "vitest"
import { draftInvoice, dueDate, newData, pence } from "../model"

describe("Invoices", () => {
  it("totals are exact to the penny", () => {
    const d = newData("T")
    const s = d.services[0]
    for (let i = 0; i < 3; i++) d.entries.push({ id: "e" + i, serviceId: s.id, date: "2026-06-0" + (i + 1), qty: 1, fee: 0.1, desc: "", invoiced: false })
    const mile = d.services.find((x) => x.unit === "mile")!
    d.entries.push({ id: "m", serviceId: mile.id, date: "2026-06-05", qty: 49.8, fee: 0.5, desc: "", invoiced: false })
    const inv = draftInvoice(d, { mode: "all", from: "", to: "" }, "T")!
    expect(inv.total).toBe(25.2) // 3 × £0.10 + 49.8 miles × 50p
    expect(pence(inv.lines.reduce((a, l) => a + l.amt, 0))).toBe(inv.total)
    expect(inv.entryIds).toHaveLength(4)
  })
  it("'14th of the following month' and day-based terms", () => {
    expect(dueDate("2026-01-31", "14th")).toBe("2026-02-14")
    expect(dueDate("2026-12-01", "14th")).toBe("2027-01-14")
    expect(dueDate("2026-06-01", "30")).toBe("2026-07-01")
  })
})

import { tidyAccountNumber, tidySortCode } from "../model"
describe("Bank details", () => {
  it("sort codes: 6 digits, tidied to 12-34-56", () => {
    expect(tidySortCode("123456")).toBe("12-34-56")
    expect(tidySortCode("12 34 56")).toBe("12-34-56")
    expect(tidySortCode("12-34-5")).toBeNull()
  })
  it("account numbers: 6 to 8 digits, matching the message shown", () => {
    expect(tidyAccountNumber("1234 5678")).toBe("12345678")
    expect(tidyAccountNumber("123456")).toBe("123456")
    expect(tidyAccountNumber("12345")).toBeNull()
    expect(tidyAccountNumber("123456789")).toBeNull()
  })
})
