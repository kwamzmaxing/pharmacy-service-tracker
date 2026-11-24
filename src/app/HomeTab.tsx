// Home: where things stand, what needs doing, and a way into every part of the tracker.
import type { ReactNode } from "react"
import { useState } from "react"
import { ArrowRight, CalendarDays, Calculator, Car, ChartPie, CheckCircle2, Clock, FileText, Mail, Pill as PillIcon, Plus, Receipt, Settings, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { callName, entryAmt, fmtDate, followUpsDue, invStatus, isoOf, money, monthly, plural, qtyText, taxSummary, today, unitOf } from "@/lib/model"
import { useApp, type Tab } from "./ctx"
import { placeName, shiftPay, toLog, upcoming } from "@/lib/shifts"
import { Panel } from "./bits"
import { Donut, type Slice } from "./charts"
import { ActivityList, Change, LineChart, StatCard, pctChange, type Activity } from "./dashCharts"

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

/** A big tappable tile for the things people do most. */
function Action({ icon, label, sub, onClick }: { icon: ReactNode; label: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="group flex min-w-0 flex-col items-start gap-3 rounded-xl bg-card p-4 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-brand-ink [&_svg]:size-[18px]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-medium">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{sub}</span>
      </span>
    </button>
  )
}

export function HomeTab() {
  const { data, me, go, google, showFollowUps } = useApp()
  const p = data.profile
  const first = callName(p, me.name)
  const months = monthly(data, 12)
  const thisMonth = months[months.length - 1]
  const t = today()
  // This month so far vs the same point last month, so a part-month isn't compared with a whole one
  const lastSameDay = (() => { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() - 1, 1); const end = new Date(m.getFullYear(), m.getMonth() + 1, 0); return isoOf(new Date(m.getFullYear(), m.getMonth(), Math.min(d.getDate(), end.getDate()))) })()
  const monthStart = t.slice(0, 8) + "01", lastStart = lastSameDay.slice(0, 8) + "01"
  const loggedIn = (a: string, b: string) => data.entries.filter((e) => e.date >= a && e.date <= b).reduce((x, e) => x + entryAmt(e), 0)
  const paidIn = (a: string, b: string) => data.invoices.filter((i) => i.status === "paid" && i.paidDate && i.paidDate >= a && i.paidDate <= b).reduce((x, i) => x + i.total, 0)
  const loggedNow = loggedIn(monthStart, t), loggedBefore = loggedIn(lastStart, lastSameDay)
  const paidNow = paidIn(monthStart, t), paidBefore = paidIn(lastStart, lastSameDay)
  const six = months.slice(-6)
  const cashSix = six.map((m) => paidIn(m.ym + "-01", m.ym + "-31"))
  const unbilled = data.entries.filter((e) => !e.invoiced)
  const unbilledTotal = unbilled.reduce((a, e) => a + entryAmt(e), 0)
  const open = data.invoices.filter((i) => invStatus(i) !== "paid")
  const overdue = open.filter((i) => invStatus(i) === "overdue")
  const owed = open.reduce((a, i) => a + i.total, 0)
  const tax = taxSummary(data)
  const due = followUpsDue(data)
  const svc = (id: string) => data.services.find((s) => s.id === id)

  // What needs doing, most pressing first
  const todo: { tone: "danger" | "warn" | "info"; text: string; cta: string; act: () => void }[] = []
  if (due.length) todo.push({ tone: "danger", text: `${plural(due.length, "invoice")} ready for a payment reminder.`, cta: "Send follow-ups", act: showFollowUps })
  else if (overdue.length) todo.push({ tone: "danger", text: `${plural(overdue.length, "invoice")} overdue (${money(overdue.reduce((a, i) => a + i.total, 0))}).`, cta: "See invoices", act: () => go("invoices") })
  const shiftsDone = toLog(data)
  // The next shift if it starts within a day (also sent as a reminder notification where possible)
  const soon = upcoming(data).find((s) => { const ms = new Date(`${s.date}T${s.start}:00`).getTime() - Date.now(); return ms > 0 && ms < 86_400_000 })
  if (soon) todo.push({ tone: "info", text: `Next shift: ${placeName(data, soon)} at ${soon.start}${soon.date === today() ? " today" : " tomorrow"}.`, cta: "See shifts", act: () => go("shifts") })
  if (shiftsDone.length) todo.push({ tone: "warn", text: `${plural(shiftsDone.length, "finished shift")} not in your log yet.`, cta: "Review shifts", act: () => go("shifts") })
  if (unbilledTotal > 0) todo.push({ tone: "warn", text: `${money(unbilledTotal)} of logged work isn’t on an invoice yet.`, cta: "Create invoice", act: () => go("summary") })
  const missing = [!p.fullName && "your name", !(p.sortCode && p.accountNumber) && "bank details"].filter(Boolean)
  if (missing.length) todo.push({ tone: "info", text: `Your invoices are missing ${missing.join(" and ")}.`, cta: "Add details", act: () => go("account") })
  if (!data.clients.length) todo.push({ tone: "info", text: "Save the pharmacies you work for so their details fill in on invoices.", cta: "Add a pharmacy", act: () => go("clients") })

  // Where this tax year's work came from, by pharmacy (top four, then everything else)
  const [hotSlice, setHotSlice] = useState<string | null>(null)
  const byClient: Record<string, number> = {}
  for (const e of data.entries) if (e.date >= tax.year.from && e.date <= tax.year.to) byClient[e.clientId || ""] = (byClient[e.clientId || ""] || 0) + entryAmt(e)
  const ranked = Object.entries(byClient).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const slices: Slice[] = ranked.slice(0, 4).map(([id, v], i) => ({ id: id || "none", label: id ? data.clients.find((c) => c.id === id)?.name || "Pharmacy" : "Not linked to a pharmacy", value: v, color: `var(--pot-${i})` }))
  const rest = ranked.slice(4).reduce((a, [, v]) => a + v, 0)
  if (rest > 0) slices.push({ id: "other", label: "Other pharmacies", value: rest, color: "hsl(var(--muted-foreground))" })
  const workTotal = slices.reduce((a, x) => a + x.value, 0)

  // Recent activity across the tracker, newest first
  const activity: Activity[] = []
  for (const e of data.entries) {
    const sv = svc(e.serviceId), c = e.clientId ? data.clients.find((x) => x.id === e.clientId) : undefined
    activity.push({ id: "e" + e.id, at: e.date, icon: <PillIcon />, text: <>Logged {sv?.name || "work"}{unitOf(sv) !== "each" || e.qty !== 1 ? ` · ${qtyText(e.qty, unitOf(sv))}` : ""} <span className="num font-medium">{money(entryAmt(e))}</span></>, sub: c?.name })
  }
  for (const i of data.invoices) {
    activity.push({ id: "i" + i.id, at: i.created || i.issued, icon: <FileText />, text: <>Created {i.number} for {i.to.name || "a pharmacy"} <span className="num font-medium">{money(i.total)}</span></> })
    if (i.sentAt) activity.push({ id: "s" + i.id, at: i.sentAt, icon: <Mail />, text: <>Emailed {i.number} to {i.to.name || "the pharmacy"}</> })
    if (i.status === "paid" && i.paidDate) activity.push({ id: "p" + i.id, at: i.paidDate, icon: <CheckCircle2 />, text: <>{i.number} paid <span className="num font-medium">{money(i.total)}</span></>, sub: i.to.name })
  }
  for (const x of data.expenses) activity.push({ id: "x" + x.id, at: x.date, icon: <Receipt />, text: <>Expense: {x.desc || "cost"} <span className="num font-medium">{money(x.amount)}</span></> })
  for (const sh of data.shifts) if (sh.created) activity.push({ id: "sh" + sh.id, at: sh.created, icon: <CalendarDays />, text: <>Booked a shift at {placeName(data, sh)}</>, sub: `${fmtDate(sh.date)}, ${sh.start}` })
  // Dates (yyyy-mm-dd) count as midday local time; nothing dated in the future
  const when = (a: string) => new Date(a.length === 10 ? a + "T12:00:00" : a).getTime()
  const recentActivity = activity.filter((a) => a.at && (a.at.length === 10 ? a.at <= t : true)).sort((a, b) => when(b.at) - when(a.at)).slice(0, 8)

  const nextShift = upcoming(data)[0]
  const sections: { tab: Tab; icon: ReactNode; title: string; text: string; stat: string }[] = [
    { tab: "shifts", icon: <CalendarDays />, title: "Shifts", text: "Booked work on a calendar, with what it pays. Syncs to Google Calendar.", stat: nextShift ? `Next: ${fmtDate(nextShift.date)}, ${nextShift.start} · ${placeName(data, nextShift)} · ${money(shiftPay(nextShift))}` : "Nothing booked" },
    { tab: "log", icon: <PillIcon />, title: "Log", text: "Services, hours and journeys as you do them.", stat: `${plural(data.entries.filter((e) => e.date.startsWith(thisMonth.ym)).length, "entry", "entries")} this month` },
    { tab: "invoices", icon: <FileText />, title: "Invoices", text: "Create, send, chase and mark as paid.", stat: open.length ? `${plural(open.length, "unpaid invoice")}` : "Nothing outstanding" },
    { tab: "expenses", icon: <Receipt />, title: "Expenses", text: "Costs and receipt photos, ready for your tax return.", stat: `${money(tax.expenses)} in ${tax.year.label}` },
    { tab: "tax", icon: <Calculator />, title: "Tax", text: "Income tax and National Insurance, estimated as you go.", stat: `About ${money(tax.total)} so far` },
    { tab: "budget", icon: <ChartPie />, title: "Accounting", text: "Share out what comes in: tax, bills, savings and spending.", stat: data.budget.active === "custom" && data.budget.custom.length ? plural(data.budget.custom.length, "pot") + " in your split" : "Suggested split ready" },
    { tab: "clients", icon: <Store />, title: "Pharmacies", text: "Saved details and how quickly each one pays.", stat: plural(data.clients.length, "pharmacy", "pharmacies") + " saved" },
    { tab: "account", icon: <Settings />, title: "Settings", text: "Invoice details, Gmail, calendar, appearance.", stat: google.gmail === "ready" ? "Gmail connected" : "Gmail not connected" },
  ]

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="pt-2">
        <p className="text-[13px] text-muted-foreground">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h2 className="mt-1 font-display text-[clamp(24px,5vw,32px)] font-medium leading-tight">{greeting()}{first ? `, ${first}` : ""}.</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">Here’s how your locum work is going.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Action icon={<Plus />} label="Log a service" sub="Pharmacy First, NMS, flu jabs…" onClick={() => go("log", "service")} />
        <Action icon={<Clock />} label="Log hours" sub="A shift at an hourly rate" onClick={() => go("log", "hours")} />
        <Action icon={<Car />} label="Work out a journey" sub="Miles from A to B, on a map" onClick={() => go("log", "journey")} />
        <Action icon={<FileText />} label="Create invoice" sub="From the work you’ve logged" onClick={() => go("summary")} />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Earned this month" value={money(loggedNow)} foot={<Change value={pctChange(loggedNow, loggedBefore)} label="vs this point last month" />} spark={six.map((m) => m.logged)} onClick={() => go("log")} />
        <StatCard label="Paid to you this month" value={money(paidNow)} foot={<Change value={pctChange(paidNow, paidBefore)} label="vs this point last month" />} spark={cashSix} sparkColor="var(--series-paid)" onClick={() => go("invoices")} />
        <StatCard label="Owed to you" value={money(owed)} alert={overdue.length > 0} onClick={() => go("invoices")}
          foot={<span className="text-[12px] text-muted-foreground">{open.length ? `${plural(open.length, "unpaid invoice")}${overdue.length ? ` · ${overdue.length} overdue` : ""}` : "Nothing outstanding"}</span>} />
        <StatCard label="Set aside for tax" value={money(tax.total)} onClick={() => go("tax")}
          foot={<span className="text-[12px] text-muted-foreground">Estimate for {tax.year.label} · {money(unbilledTotal)} not invoiced</span>} />
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Earnings overview" aside="Last 12 months, by the month you did the work">
          <LineChart
            points={months.map((m) => ({ label: m.label, long: new Date(m.ym + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), values: { logged: m.logged, paid: m.paid } }))}
            series={[{ key: "logged", label: "Work logged", color: "var(--series-logged)" }, { key: "paid", label: "Paid for so far", color: "var(--series-paid)" }]}
            format={money} axis={(v) => (v >= 1000 ? `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${Math.round(v)}`)}
            ariaLabel="Work logged and paid for, by month worked, over the last 12 months" empty="Log some work to see your earnings here." />
        </Panel>
        <Panel title="Where your work comes from" aside={`${tax.year.label} tax year`}>
          {slices.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <Donut slices={slices} total={workTotal} centreLabel="Work logged" active={hotSlice} onActive={setHotSlice} />
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px]">
                {slices.map((x) => (
                  <li key={x.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2" onMouseEnter={() => setHotSlice(x.id)} onMouseLeave={() => setHotSlice(null)}>
                    <span className="size-2.5 self-center rounded-[3px]" style={{ background: x.color }} />
                    <span className="truncate">{x.label}</span>
                    <span className="num text-muted-foreground">{Math.round((x.value / workTotal) * 100)}%</span>
                    <span className="num col-start-2 font-medium text-foreground">{money(x.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-[13.5px] text-muted-foreground">Log work against a pharmacy to see the split here.</p>}
        </Panel>
      </div>

      <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-2">
      <Panel title="Needs your attention">
        {todo.length ? (
          <ul className="grid divide-y divide-border/60">
            {todo.map((t, k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                <span className="flex min-w-0 flex-1 items-start gap-3 text-[14px] leading-snug">
                  <span aria-hidden className={cn("mt-[6px] size-2 flex-none rounded-full", t.tone === "danger" ? "bg-destructive" : t.tone === "warn" ? "bg-warn" : "bg-primary")} />
                  {t.text}
                </span>
                <button type="button" onClick={t.act} className="whitespace-nowrap rounded-full bg-secondary px-4 py-1.5 text-[13px] font-medium hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.cta}</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">You’re all caught up: everything is invoiced and nothing is overdue.</p>
        )}
      </Panel>

      <Panel title="Recent activity" aside={<button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => go("log")}>See your log</button>}>
        <ActivityList items={recentActivity} empty="Nothing yet. Log your first service, shift or expense to see it here." />
      </Panel>
      </div>

      <section aria-labelledby="h-sections">
        <h2 id="h-sections" className="mb-3 font-display text-[17px] font-medium">Your tracker</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <button key={s.tab} type="button" onClick={() => go(s.tab)}
              className="group flex min-w-0 items-start gap-4 rounded-xl bg-card p-5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex size-9 flex-none items-center justify-center rounded-full bg-secondary text-foreground group-hover:bg-background [&_svg]:size-[18px]">{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[15px] font-medium">
                  {s.title}
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{s.text}</span>
                <span className="mt-2.5 block text-[12.5px] font-medium text-brand-ink">{s.stat}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
