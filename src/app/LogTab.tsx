import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { entryAmt, feeText, fmtDate, money, qtyText, today, uid, unitOf, UNITS, type Data, type Entry } from "@/lib/model"
import { useApp } from "./ctx"
import { Empty, Field, MoneyField, Panel, Pill } from "./bits"
import { JourneyForm } from "./JourneyForm"
import { cn } from "@/lib/utils"

const hoursService = (d: Data) => d.services.find((s) => /hour/i.test(s.name))

export function LogTab() {
  const { data, commit, ask, logMode } = useApp()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mode, setMode] = useState<"service" | "hours" | "journey">(logMode)
  const editing = editingId ? data.entries.find((e) => e.id === editingId) : undefined

  const lastClient = (data.meta.lastClientId as string | undefined) ?? ""
  const defaultClient = data.clients.some((c) => c.id === lastClient) ? lastClient : data.clients.length === 1 ? data.clients[0].id : ""
  const blank = () => ({ serviceId: data.services[0]?.id || "", date: today(), qty: "1", fee: String(data.services[0]?.fee ?? 0), desc: "", clientId: defaultClient })
  const [form, setForm] = useState(blank)
  const unit = unitOf(data.services.find((s) => s.id === form.serviceId))
  const qtyLabel = UNITS.find((u) => u[0] === unit)?.[2] ?? "Quantity"
  const parseQty = (v: string) => (unit === "each" ? Math.max(1, parseInt(v) || 1) : Math.max(0, Math.round((parseFloat(v) || 0) * 100) / 100))
  useEffect(() => {
    if (editing) setForm({ serviceId: editing.serviceId, date: editing.date, qty: String(editing.qty), fee: String(editing.fee), desc: editing.desc || "", clientId: editing.clientId ?? "" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  function pickService(id: string) {
    const s = data.services.find((x) => x.id === id)
    setForm((f) => ({ ...f, serviceId: id, fee: !editing && s ? String(s.fee) : f.fee }))
  }
  function saveEntry() {
    if (!form.serviceId) return toast("Add a service type first, on the Services tab.")
    const qty = parseQty(form.qty)
    if (!qty) return toast(`Enter the ${qtyLabel.toLowerCase()} first.`)
    const vals = {
      serviceId: form.serviceId,
      date: form.date || today(),
      qty,
      fee: Math.max(0, parseFloat(form.fee) || 0),
      desc: form.desc.trim(),
      clientId: form.clientId || undefined,
    }
    if (editing) {
      commit((d) => {
        const e = d.entries.find((x) => x.id === editing.id)!
        Object.assign(e, vals)
        if (!vals.clientId) delete e.clientId
      }, "Entry updated")
      setEditingId(null)
    } else {
      commit((d) => {
        d.entries.push({ id: uid(), ...vals, invoiced: false })
        if (vals.clientId) d.meta.lastClientId = vals.clientId
      }, "Added ✓")
    }
    setForm((f) => ({ ...blank(), serviceId: f.serviceId, fee: editing ? blank().fee : f.fee, clientId: f.clientId }))
  }

  /* hours */
  const hs = hoursService(data)
  const [hDate, setHDate] = useState(today())
  const existingHours = data.entries.find((e) => e.hours && e.date === hDate)
  const [hours, setHours] = useState("")
  useEffect(() => setHours(existingHours ? String(existingHours.qty) : ""), [hDate, existingHours?.qty])
  async function saveHours() {
    const h = parseFloat(hours)
    if (existingHours?.invoiced && !(await ask({ title: "Change invoiced hours?", message: "Hours for this day are already on an invoice. The saved invoice won’t change.", ok: "Change hours" }))) return
    if (h > 0) {
      commit((d) => {
        let svc = hoursService(d)
        if (!svc) d.services.push((svc = { id: uid(), name: "Hours Worked (£25/hr)", fee: 25, unit: "hour" }))
        const ex = d.entries.find((e) => e.hours && e.date === hDate)
        if (ex) Object.assign(ex, { qty: h, fee: svc.fee, serviceId: svc.id, ...(form.clientId ? { clientId: form.clientId } : {}) })
        else d.entries.push({ id: uid(), serviceId: svc.id, date: hDate, qty: h, fee: svc.fee, desc: "", invoiced: false, hours: true, ...(form.clientId ? { clientId: form.clientId } : {}) })
      }, "Hours saved ✓")
    } else if (existingHours) {
      commit((d) => void (d.entries = d.entries.filter((e) => e.id !== existingHours.id)), "Hours cleared for that day", { undo: true })
    } else toast("Enter the hours first.")
  }

  const list = useMemo(() => [...data.entries].sort((a, b) => b.date.localeCompare(a.date)), [data.entries])
  async function remove(e: Entry) {
    if (e.invoiced && !(await ask({ title: "Delete invoiced entry?", message: "This entry is on an invoice. The saved invoice won’t change.", ok: "Delete", danger: true }))) return
    commit((d) => void (d.entries = d.entries.filter((x) => x.id !== e.id)), "Entry deleted", { undo: true })
    if (editingId === e.id) setEditingId(null)
  }

  const pharmacyPicker = data.clients.length > 0 && (
    <div className="grid gap-1.5 sm:max-w-sm">
      <Label htmlFor="f-client" className="text-[12.5px] font-normal text-muted-foreground">Pharmacy</Label>
      <Select value={form.clientId || "none"} onValueChange={(v) => setForm({ ...form, clientId: v === "none" ? "" : v })}>
        <SelectTrigger id="f-client" className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          <SelectItem value="none">Not for a particular pharmacy</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="grid gap-5 sm:gap-6">
      <Panel title={editing ? "Edit entry" : "Add to your log"} aside={!editing && (
        <div role="tablist" aria-label="What to add" className="flex rounded-full bg-secondary p-1">
          {([["service", "Service"], ["hours", "Hours"], ["journey", "Journey"]] as const).map(([k, l]) => (
            <button key={k} role="tab" type="button" aria-selected={mode === k} onClick={() => setMode(k)}
              className={cn("rounded-full px-4 py-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === k && "bg-background text-foreground")}>
              {l}
            </button>
          ))}
        </div>
      )}>
        {mode === "journey" && !editing ? <JourneyForm /> : mode === "hours" && !editing ? (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); saveHours() }}>
          {pharmacyPicker}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field id="h-date" label="Date" type="date" value={hDate} onChange={(e) => setHDate(e.target.value || today())} />
            <Field id="h-hours" label="Hours that day" type="number" min={0} step="0.25" inputMode="decimal" placeholder="e.g. 7.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            <Button type="submit" className="h-11 px-6">{existingHours ? "Update hours" : "Save hours"}</Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">At £{hs?.fee ?? 25}/hr{form.clientId ? ` for ${data.clients.find((c) => c.id === form.clientId)?.name ?? "the selected pharmacy"}` : ""}. Saving again for the same day replaces that day’s hours. Change the rate under Settings → Services.</p>
        </form>
        ) : (
        <form
          className="grid gap-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            saveEntry()
          }}
        >
          {pharmacyPicker}
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.7fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="f-svc" className="text-[12.5px] font-normal text-muted-foreground">Service</Label>
              <Select value={form.serviceId} onValueChange={pickService}>
                <SelectTrigger id="f-svc" className="h-11 bg-field text-[15px]"><SelectValue placeholder="Choose a service" /></SelectTrigger>
                <SelectContent>
                  {data.services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field id="f-date" label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Field id="f-qty" label={qtyLabel} type="number" min={unit === "each" ? 1 : 0} step={unit === "each" ? 1 : "0.1"} inputMode={unit === "each" ? "numeric" : "decimal"} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[0.8fr_2fr]">
            <MoneyField id="f-fee" label={unit === "mile" ? "Rate per mile" : unit === "hour" ? "Rate per hour" : "Fee each"} value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            <Field id="f-desc" label="Description" hint="(optional)" placeholder="e.g. UTI consultation, patient initials…" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" className="h-11 px-6">{editing ? "Save changes" : "Add entry"}</Button>
            {editing && <Button type="button" variant="outline" className="h-11" onClick={() => { setEditingId(null); setForm(blank()) }}>Cancel</Button>}
            {!editing && form.qty && form.fee && (
              <span className="num ml-auto text-sm text-muted-foreground">= {money(parseQty(form.qty) * (parseFloat(form.fee) || 0))}</span>
            )}
          </div>
        </form>
        )}
      </Panel>

      <Panel title="Recent entries" aside={list.length ? `${list.length} total` : undefined}>
        {!list.length ? (
          <Empty title="Nothing logged yet">Add your first service above and it’ll appear here.</Empty>
        ) : (
          <ul className="divide-y">
            {list.slice(0, 40).map((e) => {
              const s = data.services.find((x) => x.id === e.serviceId)
              const inv = e.invoiceId ? data.invoices.find((i) => i.id === e.invoiceId) : undefined
              const cl = e.clientId ? data.clients.find((c) => c.id === e.clientId) : undefined
              const u = unitOf(s)
              return (
                <li key={e.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[14.5px] font-semibold">{s?.name ?? "—"}</span>
                      <span className="num text-[12.5px] text-muted-foreground">{fmtDate(e.date)} · {u === "each" ? `${e.qty} × ${money(e.fee)}` : `${qtyText(e.qty, u)} at ${feeText(e.fee, u)}`}{cl ? ` · ${cl.name}` : ""}</span>
                      <Pill tone={e.invoiced ? "done" : "pending"}>{e.invoiced ? inv?.number ?? "Invoiced" : "Not invoiced"}</Pill>
                    </div>
                    {e.desc && <p className="mt-0.5 break-words text-[13px] text-muted-foreground">{e.desc}</p>}
                    <div className="mt-1 flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { setEditingId(e.id); window.scrollTo({ top: 0, behavior: "smooth" }) }}>Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-danger-ink" onClick={() => remove(e)}>Delete</Button>
                    </div>
                  </div>
                  <span className="num whitespace-nowrap text-[14.5px] font-bold">{money(entryAmt(e))}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
