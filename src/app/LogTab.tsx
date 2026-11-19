import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { entryAmt, fmtDate, money, today, uid, type Data, type Entry } from "@/lib/model"
import { useApp } from "./ctx"
import { Empty, Field, MoneyField, Panel, Pill } from "./bits"

const hoursService = (d: Data) => d.services.find((s) => /hour/i.test(s.name))

export function LogTab() {
  const { data, commit, ask } = useApp()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = editingId ? data.entries.find((e) => e.id === editingId) : undefined

  const blank = () => ({ serviceId: data.services[0]?.id || "", date: today(), qty: "1", fee: String(data.services[0]?.fee ?? 0), desc: "" })
  const [form, setForm] = useState(blank)
  useEffect(() => {
    if (editing) setForm({ serviceId: editing.serviceId, date: editing.date, qty: String(editing.qty), fee: String(editing.fee), desc: editing.desc || "" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  function pickService(id: string) {
    const s = data.services.find((x) => x.id === id)
    setForm((f) => ({ ...f, serviceId: id, fee: !editing && s ? String(s.fee) : f.fee }))
  }
  function saveEntry() {
    if (!form.serviceId) return toast("Add a service type first, on the Services tab.")
    const vals = {
      serviceId: form.serviceId,
      date: form.date || today(),
      qty: Math.max(1, parseInt(form.qty) || 1),
      fee: Math.max(0, parseFloat(form.fee) || 0),
      desc: form.desc.trim(),
    }
    if (editing) {
      commit((d) => Object.assign(d.entries.find((e) => e.id === editing.id)!, vals), "Entry updated")
      setEditingId(null)
    } else {
      commit((d) => void d.entries.push({ id: uid(), ...vals, invoiced: false }), "Added ✓")
    }
    setForm((f) => ({ ...blank(), serviceId: f.serviceId, fee: editing ? blank().fee : f.fee }))
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
        if (!svc) d.services.push((svc = { id: uid(), name: "Hours Worked (£25/hr)", fee: 25 }))
        const ex = d.entries.find((e) => e.hours && e.date === hDate)
        if (ex) Object.assign(ex, { qty: h, fee: svc.fee, serviceId: svc.id })
        else d.entries.push({ id: uid(), serviceId: svc.id, date: hDate, qty: h, fee: svc.fee, desc: "", invoiced: false, hours: true })
      }, "Hours saved ✓")
    } else if (existingHours) {
      commit((d) => void (d.entries = d.entries.filter((e) => e.id !== existingHours.id)), "Hours cleared for that day")
    } else toast("Enter the hours first.")
  }

  const list = useMemo(() => [...data.entries].sort((a, b) => b.date.localeCompare(a.date)), [data.entries])
  async function remove(e: Entry) {
    if (e.invoiced && !(await ask({ title: "Delete invoiced entry?", message: "This entry is on an invoice. The saved invoice won’t change.", ok: "Delete", danger: true }))) return
    commit((d) => void (d.entries = d.entries.filter((x) => x.id !== e.id)), "Entry deleted")
    if (editingId === e.id) setEditingId(null)
  }

  return (
    <div className="grid gap-4">
      <Panel title={editing ? "Edit entry" : "Add a service"}>
        <form
          className="grid gap-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            saveEntry()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.7fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="f-svc" className="text-xs font-semibold text-muted-foreground">Service</Label>
              <Select value={form.serviceId} onValueChange={pickService}>
                <SelectTrigger id="f-svc" className="h-10 bg-field text-[14.5px] shadow-none"><SelectValue placeholder="Choose a service" /></SelectTrigger>
                <SelectContent>
                  {data.services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field id="f-date" label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Field id="f-qty" label="Quantity" type="number" min={1} step={1} inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[0.8fr_2fr]">
            <MoneyField id="f-fee" label="Fee each" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            <Field id="f-desc" label="Description" hint="(optional)" placeholder="e.g. UTI consultation, patient initials…" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" className="h-10 px-5">{editing ? "Save changes" : "Add entry"}</Button>
            {editing && <Button type="button" variant="outline" className="h-10" onClick={() => { setEditingId(null); setForm(blank()) }}>Cancel</Button>}
            {!editing && form.qty && form.fee && (
              <span className="num ml-auto text-sm text-muted-foreground">= {money((parseInt(form.qty) || 0) * (parseFloat(form.fee) || 0))}</span>
            )}
          </div>
        </form>
      </Panel>

      <Panel title="Hours worked" aside={`£${hs?.fee ?? 25}/hr`}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); saveHours() }}>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field id="h-date" label="Date" type="date" value={hDate} onChange={(e) => setHDate(e.target.value || today())} />
            <Field id="h-hours" label="Hours that day" type="number" min={0} step="0.25" inputMode="decimal" placeholder="e.g. 7.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            <Button type="submit" className="h-10 px-5">{existingHours ? "Update hours" : "Save hours"}</Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">Saving again for the same day replaces that day’s hours. Change the hourly rate on the Services tab.</p>
        </form>
      </Panel>

      <Panel title="Recent entries" aside={list.length ? `${list.length} total` : undefined}>
        {!list.length ? (
          <Empty title="Nothing logged yet">Add your first service above and it’ll appear here.</Empty>
        ) : (
          <ul className="divide-y">
            {list.slice(0, 40).map((e) => {
              const s = data.services.find((x) => x.id === e.serviceId)
              const inv = e.invoiceId ? data.invoices.find((i) => i.id === e.invoiceId) : undefined
              return (
                <li key={e.id} className="flex items-start gap-3 py-3">
                  <span className="mt-[7px] size-2 flex-none rounded-full bg-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[14.5px] font-semibold">{s?.name ?? "—"}</span>
                      <span className="num text-[12.5px] text-muted-foreground">{fmtDate(e.date)} · {e.qty} × {money(e.fee)}</span>
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
