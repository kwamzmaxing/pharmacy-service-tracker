// "What to do next" on Home: the actions that get people paid sooner, most urgent first.
// Everything here is worked out from their own log, invoices and pharmacies.
import type { ReactNode } from "react"
import { AlarmClock, CalendarClock, FilePlus2, Hourglass, Send, TriangleAlert } from "lucide-react"
import { dueSoon, expectedPayment, readyToInvoice, repeatLatePayers } from "@/lib/finance"
import { REMINDER_STAGE, daysBetween, fmtDate, followUpsDue, money, plural, reminderStage, today } from "@/lib/model"
import { cn } from "@/lib/utils"
import { useApp } from "./ctx"
import { Panel } from "./bits"
import { useCreateInvoice } from "./useCreateInvoice"

export type Extra = { tone: "danger" | "warn" | "info"; text: string; cta: string; act: () => void }

function Group({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: "danger" | "warn" | "info"; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        <span className={cn("flex size-6 items-center justify-center rounded-full [&_svg]:size-[13px]", tone === "danger" ? "bg-danger-tint text-danger-ink" : tone === "warn" ? "bg-warn/15 text-warn" : "bg-primary/15 text-brand-ink")} aria-hidden>{icon}</span>
        {title}
      </h3>
      <ul className="grid divide-y divide-border/60">{children}</ul>
    </section>
  )
}
function Item({ main, sub, amount, cta, onClick, strong }: { main: ReactNode; sub?: ReactNode; amount?: number; cta: string; onClick: () => void; strong?: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <span className="min-w-0 flex-1 text-[14px] leading-snug">
        {main}
        {sub && <span className="block text-[12.5px] text-muted-foreground">{sub}</span>}
      </span>
      <span className="flex items-center gap-3">
        {amount !== undefined && <span className="num text-[14px] font-medium">{money(amount)}</span>}
        <button type="button" onClick={onClick}
          className={cn("whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", strong ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary hover:bg-secondary/70")}>
          {cta}
        </button>
      </span>
    </li>
  )
}

export function NextSteps({ extras }: { extras: Extra[] }) {
  const { data, go, email, viewInvoice, openClient, showFollowUps } = useApp()
  const createInvoice = useCreateInvoice()
  const t = today()
  const ready = readyToInvoice(data, t)
  const overdue = data.invoices.filter((i) => i.status !== "paid" && i.due < t).sort((a, b) => a.due.localeCompare(b.due))
  const soon = dueSoon(data, t, 7)
  const late = repeatLatePayers(data, t)
  const lateIds = new Set(late.map((r) => r.clientId))
  const followDue = followUpsDue(data)
  const show = 4

  const empty = !ready.length && !overdue.length && !soon.length && !late.length && !extras.length
  return (
    <Panel title="What to do next" aside="The quickest way to get paid">
      {empty ? (
        <p className="text-[14px] text-muted-foreground">You’re all caught up: all your work is invoiced and nothing is overdue.</p>
      ) : (
        <div className="grid gap-6">
          {overdue.length > 0 && (
            <Group icon={<TriangleAlert />} title={`Payments overdue · ${money(overdue.reduce((a, i) => a + i.total, 0))}`} tone="danger">
              {overdue.slice(0, show).map((i) => {
                const stage = reminderStage(i, t)
                return (
                  <Item key={i.id} amount={i.total} strong={stage > 1}
                    main={<>{i.number} · {i.to.name || "Pharmacy"} · <span className="font-medium text-danger-ink">{plural(daysBetween(i.due, t), "day")} overdue</span></>}
                    sub={<>{i.reminders.length ? `${plural(i.reminders.length, "reminder")} sent, last ${fmtDate(i.reminders[i.reminders.length - 1].slice(0, 10))}` : "No reminder sent yet"} · next: {REMINDER_STAGE[stage].toLowerCase()}{i.clientId && lateIds.has(i.clientId) ? " · often pays late" : ""}</>}
                    cta={`Send ${REMINDER_STAGE[stage].toLowerCase()}`} onClick={() => email(i.id, "followup")} />
                )
              })}
              {overdue.length > show && <Item main={<>{plural(overdue.length - show, "more overdue invoice")}</>} cta="See all" onClick={() => (followDue.length ? showFollowUps() : go("invoices"))} />}
            </Group>
          )}

          {ready.length > 0 && (
            <Group icon={<FilePlus2 />} title={`Work done, not invoiced · ${money(ready.reduce((a, g) => a + g.total, 0))}`} tone="warn">
              {ready.slice(0, show).map((g) => (
                <Item key={g.key} amount={g.total} strong={!!g.clientId}
                  main={<>{g.name} · {g.period}</>}
                  sub={<>{plural(g.count, "entry", "entries")} · oldest {fmtDate(g.oldest)} ({plural(daysBetween(g.oldest, t), "day")} ago){g.clientId && lateIds.has(g.clientId) ? " · often pays late, so invoice promptly" : ""}</>}
                  cta={g.clientId ? "Create invoice" : "Link to a pharmacy"}
                  onClick={() => (g.clientId ? void createInvoice(g.clientId, { mode: "custom", from: g.from, to: g.to }, { strict: true, period: g.period }) : go("log"))} />
              ))}
              {ready.length > show && <Item main={<>{plural(ready.length - show, "more group")} ready to invoice</>} cta="Create invoice" onClick={() => go("summary")} />}
            </Group>
          )}

          {soon.length > 0 && (
            <Group icon={<CalendarClock />} title="Due in the next 7 days" tone="info">
              {soon.slice(0, show).map((i) => {
                const exp = expectedPayment(data, i), d = daysBetween(t, i.due)
                return (
                  <Item key={i.id} amount={i.total}
                    main={<>{i.number} · {i.to.name || "Pharmacy"} · due {d === 0 ? "today" : `in ${plural(d, "day")}`}</>}
                    sub={exp.basis === "history" ? <>Expected {fmtDate(exp.date)}: they usually pay {plural(exp.days!, "day")} after the invoice date</> : !i.sentAt && i.sentVia !== "admin" ? "Not emailed yet" : "Emailed"}
                    cta={!i.sentAt && i.sentVia !== "admin" ? "Email invoice" : "View"} onClick={() => (!i.sentAt && i.sentVia !== "admin" ? email(i.id, "invoice") : viewInvoice(i.id))} />
                )
              })}
            </Group>
          )}

          {late.length > 0 && (
            <Group icon={<Hourglass />} title="Pharmacies that often pay late" tone="warn">
              {late.slice(0, show).map((r) => (
                <Item key={r.clientId}
                  main={<>{r.name}</>}
                  sub={<>{r.paid ? `Paid ${r.paidLate} of ${plural(r.paid, "invoice")} late${r.avgDaysLate !== null ? `, by ${plural(r.avgDaysLate, "day")} on average` : ""}` : "No invoices paid yet"}{r.overdueNow ? ` · ${r.overdueNow} overdue now` : ""}</>}
                  cta="See pharmacy" onClick={() => openClient(r.clientId)} />
              ))}
            </Group>
          )}

          {extras.length > 0 && (
            <Group icon={<AlarmClock />} title="Also worth doing" tone="info">
              {extras.map((x, k) => <Item key={k} main={x.text} cta={x.cta} onClick={x.act} />)}
            </Group>
          )}
        </div>
      )}
      {!empty && <p className="mt-5 flex items-center gap-1.5 text-[12px] text-muted-foreground"><Send className="size-3" aria-hidden />Reminders get firmer as a payment gets later: friendly first, then a second reminder, then a firm request with a 7-day deadline. You check each one before it’s sent.</p>}
    </Panel>
  )
}
