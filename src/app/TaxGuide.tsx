// Plain-English tax tips for locum pharmacists.
// Every statement here comes from a GOV.UK / HMRC page, linked under each tip. Figures are for the
// 2026 to 2027 tax year unless a tip says otherwise. When rates change, update the tip and its link.
import type { ReactNode } from "react"
import { ChevronDown, ExternalLink } from "lucide-react"
import { fmtDate, RATES_CHECKED } from "@/lib/model"
import { useApp } from "./ctx"

type Source = [label: string, url: string]
export type Tip = { id: string; q: string; a: ReactNode; sources: Source[] }

const G = "https://www.gov.uk"

export const BASICS: Tip[] = [
  {
    id: "how-it-works",
    q: "How does tax work when I’m self-employed?",
    a: <>
      <p>If you locum as a sole trader (self-employed), you add up what pharmacies paid you, take off your allowable expenses, and pay tax on what’s left: your <b>profit</b>. HMRC’s example: £40,000 of income with £10,000 of allowable expenses means you pay tax on £30,000.</p>
      <p>You report this once a year on a <b>Self Assessment tax return</b>, for the tax year that runs from 6 April to 5 April. HMRC works out the bill from what you report.</p>
    </>,
    sources: [["Expenses if you’re self-employed", `${G}/expenses-if-youre-self-employed`], ["Self Assessment tax returns", `${G}/self-assessment-tax-returns`]],
  },
  {
    id: "rates",
    q: "What are the tax rates?",
    a: <>
      <p>For 2026 to 2027 (outside Scotland):</p>
      <ul>
        <li>First £12,570: 0% (your Personal Allowance)</li>
        <li>£12,571 to £50,270: 20% (basic rate)</li>
        <li>£50,271 to £125,140: 40% (higher rate)</li>
        <li>Over £125,140: 45% (additional rate)</li>
      </ul>
      <p>Your Personal Allowance goes down by £1 for every £2 of income over £100,000. Scotland has different bands; switch on “I live in Scotland” below.</p>
    </>,
    sources: [["Income Tax rates and Personal Allowances", `${G}/income-tax-rates`]],
  },
  {
    id: "ni",
    q: "What National Insurance do I pay?",
    a: <>
      <p>On self-employed profits over £12,570 you pay <b>Class 4</b> National Insurance: 6% on profits from £12,570 to £50,270, and 2% above that (2026 to 2027). Most people pay it through Self Assessment, with their tax.</p>
      <p>If your profits are £7,105 or more, <b>Class 2</b> is treated as paid, so you don’t have to pay it but your National Insurance record is protected. Below that you can choose to pay voluntary Class 2 (£3.65 a week in 2026 to 2027).</p>
    </>,
    sources: [["Self-employed National Insurance rates", `${G}/self-employed-national-insurance-rates`]],
  },
]

export const PAYE: Tip[] = [
  {
    id: "paye-and-locum",
    q: "I have a PAYE job and do locum shifts. How does that work?",
    a: <>
      <p>You can be employed and self-employed at the same time. Your employer takes tax and National Insurance from your salary through PAYE, using your <b>tax code</b>. Your locum profit isn’t taxed until you report it on your Self Assessment return.</p>
      <p>The tax code 1257L, used for most people with one job, gives your whole £12,570 Personal Allowance to that job. Tax bands apply to your income as a whole, so if your salary already uses your Personal Allowance, your locum profit is taxed from the first pound: at 20% until your total income reaches £50,270, then 40%.</p>
      <p><b>Worked example</b> (using the 2026 to 2027 rates above, outside Scotland): a £30,000 salary and £15,000 locum profit. The locum profit is all taxed at 20%, so £3,000 income tax. Class 4 National Insurance is worked out on your profit alone: 6% of (£15,000 − £12,570) = £145.80. Your salary’s tax and National Insurance are already taken through PAYE.</p>
      <p>Put your yearly salary in “Your tax settings” below so this estimate uses the right bands.</p>
    </>,
    sources: [["Working for yourself", `${G}/working-for-yourself`], ["Tax codes", `${G}/tax-codes/what-your-tax-code-means`], ["Income Tax rates", `${G}/income-tax-rates`], ["Self-employed National Insurance rates", `${G}/self-employed-national-insurance-rates`]],
  },
  {
    id: "gphc-fee",
    q: "Where do I claim my GPhC fee and indemnity insurance?",
    a: <>
      <p><b>If you have a PAYE job as well as locum work:</b> claim your GPhC registration fee as an <b>employment expense</b>, and your locum indemnity insurance as a <b>self-employed (locum) expense</b>. Claim each one once only, never in both places.</p>
      <ul>
        <li><b>GPhC fee:</b> the General Pharmaceutical Council is on HMRC’s list of approved professional bodies (List 3), and relief is due to pharmacists for staying on the register. As you file a Self Assessment return, you must claim it there (in the employment section) rather than on a separate claim form. It’s worth the fee times your tax rate: for example, a £293 fee at 20% is £58.60. Check the current fee with the GPhC.</li>
        <li><b>Locum indemnity insurance:</b> add it on the Expenses tab as indemnity insurance. HMRC lists indemnity insurance premiums as a business expense.</li>
      </ul>
      <p>Why not put the GPhC fee against your locum income instead? It can look like it saves more, but self-employed costs must be <b>wholly and exclusively</b> for the business, and your registration also covers your employed job. That makes the employment route the clearer one. Royal Pharmaceutical Society membership is also on List 3.</p>
      <p><b>If you only do locum work</b> (no PAYE job), your GPhC fee and memberships are business costs: add them on the Expenses tab under Professional fees.</p>
    </>,
    sources: [["HMRC List 3: approved professional bodies", `${G}/government/publications/professional-bodies-approved-for-tax-relief-list-3`], ["Tax relief for employees: professional fees", `${G}/tax-relief-for-employees/professional-fees-and-subscriptions`], ["Tax relief for employees: how much you get", `${G}/tax-relief-for-employees/overview`], ["Legal and financial costs (indemnity insurance)", `${G}/expenses-if-youre-self-employed/legal-financial`], ["HMRC manual: wholly and exclusively (BIM37000)", `${G}/hmrc-internal-manuals/business-income-manual/bim37000`]],
  },
  {
    id: "pay-through-code",
    q: "Can I pay my locum tax through my PAYE salary instead?",
    a: <>
      <p>Yes, if all of these apply: you owe less than £3,000, you already pay tax through PAYE, and you file your online return by <b>30 December</b> (or a paper return by 31 October). HMRC then collects it from your salary in 12 equal monthly instalments. It isn’t possible if, for example, you’d pay more than 50% of your PAYE income in tax.</p>
    </>,
    sources: [["Pay your Self Assessment bill through your tax code", `${G}/pay-self-assessment-tax-bill/through-your-tax-code`]],
  },
  {
    id: "employer-locum",
    q: "My employer also books me as a locum. Anything to watch?",
    a: <>
      <p>You can’t use the trading allowance in a tax year if any of your trading income comes from your employer (or your spouse’s or civil partner’s employer), or from a company or partnership that you or someone connected to you owns, controls or is a partner in. Claim your actual expenses instead.</p>
    </>,
    sources: [["Tax-free allowances on property and trading income", `${G}/guidance/tax-free-allowances-on-property-and-trading-income`]],
  },
  {
    id: "student-loan",
    q: "How do student loan repayments work with locum income?",
    a: <>
      <p>If you’re self-employed, HMRC works out your repayments from your Self Assessment return, based on your income for the whole year, and you pay them with your tax. If you’re also employed, repayments are based on your combined income; anything already taken from your salary is deducted. Your plan’s threshold and rate are on GOV.UK. Choose your plan under Your tax settings and the estimate on this page includes it.</p>
    </>,
    sources: [["Repaying your student loan: how much you repay", `${G}/repaying-your-student-loan/what-you-pay`]],
  },
]

export const DATES: Tip[] = [
  {
    id: "deadlines",
    q: "What are the key dates?",
    a: <>
      <ul>
        <li><b>5 October</b>: register for Self Assessment if it’s your first return (or you didn’t need one last year), for the tax year that ended on 5 April. You’ll get a Unique Taxpayer Reference (UTR).</li>
        <li><b>31 October</b>: deadline for paper returns.</li>
        <li><b>30 December</b>: file online by now if you want to pay through your tax code.</li>
        <li><b>31 January</b>: deadline for online returns, and for paying what you owe.</li>
        <li><b>31 July</b>: second payment on account, if you make them.</li>
      </ul>
      <p>You can file any time after 5 April. Filing early tells you what you owe sooner, so you can budget.</p>
    </>,
    sources: [["Self Assessment deadlines", `${G}/self-assessment-tax-returns/deadlines`], ["Register for Self Assessment", `${G}/register-for-self-assessment`]],
  },
  {
    id: "poa",
    q: "Why might I pay more than my bill in January? (payments on account)",
    a: <>
      <p><b>Payments on account</b> are advance payments towards next year’s bill, including Class 4 National Insurance. Each is usually half of last year’s bill, due 31 January and 31 July. You don’t have to make them if last year’s bill was less than £1,000, or if more than 80% of your tax was already paid another way (for example through your tax code).</p>
      <p>In your first year this can be a surprise. HMRC’s example: a £3,000 bill means paying £4,500 by 31 January (the £3,000 plus a £1,500 first payment on account), then £1,500 by 31 July. Setting money aside each month helps.</p>
    </>,
    sources: [["Payments on account", `${G}/understand-self-assessment-bill/payments-on-account`]],
  },
  {
    id: "penalties",
    q: "What if I’m late?",
    a: <>
      <p>Filing late: £100 straight away; after 3 months, £10 a day up to £900; after 6 and 12 months, a further 5% of the tax due or £300, whichever is more. Paying late: 5% of the unpaid tax at 30 days, 6 months and 12 months, plus interest. If you have a reasonable excuse you can appeal.</p>
    </>,
    sources: [["Self Assessment penalties", `${G}/self-assessment-tax-returns/penalties`]],
  },
  {
    id: "mtd",
    q: "Will I need to use Making Tax Digital?",
    a: <>
      <p>Making Tax Digital for Income Tax is a new way to report your income and expenses to HMRC, using compatible software. Whether you need it depends on your <b>self-employment and property income before expenses</b> (a PAYE salary doesn’t count towards this). If that income is over:</p>
      <ul>
        <li>£50,000 in 2024 to 2025: from 6 April 2026</li>
        <li>£30,000 in 2025 to 2026: from 6 April 2027</li>
        <li>£20,000 in 2026 to 2027: from 6 April 2028</li>
      </ul>
      <p>HMRC writes to you if you need to start, but it’s your responsibility to check. HMRC’s online tool tells you if and when. The Making Tax Digital section on this page shows your quarterly updates and exports your records for HMRC-recognised software.</p>
    </>,
    sources: [["Find out if and when you need to use Making Tax Digital for Income Tax", `${G}/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax`], ["Self Assessment: who must send a tax return", `${G}/self-assessment-tax-returns/who-must-send-a-tax-return`]],
  },
]

export const EXPENSE_TIPS: Tip[] = [
  {
    id: "what-counts",
    q: "What can a locum claim?",
    a: <>
      <p>Only costs for your work, for example:</p>
      <ul>
        <li>Professional indemnity insurance</li>
        <li>Membership of a professional organisation related to your work, and professional journals (if you also have a PAYE job, see “Where do I claim my GPhC fee and indemnity insurance?”)</li>
        <li>Training that keeps the skills you already use up to date (not training for a new line of business)</li>
        <li>The business share of your phone and internet bills</li>
        <li>Accountant’s fees</li>
        <li>Uniforms or protective clothing (not everyday clothes, even if you only wear them for work)</li>
        <li>Hotels, and meals on overnight business trips</li>
      </ul>
      <p>If something is part personal, claim only the business part. HMRC’s example: £200 of phone bills with £70 of business calls means claiming £70. Not sure? Ask HMRC or an accountant.</p>
    </>,
    sources: [["Expenses if you’re self-employed", `${G}/expenses-if-youre-self-employed`], ["Legal and financial costs", `${G}/expenses-if-youre-self-employed/legal-financial`], ["Subscriptions", `${G}/expenses-if-youre-self-employed/subscriptions`], ["Training courses", `${G}/expenses-if-youre-self-employed/training-courses`], ["Clothing", `${G}/expenses-if-youre-self-employed/clothing`]],
  },
  {
    id: "travel",
    q: "Can I claim travel to the pharmacies I work at?",
    a: <>
      <p>HMRC’s general rule is that you <b>can’t</b> claim travel between home and work. But its manual explains that when someone works at many different places, each for a temporary period, home can be their base and travel to those places is normally allowable (the case it cites is a bricklayer working on different building sites). If you work regularly at the same pharmacy, travel there is more likely to count as home-to-work. Each case depends on its facts, so check how this applies to you with an accountant.</p>
      <p>When travel does count, you can claim fuel, parking and fares, or use HMRC’s flat mileage rate for a car or van instead of the actual running costs: 55p a mile for the first 10,000 business miles and 25p after (2026 to 2027), or 24p for a motorcycle. Parking and other fares can be added on top. Once you use the flat rate for a vehicle, you must keep using it for that vehicle. HMRC’s flat rates cover cars, goods vehicles such as vans, and motorcycles, not bicycles.</p>
    </>,
    sources: [["Car, van and travel expenses", `${G}/expenses-if-youre-self-employed/travel`], ["Simplified expenses: vehicles", `${G}/simpler-income-tax-simplified-expenses/vehicles`], ["HMRC manual: travel to and between sites (BIM37620)", `${G}/hmrc-internal-manuals/business-income-manual/bim37620`], ["HMRC manual: home to work (BIM37605)", `${G}/hmrc-internal-manuals/business-income-manual/bim37605`]],
  },
  {
    id: "allowance",
    q: "Expenses or the trading allowance?",
    a: <>
      <p>Instead of claiming expenses you can take off a flat <b>trading allowance</b>: £1,000 now, rising to <b>£3,000 from 6 April 2027</b> (tax year 2027 to 2028). You can’t do both. If your gross self-employed income is £1,000 or less it’s tax-free. The comparison on the Tax page shows which means less tax for you.</p>
    </>,
    sources: [["Tax-free allowances on property and trading income", `${G}/guidance/tax-free-allowances-on-property-and-trading-income`], ["Income Tax: increasing the trading allowance", `${G}/government/publications/income-tax-increasing-the-trading-allowance`]],
  },
  {
    id: "records",
    q: "How long should I keep receipts?",
    a: <>
      <p>At least 5 years after the 31 January deadline for that tax year. For example, records for 2026 to 2027 (filed by 31 January 2028) should be kept until at least the end of January 2033.</p>
    </>,
    sources: [["How long to keep your records", `${G}/self-employed-records/how-long-to-keep-your-records`]],
  },
]

export const HELP: Source[] = [
  ["Estimate your Income Tax for the current year (HMRC)", `${G}/estimate-income-tax`],
  ["Check your Income Tax and tax code (HMRC)", `${G}/check-income-tax-current-year`],
  ["Contact HMRC", `${G}/contact-hmrc`],
]

/** A list of tips that open one at a time, each with its GOV.UK sources. */
export function Tips({ tips }: { tips: Tip[] }) {
  return (
    <div className="divide-y divide-border/60">
      {tips.map((t) => (
        <details key={t.id} id={`tip-${t.id}`} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-2.5 text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            {t.q}
            <ChevronDown className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="grid gap-2.5 pb-3 text-[13.5px] leading-relaxed text-muted-foreground [&_b]:font-medium [&_b]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1">
            {t.a}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
              <span>Source:</span>
              {t.sources.map(([l, u]) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">{l}<ExternalLink className="size-3" aria-hidden /></a>
              ))}
            </p>
          </div>
        </details>
      ))}
    </div>
  )
}

/** The line under every set of tips. */
export function GuideNote() {
  const { openAccountant } = useApp()
  return (
    <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
      A general guide from GOV.UK, not financial or tax advice, checked on {fmtDate(RATES_CHECKED)}. Your situation may differ: check with HMRC or a qualified accountant before you file.{" "}
      <button type="button" onClick={openAccountant} className="font-medium text-brand-ink hover:underline">Talk to an accountant</button>
      {" · "}
      <a href={`${import.meta.env.BASE_URL}privacy.html#disclaimer`} target="_blank" rel="noopener" className="underline underline-offset-2">Disclaimer</a>
    </p>
  )
}

/** The GPhC / indemnity tip, also shown on the Expenses page. */
export const GPHC_TIP = PAYE.find((t) => t.id === "gphc-fee")!
