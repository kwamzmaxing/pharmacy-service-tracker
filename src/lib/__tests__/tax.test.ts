// Tax, National Insurance, mileage and allowance figures, checked against HMRC's own worked examples
// and rates on GOV.UK (2026 to 2027 tax year). If a rate changes, update the code AND these tests.
import { describe, expect, it } from "vitest"
import { class4, incomeTax, mileageAllowance, mileageRates, newData, taxSummary, tradingAllowance } from "../model"

const p2 = (n: number) => Math.round(n * 100) / 100

describe("Income tax (gov.uk/income-tax-rates)", () => {
  it("HMRC example: £35,000 taxable income, standard allowance → 20% of £22,430", () => {
    expect(p2(incomeTax(35000).tax)).toBe(4486)
  })
  it("bands: basic to £50,270, higher to £125,140, additional above", () => {
    expect(p2(incomeTax(50270).tax)).toBe(7540) // 37,700 × 20%
    expect(p2(incomeTax(60000).tax)).toBe(p2(7540 + (60000 - 50270) * 0.4))
  })
  it("Personal Allowance tapers £1 for every £2 over £100,000, gone at £125,140", () => {
    expect(incomeTax(100000).allowance).toBe(12570)
    expect(incomeTax(110000).allowance).toBe(7570)
    expect(incomeTax(125140).allowance).toBe(0)
  })
  it("Scottish bands (gov.uk/scottish-income-tax): £30,000", () => {
    // 19% on 12,571–16,537, 20% on 16,538–29,526, 21% on 29,527–30,000
    expect(p2(incomeTax(30000, true).tax)).toBe(p2((16537 - 12570) * 0.19 + (29526 - 16537) * 0.2 + (30000 - 29526) * 0.21))
  })
})

describe("Class 4 National Insurance (gov.uk/self-employed-national-insurance-rates)", () => {
  it("nothing at or below £12,570", () => expect(class4(12570).tax).toBe(0))
  it("6% from £12,570 to £50,270, 2% above", () => {
    expect(p2(class4(15000).tax)).toBe(145.8)
    expect(p2(class4(60000).tax)).toBe(p2((50270 - 12570) * 0.06 + (60000 - 50270) * 0.02))
  })
})

describe("PAYE job plus locum work (worked example in the tax tips)", () => {
  it("£30,000 salary + £15,000 locum profit → £3,000 income tax and £145.80 Class 4 on the locum part", () => {
    expect(p2(incomeTax(45000).tax - incomeTax(30000).tax)).toBe(3000)
    expect(p2(class4(15000).tax)).toBe(145.8)
  })
})

describe("Mileage, simplified expenses (gov.uk/simpler-income-tax-simplified-expenses/vehicles)", () => {
  it("HMRC example: 11,000 business miles in 2026/27 → £5,750", () => {
    expect(p2(mileageAllowance(11000, "car", 2026).amount)).toBe(5750)
  })
  it("45p before 6 April 2026, 55p from then; 25p after 10,000 miles", () => {
    expect(mileageRates("car", 2025)).toEqual({ first: 0.45, after: 0.25 })
    expect(mileageRates("car", 2026)).toEqual({ first: 0.55, after: 0.25 })
  })
  it("motorcycles 24p; no flat rate for bicycles", () => {
    expect(p2(mileageAllowance(1000, "motorcycle", 2026).amount)).toBe(240)
    expect(mileageAllowance(500, "bicycle", 2026).amount).toBe(0)
  })
})

describe("Trading allowance", () => {
  it("£1,000 until 5 April 2027, £3,000 from 2027/28 (gov.uk policy paper)", () => {
    expect(tradingAllowance(2026)).toBe(1000)
    expect(tradingAllowance(2027)).toBe(3000)
  })
  it("the estimate picks whichever means less tax", () => {
    const d = newData("T")
    d.profile.taxBasis = "earned"
    const hours = d.services.find((s) => s.unit === "hour")!
    d.entries.push({ id: "w", serviceId: hours.id, date: "2026-06-01", qty: 800, fee: 25, desc: "", invoiced: false })
    d.expenses.push({ id: "x", date: "2026-06-03", category: "fees", amount: 400, desc: "" })
    const small = taxSummary(d, "2026-07-01")
    expect(small.method).toBe("allowance") // £400 of costs < £1,000 allowance
    expect(small.compare.allowance.total).toBeLessThan(small.compare.expenses.total)
    d.expenses[0].amount = 2500
    const big = taxSummary(d, "2026-07-01")
    expect(big.method).toBe("expenses")
  })
})
