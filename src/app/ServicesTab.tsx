import { useState } from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STD_SERVICES, uid, unitOf, UNITS, type Unit } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useApp } from "./ctx"
import { Empty, Field, MoneyField, Panel } from "./bits"

export function ServicesTab() {
  const { data, commit, ask } = useApp()
  const [name, setName] = useState("")
  const [fee, setFee] = useState("")
  const [unit, setUnit] = useState<Unit>("each")

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast("Give the service a name.")
    commit((d) => void d.services.push({ id: uid(), name: name.trim(), fee: Math.max(0, parseFloat(fee) || 0), unit }), "Service added")
    setName("")
    setFee("")
    setUnit("each")
  }
  async function loadStd() {
    if (data.entries.length && !(await ask({ title: "Load D’s standard rates?", message: "This replaces the whole service list. Entries you’ve already logged keep their recorded amounts, but may show under a dash in the breakdown.", ok: "Replace list" }))) return
    commit((d) => { d.services = STD_SERVICES(); d.meta.ratesV = "d1" }, "D’s rates loaded ✓")
  }
  async function remove(id: string) {
    if (data.entries.some((e) => e.serviceId === id) && !(await ask({ title: "Remove service?", message: "You have entries logged under this service. They keep their recorded fee.", ok: "Remove", danger: true }))) return
    commit((d) => void (d.services = d.services.filter((s) => s.id !== id)), "Removed")
  }

  return (
    <div className="grid gap-4">
      <Panel title="Add a service type">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field id="s-name" label="Name" placeholder="e.g. Flu vaccination" value={name} onChange={(e) => setName(e.target.value)} />
          <MoneyField id="s-fee" label="Default rate" placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} />
          <div className="grid gap-1.5">
            <Label htmlFor="s-unit" className="text-xs font-semibold text-muted-foreground">Charged</Label>
            <UnitSelect id="s-unit" value={unit} onChange={setUnit} />
          </div>
          <Button type="submit" className="h-10 px-5">Add service</Button>
        </form>
      </Panel>
      <Panel title="Your services" aside="changes save when you leave a box">
        {!data.services.length ? (
          <Empty title="No services yet">Add one above.</Empty>
        ) : (
          <ul className="divide-y">
            {data.services.map((s) => (
              <li key={s.id + s.name + s.fee + (s.unit || "")} className="flex flex-wrap items-center gap-2 py-2.5 sm:flex-nowrap">
                <Input
                  aria-label="Service name"
                  defaultValue={s.name}
                  className="h-10 min-w-0 basis-full bg-field shadow-none sm:basis-auto sm:flex-[2]"
                  onBlur={(e) => {
                    const v = e.target.value.trim() || "Untitled"
                    if (v !== s.name) commit((d) => void (d.services.find((x) => x.id === s.id)!.name = v), "Saved ✓")
                  }}
                />
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input
                    aria-label={`Default fee for ${s.name}`}
                    type="number" min={0} step="0.01" inputMode="decimal"
                    defaultValue={s.fee}
                    className="num h-10 bg-field pl-6 shadow-none"
                    onBlur={(e) => {
                      const v = Math.max(0, parseFloat(e.target.value) || 0)
                      if (v !== s.fee) commit((d) => void (d.services.find((x) => x.id === s.id)!.fee = v), "Saved ✓")
                    }}
                  />
                </div>
                <div className="w-[118px] flex-none">
                  <UnitSelect id={"u-" + s.id} value={unitOf(s)} onChange={(v) => commit((d) => void (d.services.find((x) => x.id === s.id)!.unit = v), "Saved ✓")} />
                </div>
                <Button variant="ghost" size="icon" aria-label={`Remove ${s.name}`} className="text-muted-foreground hover:text-danger-ink" onClick={() => remove(s.id)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-2">
          <div><Button variant="outline" size="sm" onClick={loadStd}>Load D’s standard rates</Button></div>
          <p className="text-[12.5px] text-muted-foreground">Rates here are the defaults when you log a service; you can still change the rate on any single entry. Services charged per mile or per hour let you log decimals, such as 12.5 miles.</p>
        </div>
      </Panel>
    </div>
  )
}

function UnitSelect({ id, value, onChange }: { id: string; value: Unit; onChange: (u: Unit) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Unit)}>
      <SelectTrigger id={id} aria-label="How it’s charged" className="h-10 bg-field text-[14px] shadow-none"><SelectValue /></SelectTrigger>
      <SelectContent>{UNITS.map(([u, l]) => <SelectItem key={u} value={u}>{l}</SelectItem>)}</SelectContent>
    </Select>
  )
}
