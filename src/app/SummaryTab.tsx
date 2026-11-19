import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addCalendarEvent, hasToken } from "@/lib/google"
import { draftInvoice, entryAmt, inRange, money, pendingFor, plural, qtyText, rangeLabel, unitOf, type Range, type RangeMode, type Unit } from "@/lib/model"
import { useApp } from "./ctx"
import { Callout, Chips, Empty, Field, Panel } from "./bits"
import { ClientForm, newClient } from "./ClientsTab"

const NEW = "__new"

export function SummaryTab() {
  const { data, commit, ask, go, viewInvoice, me, google } = useApp()
  const [range, setRange] = useState<Range>({ mode: "month", from: "", to: "" })
  const remembered = data.meta.lastClientId as string | undefined
  const [clientId, setClientId] = useState<string>(
    remembered && data.clients.some((c) => c.id === remembered) ? remembered : data.clients[0]?.id ?? "",
  )
  const [adding, setAdding] = useState(!data.clients.length)
  const client = data.clients.find((c) => c.id === clientId)

  // Work for this pharmacy (and work not tagged to any pharmacy) in the chosen period
  const filtered = data.entries.filter((e) => inRange(range, e.date) && (!clientId || !e.clientId || e.clientId === clientId))
  const pend = pendingFor(data, range, clientId || undefined)
  const total = filtered.reduce((s, e) => s + entryAmt(e), 0)
  const pendTotal = pend.reduce((s, e) => s + entryAmt(e), 0)

  const by: Record<string, { qty: number; amt: number; unit: Unit }> = {}
  for (const e of filtered) {
    const s = data.services.find((x) => x.id === e.serviceId)
    const k = s?.name ?? "—"
    by[k] ??= { qty: 0, amt: 0, unit: unitOf(s) }
    by[k].qty += Number(e.qty) || 0
    by[k].amt += entryAmt(e)
  }
  const rows = Object.entries(by).sort((a, b) => b[1].amt - a[1].amt)
  const max = rows[0]?.[1].amt || 1
  const p = data.profile
  const missing = [!p.fullName && "your name", !(p.sortCode && p.accountNumber) && "your bank details"].filter(Boolean)

  async function create() {
    if (!client) return
    const inv = draftInvoice(data, range, p.fullName || me.name || me.email, client.id)
    if (!inv) return
    const ok = await ask({
      title: "Create invoice",
      message: `Create ${inv.number} for ${money(inv.total)} to ${client.name}?\n\n${plural(inv.entryIds.length, "entry", "entries")} will be marked as invoiced.`,
      ok: "Create invoice",
    })
    if (!ok) return
    commit((d) => {
      d.invoices.push(inv)
      d.profile.nextNo = (Number(d.profile.nextNo) || 1) + 1
      d.meta.lastClientId = client.id
      const ids = new Set(inv.entryIds)
      for (const e of d.entries) if (ids.has(e.id)) Object.assign(e, { invoiced: true, invoiceId: inv.id, clientId: client.id })
    }, `Invoice ${inv.number} saved ✓`)
    viewInvoice(inv.id, true)
    // Put the payment date in Google Calendar straight away when it's connected and Google already gave access this visit
    if (p.calendar && google.calendar === "ready" && hasToken("calendar")) {
      addCalendarEvent({ title: `Payment due: ${inv.number} · ${money(inv.total)}`, date: inv.due, details: `Expected payment for ${inv.number} from ${client.name}: ${money(inv.total)}.` }, me.email)
        .then(() => commit((d) => void (d.invoices.find((x) => x.id === inv.id)!.calendarAt = new Date().toISOString()), `Added ${inv.due.split("-").reverse().join("/")} to your Google Calendar ✓`))
        .catch(() => {})
    }
  }

  return (
    <div className="grid gap-4">
      <Panel title="Create an invoice">
        <div className="grid gap-4">
          <div className="grid gap-1.5 sm:max-w-sm">
            <Label htmlFor="s-client" className="text-xs font-semibold text-muted-foreground">Invoice to</Label>
            <Select value={adding ? NEW : clientId} onValueChange={(v) => { if (v === NEW) setAdding(true); else { setAdding(false); setClientId(v) } }}>
              <SelectTrigger id="s-client" className="h-10 bg-field text-[14.5px] shadow-none"><SelectValue placeholder="Choose a pharmacy" /></SelectTrigger>
              <SelectContent>
                {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                {data.clients.length > 0 && <SelectSeparator />}
                <SelectItem value={NEW}>Add a new pharmacy…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {adding && (
            <div className="rounded-lg border bg-field p-4">
              <p className="mb-3 text-[13px] text-muted-foreground">Saved to your Pharmacies, so you only enter these details once.</p>
              <ClientForm
                submit="Save and use"
                onCancel={data.clients.length ? () => setAdding(false) : undefined}
                onSave={(f) => {
                  let id = ""
                  commit((d) => { id = newClient(d, f); d.meta.lastClientId = id }, `${f.name.trim()} saved`)
                  setClientId(id)
                  setAdding(false)
                }}
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Period</span>
            <Chips<RangeMode>
              label="Period"
              value={range.mode}
              onChange={(mode) => setRange({ ...range, mode })}
              options={[["month", "This month"], ["last", "Last month"], ["all", "All time"], ["custom", "Custom…"]]}
            />
          </div>
          {range.mode === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="r-from" label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              <Field id="r-to" label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
          <div>
            <div className="text-[12.5px] font-medium text-muted-foreground">Ready to invoice{client ? ` to ${client.name}` : ""} · {rangeLabel(range)}</div>
            <div className="num mt-1 font-display text-[34px] font-bold leading-none tracking-[-0.025em]">{money(pendTotal)}</div>
          </div>
          <div className="num text-right text-[12.5px] text-muted-foreground">
            {money(total)} logged in this period
            <br />
            {plural(filtered.length, "entry", "entries")}
          </div>
        </div>

        {rows.length ? (
          <ul className="divide-y">
            {rows.map(([name, v]) => (
              <li key={name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{name}</div>
                  <div className="num text-[12.5px] text-muted-foreground">{qtyText(v.qty, v.unit)}{v.unit === "each" ? " logged" : ""}</div>
                </div>
                <div className="num font-bold">{money(v.amt)}</div>
                <div className="col-span-2 mt-1.5 h-[3px] overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.max(3, (v.amt / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Nothing logged in this period">Log work on the Log tab, or pick another period.</Empty>
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
                <span>Your invoice is missing {missing.join(" and ")}.</span>
                <Button size="sm" variant="outline" onClick={() => go("account")}>Add details</Button>
              </Callout>
            )}
            <div className="flex flex-wrap gap-2">
              <Button className="h-10 px-5" disabled={!pend.length || !client} onClick={create}>
                Create invoice{pend.length ? ` · ${money(pendTotal)}` : ""}
              </Button>
              {!client && <span className="self-center text-[12.5px] text-muted-foreground">Choose who to invoice first.</span>}
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
