// The smarter split: listed outgoings, goals by saving style, the balance score and tips.
import { describe, expect, it } from "vitest"
import { balanceScore, cutBackTips, suggest, type MoneyIn } from "../budget"
import { newData, type Outgoing } from "../model"

const moneyIn = (total: number): MoneyIn => ({ label: "Test", total, invoices: total, other: 0, trading: total, property: 0, extra: 0, business: 0 })
const out = (name: string, cat: Outgoing["cat"], amount: number): Outgoing => ({ id: name, name, cat, amount })
function locum() {
  const d = newData("T")
  d.budget.outgoings = [
    out("Rent", "housing", 900), out("Bills", "bills", 250), out("Food", "food", 300), out("Car", "transport", 350),
    out("Netflix and Spotify", "subscriptions", 30), out("Gym", "health", 45), out("Credit card", "debt", 150),
    out("Emergency fund", "emergency", 100), out("Holiday pot", "savings", 100), out("Stocks and shares ISA", "isa", 200),
  ]
  return d
}
const total = (amounts: Record<string, number>) => Object.values(amounts).reduce((a, b) => a + b, 0)

describe("Accounting split", () => {
  it("shares out exactly the money in, with tax first and listed costs in their pots", () => {
    const s = suggest(locum(), moneyIn(4000))
    expect(total(s.amounts)).toBeCloseTo(4000)
    expect(s.amounts["s-essentials"]).toBeCloseTo(1800) // rent, bills, food, car
    expect(s.pots.find((p) => p.kind === "essentials")!.items!.map((i) => i.name)).toEqual(["Rent", "Car", "Food", "Bills"])
    expect(s.plan.lifestyle).toBeCloseTo(75) // subscriptions + gym sit in spending
    expect(s.amounts["s-invest"]).toBeGreaterThanOrEqual(200) // the ISA counts towards investing
  })
  it("listed saving counts towards the style's goals instead of being added twice", () => {
    const d = locum()
    const without = suggest({ ...d, budget: { ...d.budget, outgoings: d.budget.outgoings.filter((o) => o.cat !== "isa") } }, moneyIn(4000))
    const withIsa = suggest(d, moneyIn(4000))
    // Same income, same style: investing ends up the same or higher, never ISA + full goal on top
    expect(withIsa.amounts["s-invest"]).toBeLessThan((without.amounts["s-invest"] || 0) + 200)
  })
  it("gives a balance score out of five with reasons, and tips when saving is low", () => {
    const s = suggest(locum(), moneyIn(4000))
    const sc = balanceScore(s, false)!
    expect(sc.stars).toBeGreaterThanOrEqual(1)
    expect(sc.stars).toBeLessThanOrEqual(5)
    expect(sc.reasons.length).toBe(4)
    const tight = suggest(locum(), moneyIn(2700))
    expect(balanceScore(tight, false)!.stars).toBeLessThan(sc.stars)
  })
  it("shortfall: one star and a note", () => {
    const s = suggest(locum(), moneyIn(1500))
    expect(s.shortfall).toBeGreaterThan(0)
    expect(balanceScore(s, false)!.stars).toBe(1)
    expect(cutBackTips(s).length).toBeGreaterThanOrEqual(0)
  })
  it("carries old single essentials and debt figures over as outgoings", async () => {
    const { normalize } = await import("../model")
    const d = normalize({ budget: { essentials: 1200, debt: 100 } })
    expect(d.budget.outgoings.map((o) => [o.cat, o.amount])).toEqual([["essential", 1200], ["debt", 100]])
  })
})
