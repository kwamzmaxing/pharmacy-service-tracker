// Insights: services delivered, revenue, what's outstanding and how fast pharmacies pay,
// all worked out from the person's own log and invoices.
import { useState } from "react"
import { finance, periodOf, previousOf, type PeriodKey } from "@/lib/finance"
import { fmtDate, invStatus, money, plural, qtyText, today } from "@/lib/model"
import { cn } from "@/lib/utils"
import { useApp } from "./ctx"
import { Chips, Panel } from "./bits"
import { BarList, Change, ColumnChart, StatCard, pctChange } from "./dashCharts"

const PERIODS: [PeriodKey, string][] = [["ty", "This tax year"], ["12m", "Last 12 months"], ["lastTy", "Last tax year"], ["all", "All time"]]
const num = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10).toLocaleString("en-GB")
const axisMoney = (v: number) => (v >= 1000 ? `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${Math.round(v)}`)

export function InsightsTab() {
  const { data, go, viewInvoice } = useApp()
  const [key, setKey] = useState<PeriodKey>(() => {
    try { const v = localStorage.getItem("pst_insights_period") as PeriodKey | null; return v && PERIODS.some(([k]) => k === v) ? v : "ty" } catch { return "ty" }
  })
  const pick = (k: PeriodKey) => { setKey(k); try { localStorage.setItem("pst_insights_period", k) } catch { /* private mode */ } }

  const t = today()
  const p = periodOf(key, data, t)
  const f = finance(data, p.from, p.to, t)
  const prevRange = previousOf(p)
  const prev = prevRange ? finance(data, prevRange.from, prevRange.to, t) : null
  const vs = key === "lastTy" ? "vs the tax year before" : key === "12m" ? "vs the 12 months before" : "vs this point last tax year"
  const o = f.outstanding
  const thisYm = t.slice(0, 7)
  const top = f.byService.slice(0, 7)
  const rest = f.byService.slice(7)
  const serviceRows = [
    ...top.map((r) => ({ label: r.name, value: r.revenue, note: `${qtyText(r.qty, r.unit)}${f.revenue ? ` · ${Math.round((r.revenue / f.revenue) * 100)}%` : ""}` })),
    ...(rest.length ? [{ label: `${plural(rest.length, "other service")}`, value: rest.reduce((a, r) => a + r.revenue, 0), note: "" }] : []),
  ]
  const oldest = o.invoices.slice(0, 5)

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[clamp(22px,4.5vw,28px)] font-medium leading-tight">Insights</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">Worked out from your own log and invoices. {p.label}{key !== "all" ? `, ${fmtDate(p.from)} to ${fmtDate(p.to)}` : ""}.</p>
        </div>
        <Chips label="Period" value={key} options={PERIODS} onChange={pick} />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Services delivered" value={num(f.services)} onClick={() => go("log")}
          foot={<>
            {prev && prev.services > 0 && <Change value={pctChange(f.services, prev.services)} label={vs} />}
            <span className="text-[12px] text-muted-foreground">Plus {qtyText(f.hours, "hour")} and {qtyText(f.miles, "mile")}</span>
          </>} />
        <StatCard label="Revenue generated" value={money(f.revenue)} spark={f.byMonth.slice(-12).map((m) => m.revenue)} onClick={() => go("log")}
          foot={<>
            {prev && prev.revenue > 0 && <Change value={pctChange(f.revenue, prev.revenue)} label={vs} />}
            <span className="text-[12px] text-muted-foreground">{money(f.paidFor)} of it paid for so far</span>
          </>} />
        <StatCard label="Outstanding invoices" value={money(o.total)} alert={o.overdueCount > 0} onClick={() => go("invoices")}
          foot={<span className="text-[12px] text-muted-foreground">{o.invoices.length ? `${plural(o.invoices.length, "invoice")}${o.overdueCount ? ` · ${o.overdueCount} overdue (${money(o.overdueTotal)})` : " · none overdue"}` : "Nothing outstanding"} · as of today</span>} />
        <StatCard label="Average time to payment" value={f.pay.avgDays === null ? "—" : plural(f.pay.avgDays, "day")} onClick={() => go("clients")}
          foot={<>
            {prev && f.pay.avgDays !== null && prev.pay.avgDays !== null && <Change value={pctChange(f.pay.avgDays, prev.pay.avgDays)} goodWhenUp={false} label={vs} />}
            <span className="text-[12px] text-muted-foreground">{f.pay.count ? `From ${plural(f.pay.count, "paid invoice")} · ${f.pay.onTime} paid by the due date` : "Shows once invoices are marked paid"}</span>
          </>} />
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Monthly revenue" aside="By the month you did the work">
          <ColumnChart
            points={f.byMonth.map((m) => ({ label: m.label, long: m.long, value: m.revenue, note: m.ym === thisYm ? "So far this month" : undefined }))}
            format={money} axis={axisMoney} ariaLabel={`Revenue logged each month, ${p.label}`} empty="Log some work to see your monthly revenue." />
        </Panel>
        <Panel title="Revenue by service type" aside={p.label}>
          <BarList rows={serviceRows} format={money} empty="Nothing logged in this period." />
        </Panel>
      </div>

      <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-2">
        <Panel title="Outstanding invoices" aside={<button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => go("invoices")}>See invoices</button>}>
          {o.invoices.length ? (
            <div className="grid gap-5">
              <BarList rows={o.ageing.map((b) => ({ label: b.label, value: b.total, note: b.count ? plural(b.count, "invoice") : "" }))} format={money} />
              <div>
                <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Oldest first</h3>
                <ul className="grid divide-y divide-border/60">
                  {oldest.map((i) => {
                    const late = invStatus(i) === "overdue"
                    return (
                      <li key={i.id}>
                        <button type="button" onClick={() => viewInvoice(i.id)} className="flex w-full items-center justify-between gap-3 rounded-md py-2.5 text-left text-[13.5px] hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{i.number} · {i.to.name || "Pharmacy"}</span>
                            <span className={cn("block text-[12px]", late ? "text-danger-ink" : "text-muted-foreground")}>{late ? `Overdue since ${fmtDate(i.due)}` : `Due ${fmtDate(i.due)}`}</span>
                          </span>
                          <span className="num whitespace-nowrap font-medium">{money(i.total)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ) : <p className="text-[13.5px] text-muted-foreground">Nothing outstanding: every invoice has been paid.</p>}
        </Panel>
        <Panel title="Time to payment by pharmacy" aside={p.label}>
          <BarList rows={f.payByPharmacy.map((x) => ({ label: x.name, value: x.avgDays, note: plural(x.count, "invoice") }))} format={(v) => plural(v, "day")}
            empty="Shows once invoices paid in this period are marked paid." />
          {f.pay.count > 0 && <p className="mt-4 text-[12.5px] text-muted-foreground">Days from the invoice date to the day you marked it paid. Fastest {plural(f.pay.fastest!, "day")}, slowest {plural(f.pay.slowest!, "day")}.</p>}
        </Panel>
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Revenue is the value of the work you’ve logged (services, hours and mileage) before expenses and tax. Services delivered counts per-item services such as consultations, and leaves out hours and miles. Outstanding invoices are as of today, whatever period you pick. For tax estimates, see the <button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => go("tax")}>Tax</button> page.
      </p>
    </div>
  )
}
