import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { daysBetween, daysToPay, fmtDate, followUpsDue, insights, invStatus, isoOf, money, monthLabel, monthly, nextFollowUp, plural, taxYear, today, type Invoice, type Profile, type Status } from "@/lib/model"
import { MonthlyBars } from "./charts"
import { useApp } from "./ctx"
import { Callout, Chips, Empty, Ledger, Panel, Pill } from "./bits"
import { markPaid } from "./dialogs"

type Filter = "all" | "unpaid" | "overdue" | "paid"
type Sort = "issued-desc" | "issued-asc" | "due"
const LABEL: Record<Status, string> = { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue" }

export function InvoicesTab() {
  const { data, commit, ask, go, viewInvoice, email, showFollowUps, openClient } = useApp()
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("issued-desc")

  const all = data.invoices.map((i) => ({ i, s: invStatus(i) }))
  const pick = (f: (x: { s: Status }) => boolean) => all.filter(f)
  const sum = (xs: { i: Invoice }[]) => xs.reduce((a, x) => a + (Number(x.i.total) || 0), 0)
  const out = pick((x) => x.s !== "paid"), od = pick((x) => x.s === "overdue"), paid = pick((x) => x.s === "paid")
  const due = followUpsDue(data)
  const ty = taxYear()
  const paidThisYear = sum(paid.filter((x) => x.i.paidDate && x.i.paidDate >= ty.from && x.i.paidDate <= ty.to))
  const paidDays = data.invoices.map(daysToPay).filter((x): x is number => x !== null)
  const avgDays = paidDays.length ? Math.round(paidDays.reduce((a, b) => a + b, 0) / paidDays.length) : null
  const notes = insights(data)
  const series = monthly(data, 6)
  const owedMap: Record<string, { key: string; clientId?: string; name: string; amount: number; overdue: number; count: number; oldest: string }> = {}
  for (const { i, s } of out) {
    const key = i.clientId || "name:" + (i.to.name || "—")
    const c = i.clientId ? data.clients.find((x) => x.id === i.clientId) : undefined
    const o = (owedMap[key] ??= { key, clientId: c?.id, name: c?.name || i.to.name || "No pharmacy", amount: 0, overdue: 0, count: 0, oldest: i.due })
    o.amount += i.total
    o.count++
    if (s === "overdue") o.overdue += i.total
    if (i.due < o.oldest) o.oldest = i.due
  }
  const owedBy = Object.values(owedMap).sort((a, b) => b.amount - a.amount)

  const rows = all
    .filter((x) => filter === "all" || (filter === "unpaid" ? x.s !== "paid" : x.s === filter))
    .sort((a, b) =>
      sort === "due" ? a.i.due.localeCompare(b.i.due)
      : sort === "issued-asc" ? a.i.issued.localeCompare(b.i.issued) || a.i.number.localeCompare(b.i.number)
      : b.i.issued.localeCompare(a.i.issued) || b.i.number.localeCompare(a.i.number),
    )
  const groups: { key: string; items: typeof rows }[] = []
  for (const r of rows) {
    const key = (sort === "due" ? r.i.due : r.i.issued).slice(0, 7)
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] })
    groups.at(-1)!.items.push(r)
  }

  async function remove(i: Invoice) {
    const ok = await ask({ title: "Delete invoice", message: `Delete ${i.number}? Its entries go back to “not invoiced” so you can invoice them again.`, ok: "Delete", danger: true })
    if (!ok) return
    commit((d) => {
      d.invoices = d.invoices.filter((x) => x.id !== i.id)
      for (const e of d.entries) if (e.invoiceId === i.id) { e.invoiced = false; delete e.invoiceId }
    }, `${i.number} deleted`)
  }

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[20px] font-medium">Invoices</h2>
        <Button onClick={() => go("summary")}><Plus /> Create invoice</Button>
      </div>
      <Ledger
        cells={[
          { label: "Owed to you", value: money(sum(out)), sub: out.length ? plural(out.length, "unpaid invoice") : "Nothing outstanding" },
          { label: "Overdue", value: money(sum(od)), sub: od.length ? plural(od.length, "invoice") : "None", alert: od.length > 0 },
          { label: "Paid this tax year", value: money(paidThisYear), sub: `${ty.label} · from 6 April` },
          { label: "Average time to pay", value: avgDays === null ? "—" : plural(avgDays, "day"), sub: avgDays === null ? "Shows once invoices are paid" : "From invoice to payment" },
        ]}
      />

      {due.length > 0 && (
        <Callout tone="danger">
          <span><b>{due.length === 1 ? "1 follow-up due" : `${due.length} follow-ups due`}</b> · {money(due.reduce((a, i) => a + i.total, 0))} unpaid past its follow-up date</span>
          <Button size="sm" variant="outline" className="border-destructive/40 bg-card text-danger-ink hover:text-danger-ink" onClick={showFollowUps}>Send follow-ups</Button>
        </Callout>
      )}

      {notes.length > 0 && (
        <Panel title="What stands out">
          <ul className="grid gap-2.5">
            {notes.map((n, k) => (
              <li key={k} className="flex items-start gap-3 text-[13.5px] leading-snug">
                <span className={cn("mt-[6px] size-2 flex-none rounded-full", n.tone === "danger" ? "bg-destructive" : n.tone === "warn" ? "bg-warn" : n.tone === "good" ? "bg-[var(--series-paid)]" : "bg-muted-foreground/50")} aria-hidden />
                <span className="min-w-0 flex-1">
                  {n.text}{" "}
                  {n.action && (
                    <button type="button" className="whitespace-nowrap font-semibold text-brand-ink hover:underline"
                      onClick={() => (n.action === "followups" ? showFollowUps() : go(n.action === "summary" ? "summary" : "clients"))}>
                      {n.action === "followups" ? "Follow up" : n.action === "summary" ? "Create invoice" : "See pharmacies"} →
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Last six months">
        <MonthlyBars points={series} />
      </Panel>

      {owedBy.length > 0 && (
        <Panel title="Owed to you, by pharmacy">
          <ul className="divide-y">
            {owedBy.map((o) => (
              <li key={o.key}>
                <button type="button" disabled={!o.clientId} onClick={() => o.clientId && openClient(o.clientId)}
                  className="flex w-full items-center gap-3 py-2.5 text-left enabled:hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{o.name}</span>
                    <span className="text-[12.5px] text-muted-foreground">{plural(o.count, "invoice")} · oldest due {fmtDate(o.oldest)}{o.overdue > 0 && <> · <span className="font-semibold text-danger-ink">{money(o.overdue)} overdue</span></>}</span>
                  </span>
                  <span className="num text-[14.5px] font-bold">{money(o.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="All invoices" aside={
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger aria-label="Sort invoices" className="h-8 w-auto gap-2 bg-field text-[13px] shadow-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="issued-desc">Newest first</SelectItem>
            <SelectItem value="issued-asc">Oldest first</SelectItem>
            <SelectItem value="due">By due date</SelectItem>
          </SelectContent>
        </Select>
      }>
        {data.invoices.length > 0 && <div className="mb-3"><Chips<Filter> label="Show" value={filter} onChange={setFilter} options={[["all", "All"], ["unpaid", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"]]} /></div>}
        {!data.invoices.length ? (
          <Empty title="No invoices yet">
            Use <b className="font-medium text-foreground">Create invoice</b> to turn the work you’ve logged into an invoice. It’ll be saved here.
          </Empty>
        ) : !rows.length ? (
          <Empty title={`No ${filter} invoices`} />
        ) : (
          <div className="grid gap-1">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground first:pt-0">
                  {sort === "due" ? "Due " : ""}{monthLabel(g.key)}
                </p>
                <ul className="divide-y">
                  {g.items.map(({ i, s }) => <Row key={i.id} i={i} s={s} p={data.profile} onView={() => viewInvoice(i.id)} onEmail={(k) => email(i.id, k)} onDelete={() => remove(i)} onPaid={(p) => markPaid(commit, i.id, p)} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function Row({ i, s, p, onView, onEmail, onDelete, onPaid }: { i: Invoice; s: Status; p: Profile; onView: () => void; onEmail: (k: "invoice" | "followup") => void; onDelete: () => void; onPaid: (p: boolean) => void }) {
  const next = nextFollowUp(i, p)
  const followDue = next !== null && today() >= next
  const dTo = daysBetween(today(), i.due)
  const last = i.reminders[i.reminders.length - 1]
  const when =
    s === "paid" ? <>paid {fmtDate(i.paidDate)}</>
    : s === "overdue" ? <span className="font-semibold text-danger-ink">{plural(-dTo, "day")} overdue</span>
    : dTo === 0 ? <>due today</> : <>due in {plural(dTo, "day")}</>
  const dot = s === "paid" ? "bg-primary" : s === "overdue" ? "bg-destructive" : "bg-warn"
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={cn("mt-[7px] size-2 flex-none rounded-full", dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[14.5px] font-semibold">{i.number}</span>
          <Pill tone={s}>{LABEL[s]}</Pill>
        </div>
        <div className="num text-[12.5px] text-muted-foreground">Issued {fmtDate(i.issued)} · Due {fmtDate(i.due)} · {when}</div>
        <div className="text-[12.5px] text-muted-foreground">{i.to.name || "No recipient"} · {i.period}</div>
        <div className="text-[12.5px] text-muted-foreground">
          {i.sentAt ? <>Emailed {fmtDate(isoOf(new Date(i.sentAt)))}</> : i.sentVia === "admin" ? <>Queued to send</> : <span className="font-semibold text-warn">Not emailed yet</span>}
          {last && <> · {plural(i.reminders.length, "follow-up")}, last {fmtDate(isoOf(new Date(last)))}</>}
          {s !== "paid" && next && (followDue ? <> · <span className="font-semibold text-danger-ink">follow-up due</span></> : <> · next follow-up {fmtDate(next)}</>)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-brand-ink" onClick={onView}>View</Button>
          {s !== "paid" && !i.sentAt && i.sentVia !== "admin" && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-semibold text-brand-ink" onClick={() => onEmail("invoice")}>Email invoice</Button>}
          {s !== "paid" && (i.sentAt || i.sentVia === "admin" || s === "overdue") && <Button variant="ghost" size="sm" className={cn("h-7 px-2 text-xs text-brand-ink", followDue && "font-semibold")} onClick={() => onEmail("followup")}>Send follow-up</Button>}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-danger-ink" onClick={onDelete}>Delete</Button>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="num whitespace-nowrap text-[14.5px] font-bold">{money(i.total)}</span>
        <div role="group" aria-label={`Payment status for ${i.number}`} className="inline-flex rounded-full border bg-secondary p-0.5">
          <button
            type="button"
            aria-pressed={s !== "paid"}
            onClick={() => s === "paid" && onPaid(false)}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              s === "overdue" && "bg-destructive text-destructive-foreground", s === "unpaid" && "bg-card text-warn shadow-sm")}
          >
            Unpaid
          </button>
          <button
            type="button"
            aria-pressed={s === "paid"}
            onClick={() => s !== "paid" && onPaid(true)}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              s === "paid" && "bg-primary text-primary-foreground")}
          >
            Paid
          </button>
        </div>
      </div>
    </li>
  )
}
