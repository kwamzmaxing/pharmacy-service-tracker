// Home: where things stand, what needs doing, and a way into every part of the tracker.
import type { ReactNode } from "react"
import { ArrowRight, CalendarDays, Calculator, Car, ChartPie, Clock, FileText, Pill as PillIcon, Plus, Receipt, Settings, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { entryAmt, fmtDate, followUpsDue, invStatus, money, monthly, plural, qtyText, taxSummary, today, unitOf } from "@/lib/model"
import { useApp, type Tab } from "./ctx"
import { placeName, shiftPay, toLog, upcoming } from "@/lib/shifts"
import { Ledger, Panel } from "./bits"

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
  const first = (p.fullName || me.name || "").trim().split(/\s+/)[0]
  const months = monthly(data, 1)
  const thisMonth = months[0]
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

  const recent = [...data.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

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
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Action icon={<Plus />} label="Log a service" sub="Pharmacy First, NMS, flu jabs…" onClick={() => go("log", "service")} />
        <Action icon={<Clock />} label="Log hours" sub="A shift at an hourly rate" onClick={() => go("log", "hours")} />
        <Action icon={<Car />} label="Work out a journey" sub="Miles from A to B, on a map" onClick={() => go("log", "journey")} />
        <Action icon={<FileText />} label="Create invoice" sub="From the work you’ve logged" onClick={() => go("summary")} />
      </div>

      <Ledger
        cells={[
          { label: "Logged this month", value: money(thisMonth.logged), sub: new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }) },
          { label: "Not invoiced yet", value: money(unbilledTotal), sub: unbilled.length ? plural(unbilled.length, "entry", "entries") : "All invoiced" },
          { label: "Owed to you", value: money(owed), sub: overdue.length ? `${overdue.length} overdue` : open.length ? "None overdue" : "Nothing outstanding", alert: overdue.length > 0 },
          { label: "Set aside for tax", value: money(tax.total), sub: `Estimate for ${tax.year.label}` },
        ]}
      />

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

      <Panel title="Recently logged" aside={recent.length ? <button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => go("log")}>See all</button> : undefined}>
        {recent.length ? (
          <ul className="grid divide-y divide-border/60">
            {recent.map((e) => {
              const s = svc(e.serviceId)
              const c = e.clientId ? data.clients.find((x) => x.id === e.clientId) : undefined
              return (
                <li key={e.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{s?.name || "Service"}{unitOf(s) !== "each" || e.qty !== 1 ? ` · ${qtyText(e.qty, unitOf(s))}` : ""}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{fmtDate(e.date)}{c ? ` · ${c.name}` : ""}{e.invoiced ? " · invoiced" : ""}</span>
                  </span>
                  <span className="num whitespace-nowrap text-[14px] font-medium">{money(entryAmt(e))}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">Nothing logged yet. <button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => go("log")}>Add your first entry</button></p>
        )}
      </Panel>
    </div>
  )
}
