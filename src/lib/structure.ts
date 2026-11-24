// Sole trader or limited company: a like-for-like estimate of the yearly tax on the same locum profit.
// Every rate here was checked on GOV.UK on 24 November 2026 for the 2026 to 2027 tax year:
// Corporation Tax 19% up to £50,000, 25% over £250,000, Marginal Relief between (standard fraction 3/200);
// dividend allowance £500, then 10.75% / 35.75% / 39.35%; employer NI 15% above £5,000 (no Employment
// Allowance when a sole director is the only employee); employee NI 8% above £12,570.
// A guide, not financial advice: it leaves out pensions, student loans, IR35 and the cost of running a company
// beyond what the person enters.
import { incomeTax, yearTax } from "./model"

const PA = 12570, BASIC = 37700, HIGHER_TOP = 125140
export const DIVIDEND_ALLOWANCE = 500
export const DIVIDEND_RATES = { basic: 0.1075, higher: 0.3575, additional: 0.3935 }
export const SECONDARY_THRESHOLD = 5000, EMPLOYER_NI = 0.15, PRIMARY_THRESHOLD = 12570, EMPLOYEE_NI = 0.08
export const LOWER_EARNINGS_LIMIT = 6708
/** Director salaries the comparison tries: none, up to employer NI, the NI record limit, and the personal allowance. */
export const SALARY_OPTIONS = [0, SECONDARY_THRESHOLD, LOWER_EARNINGS_LIMIT, PRIMARY_THRESHOLD]

export function corporationTax(profit: number) {
  const p = Math.max(0, profit)
  if (p <= 50000) return p * 0.19
  if (p >= 250000) return p * 0.25
  return p * 0.25 - (250000 - p) * (3 / 200)
}

/** Income tax (England, Wales and NI rates) on wages/other income plus dividends, dividends taxed last. */
export function incomeTaxWithDividends(nonSavings: number, dividends: number) {
  const ns = Math.max(0, nonSavings), dv = Math.max(0, dividends)
  const pa = Math.max(0, PA - Math.max(0, ns + dv - 100000) / 2)
  const paNs = Math.min(ns, pa), paDv = Math.min(dv, pa - paNs)
  const tNs = ns - paNs, tDv = dv - paDv
  const bands: [number, number, number][] = [[BASIC, 0.2, DIVIDEND_RATES.basic], [HIGHER_TOP, 0.4, DIVIDEND_RATES.higher], [Infinity, 0.45, DIVIDEND_RATES.additional]]
  let used = 0, tax = 0
  const fill = (amount: number, rateOf: (b: [number, number, number]) => number) => {
    let left = amount
    for (const b of bands) {
      if (left <= 0) break
      const room = Math.max(0, b[0] - used), take = Math.min(room, left)
      tax += take * rateOf(b); used += take; left -= take
    }
  }
  fill(tNs, (b) => b[1])
  const free = Math.min(DIVIDEND_ALLOWANCE, tDv)
  used += free // the allowance is taxed at 0% but still uses up the band
  fill(tDv - free, (b) => b[2])
  return tax
}

export type CompanyResult = { salary: number; employerNi: number; employeeNi: number; corpTax: number; dividends: number; incomeTax: number; costs: number; total: number; takeHome: number }
export type Comparison = { soleTrader: { total: number; takeHome: number; incomeTax: number; ni: number }; company: CompanyResult; difference: number }

/**
 * Compare the same yearly locum profit as a sole trader and through a company that pays the director a
 * salary (whichever of SALARY_OPTIONS costs least) and the rest of its post-tax profit as dividends.
 * `otherSalary` is pay from an employed job, which uses up allowances and bands first.
 */
export function compareStructures(o: { profit: number; otherSalary?: number; companyCosts?: number }): Comparison {
  const P = Math.max(0, o.profit), O = Math.max(0, o.otherSalary || 0), costs = Math.max(0, o.companyCosts || 0)
  const st = yearTax({ trading: P, property: 0, salary: O, scotland: false })
  const soleTrader = { total: st.total, takeHome: P - st.total, incomeTax: st.incomeTaxDue, ni: st.ni.tax }
  const baseTax = incomeTax(O, false).tax
  const run = (salary: number): CompanyResult => {
    const available = Math.max(0, P - costs)
    const S = Math.min(salary, available / (1 + EMPLOYER_NI))
    const employerNi = Math.max(0, S - SECONDARY_THRESHOLD) * EMPLOYER_NI
    const employeeNi = Math.max(0, S - PRIMARY_THRESHOLD) * EMPLOYEE_NI
    const taxable = Math.max(0, available - S - employerNi)
    const corpTax = corporationTax(taxable)
    const dividends = taxable - corpTax
    const it = Math.max(0, incomeTaxWithDividends(O + S, dividends) - baseTax)
    const total = employerNi + employeeNi + corpTax + it
    return { salary: S, employerNi, employeeNi, corpTax, dividends, incomeTax: it, costs, total, takeHome: P - costs - total }
  }
  const company = SALARY_OPTIONS.map(run).sort((a, b) => b.takeHome - a.takeHome)[0]
  return { soleTrader, company, difference: company.takeHome - soleTrader.takeHome }
}
