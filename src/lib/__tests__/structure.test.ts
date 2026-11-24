// Sole trader vs limited company: each piece checked against GOV.UK's rules and worked examples.
import { describe, expect, it } from "vitest"
import { compareStructures, corporationTax, incomeTaxWithDividends } from "../structure"

describe("Sole trader or limited company", () => {
  it("dividend tax matches GOV.UK's example (£29,570 wages, £3,000 dividends)", () => {
    // 20% on £17,000 of wages, nothing on £500 of dividends, 10.75% on £2,500
    expect(incomeTaxWithDividends(29570, 3000)).toBeCloseTo(3400 + 268.75)
  })
  it("Corporation Tax: 19% to £50,000, 25% from £250,000, Marginal Relief between", () => {
    expect(corporationTax(40000)).toBeCloseTo(7600)
    expect(corporationTax(300000)).toBeCloseTo(75000)
    expect(corporationTax(100000)).toBeCloseTo(25000 - 150000 * 0.015) // £22,750
  })
  it("compares the same profit both ways and picks the cheaper director salary", () => {
    const c = compareStructures({ profit: 60000 })
    expect(c.soleTrader.total).toBeCloseTo(11432 + 2262 + 194.6) // income tax + Class 4: 6% of £37,700 and 2% of £9,730
    expect([0, 5000, 6708, 12570]).toContain(Math.round(c.company.salary))
    expect(c.company.takeHome + c.company.total + c.company.costs).toBeCloseTo(60000)
    expect(c.difference).toBeCloseTo(c.company.takeHome - c.soleTrader.takeHome)
  })
  it("running costs you enter come off the company side", () => {
    const a = compareStructures({ profit: 60000 }), b = compareStructures({ profit: 60000, companyCosts: 2000 })
    expect(b.company.takeHome).toBeLessThan(a.company.takeHome)
  })
})
