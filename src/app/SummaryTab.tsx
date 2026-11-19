import { useState } from "react"
import { Button } from "@/components/ui/button"
import { draftInvoice, entryAmt, inRange, money, plural, rangeLabel, type Range, type RangeMode } from "@/lib/model"
import { useApp } from "./ctx"
import { Callout, Chips, Empty, Eyebrow, Field, Panel } from "./bits"

export function SummaryTab() {
  const { data, commit, ask, go, viewInvoice, session } = useApp()
  const [range, setRange] = useState<Range>({ mode: "month", from: "", to: "" })

  const filtered = data.entries.filter((e) => inRange(range, e.date))
  const pend = filtered.filter((e) => !e.invoiced)
  const total = filtered.reduce((s, e) => s + entryAmt(e), 0)
  const pendTotal = pend.reduce((s, e) => s + entryAmt(e), 0)
  const count = filtered.reduce((s, e) => s + (Number(e.qty) || 0), 0)

  const by: Record<string, { qty: number; amt: number }> = {}
  for (const e of filtered) {
    const k = data.services.find((s) => s.id === e.serviceId)?.name ?? "—"
    by[k] ??= { qty: 0, amt: 0 }
    by[k].qty += Number(e.qty) || 0
    by[k].amt += entryAmt(e)
  }
  const rows = Object.entries(by).sort((a, b) => b[1].amt - a[1].amt)
  const max = rows[0]?.[1].amt || 1
  const p = data.profile
  const missing = [!p.fullName && "your name", !p.billToName && "who to invoice", !(p.sortCode && p.accountNumber) && "bank details"].filter(Boolean)

  async function create() {
    const inv = draftInvoice(data, range, data.profile.fullName || session.email)
    if (!inv) return
    const ok = await ask({
      title: "Create invoice",
      message: `Create ${inv.number} for ${money(inv.total)}${inv.to.name ? " to " + inv.to.name : ""}?\n\n${plural(inv.entryIds.length, "entry", "entries")} will be marked as invoiced.`,
      ok: "Create invoice",
    })
    if (!ok) return
    commit((d) => {
      d.invoices.push(inv)
      d.profile.nextNo = (Number(d.profile.nextNo) || 1) + 1
      const ids = new Set(inv.entryIds)
      for (const e of d.entries) if (ids.has(e.id)) Object.assign(e, { invoiced: true, invoiceId: inv.id })
    }, `Invoice ${inv.number} saved ✓`)
    viewInvoice(inv.id, true)
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <Chips<RangeMode>
          label="Period"
          value={range.mode}
          onChange={(mode) => setRange({ ...range, mode })}
          options={[["month", "This month"], ["last", "Last month"], ["all", "All time"], ["custom", "Custom…"]]}
        />
        {range.mode === "custom" && (
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            <Field id="r-from" label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <Field id="r-to" label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
        )}
      </Panel>

      <Panel>
        <Eyebrow className="mb-1.5">{rangeLabel(range)}</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-[14px] bg-header p-5 text-header-fg">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-header-muted">Ready to invoice</div>
            <div className="num font-display text-[34px] font-bold leading-none tracking-[-0.02em]">{money(pendTotal)}</div>
          </div>
          <div className="num text-right text-[12.5px] text-header-muted">
            {money(total)} logged in total
            <br />
            {plural(count, "service")} · {plural(filtered.length, "entry", "entries")}
          </div>
        </div>

        {rows.length ? (
          <ul className="mt-3 divide-y">
            {rows.map(([name, v]) => (
              <li key={name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{name}</div>
                  <div className="num text-[12.5px] text-muted-foreground">{v.qty} logged</div>
                </div>
                <div className="num font-bold">{money(v.amt)}</div>
                <div className="col-span-2 mt-1.5 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(3, (v.amt / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No services in this period">Log services on the Log tab, or pick another period.</Empty>
        )}

        {filtered.length > 0 && (
          <div className="mt-3 grid gap-3">
            {filtered.length > pend.length && (
              <p className="text-[12.5px] text-muted-foreground">
                {plural(filtered.length - pend.length, "entry", "entries")} in this period {filtered.length - pend.length === 1 ? "is" : "are"} already on an invoice and won’t be added again.
              </p>
            )}
            {missing.length > 0 && (
              <Callout>
                <span>Your invoice is missing {missing.join(", ")}.</span>
                <Button size="sm" variant="outline" onClick={() => go("account")}>Add details</Button>
              </Callout>
            )}
            <div className="flex flex-wrap gap-2">
              <Button className="h-10 px-5" disabled={!pend.length} onClick={create}>
                Create invoice{pend.length ? ` · ${money(pendTotal)}` : ""}
              </Button>
              <Button variant="outline" className="h-10" onClick={() => go("invoices")}>Saved invoices</Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
