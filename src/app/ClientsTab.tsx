import { useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { clientStats, fmtDate, invStatus, money, plural, uid, type Client, type Data } from "@/lib/model"
import { useApp } from "./ctx"
import { AreaField, Empty, Field, Ledger, Panel, Pill } from "./bits"

const LABEL = { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue" } as const

/** Add a pharmacy and return its id. Shared with the Summary and Log tabs. */
export function newClient(d: Data, fields: Partial<Client> & { name: string }) {
  const c: Client = { id: uid(), contact: "", email: "", phone: "", address: "", notes: "", created: new Date().toISOString(), ...fields, name: fields.name.trim() }
  d.clients.push(c)
  return c.id
}

export function ClientForm({ onSave, onCancel, submit = "Save pharmacy" }: { onSave: (c: { name: string; email: string; address: string; contact: string; phone: string }) => void; onCancel?: () => void; submit?: string }) {
  const [f, setF] = useState({ name: "", email: "", address: "", contact: "", phone: "" })
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!f.name.trim()) return toast("Give the pharmacy a name.")
        onSave(f)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="c-name" label="Pharmacy or company name" placeholder="e.g. High St Pharmacy" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field id="c-email" label="Accounts email" hint="(invoices go here)" type="email" placeholder="accounts@pharmacy.co.uk" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field id="c-contact" label="Contact name" hint="(optional)" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
        <Field id="c-phone" label="Phone" hint="(optional)" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <AreaField id="c-address" label="Address" className="sm:col-span-2" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">{submit}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}

export function ClientsTab() {
  const { data, commit, clientView, openClient, go } = useApp()
  const [adding, setAdding] = useState(false)
  const client = clientView ? data.clients.find((c) => c.id === clientView) : undefined
  if (client) return <ClientProfile c={client} onBack={() => go("clients")} />

  const rows = data.clients
    .map((c) => ({ c, s: clientStats(data, c.id) }))
    .sort((a, b) => b.s.owed - a.s.owed || (b.s.lastInvoice || "").localeCompare(a.s.lastInvoice || "") || a.c.name.localeCompare(b.c.name))

  return (
    <div className="grid gap-5 sm:gap-6">
      <Panel
        title="Pharmacies"
        aside={!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus /> Add pharmacy</Button>}
      >
        {adding && (
          <div className="mb-5 rounded-lg border bg-field p-4">
            <ClientForm
              onCancel={() => setAdding(false)}
              onSave={(f) => {
                let id = ""
                commit((d) => void (id = newClient(d, f)), `${f.name.trim()} saved`)
                setAdding(false)
                if (id) openClient(id)
              }}
            />
          </div>
        )}
        {!rows.length && !adding ? (
          <Empty title="No pharmacies saved yet">Add the pharmacies you work for, or create an invoice and the pharmacy is saved for next time.</Empty>
        ) : (
          <ul className="-mx-2 divide-y">
            {rows.map(({ c, s }) => (
              <li key={c.id}>
                <button type="button" onClick={() => openClient(c.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex size-9 flex-none items-center justify-center rounded-md bg-accent font-display text-[14px] font-medium text-accent-foreground" aria-hidden>{c.name.trim()[0]?.toUpperCase() || "?"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {s.invoices ? `${plural(s.invoices, "invoice")} · ${money(s.billed)} billed${s.avgDays !== null ? ` · pays in ~${plural(s.avgDays, "day")}` : ""}` : c.email || "No invoices yet"}
                    </span>
                  </span>
                  {s.owed > 0 && (
                    <span className="text-right">
                      <span className={cn("num block text-[14px] font-bold", s.overdue > 0 && "text-danger-ink")}>{money(s.owed)}</span>
                      <span className="text-[11.5px] text-muted-foreground">{s.overdue > 0 ? "overdue" : "owed"}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function ClientProfile({ c, onBack }: { c: Client; onBack: () => void }) {
  const { data, commit, ask, viewInvoice, go } = useApp()
  const s = clientStats(data, c.id)
  const invs = data.invoices.filter((i) => i.clientId === c.id).sort((a, b) => b.issued.localeCompare(a.issued))
  const set = (k: keyof Client, v: string) => {
    if (c[k] === v) return
    if (k === "name" && !v) return toast("The name can’t be empty.")
    commit((d) => void ((d.clients.find((x) => x.id === c.id) as Record<string, unknown>)[k] = v), "Saved ✓")
  }
  const text = (k: keyof Client, label: string, o: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <Field key={k + c[k]} id={"cl-" + k} label={label} defaultValue={c[k]} onBlur={(e) => set(k, e.target.value.trim())} {...o} />
  )
  async function remove() {
    const ok = await ask({
      title: "Delete pharmacy",
      message: invs.length
        ? `Delete ${c.name}? Its ${plural(invs.length, "invoice")} stay as they are, but won’t be grouped under a pharmacy any more.`
        : `Delete ${c.name}?`,
      ok: "Delete", danger: true,
    })
    if (!ok) return
    commit((d) => {
      d.clients = d.clients.filter((x) => x.id !== c.id)
      for (const i of d.invoices) if (i.clientId === c.id) delete i.clientId
      for (const e of d.entries) if (e.clientId === c.id) delete e.clientId
      if (d.meta.lastClientId === c.id) delete d.meta.lastClientId
    }, `${c.name} deleted`)
    onBack()
  }

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}><ArrowLeft /> Pharmacies</Button>
      </div>
      <div>
        <h2 className="font-display text-[24px] font-medium leading-tight">{c.name}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {s.invoices ? `${plural(s.invoices, "invoice")} since ${fmtDate(invs[invs.length - 1]?.issued)}` : "No invoices yet"}{c.email && ` · ${c.email}`}
        </p>
      </div>

      <Ledger
        cells={[
          { label: "Billed in total", value: money(s.billed), sub: plural(s.invoices, "invoice") },
          { label: "Paid", value: money(s.paid) },
          { label: "Owed now", value: money(s.owed), sub: s.oldestDue ? `oldest due ${fmtDate(s.oldestDue)}` : "Nothing outstanding", alert: s.overdue > 0 },
          { label: "Average time to pay", value: s.avgDays === null ? "—" : plural(s.avgDays, "day") },
        ]}
      />

      <Panel title="Invoices" aside={<Button size="sm" variant="outline" onClick={() => { commit((d) => void (d.meta.lastClientId = c.id)); go("summary") }}>New invoice</Button>}>
        {!invs.length ? <Empty title="No invoices yet">Choose {c.name} when you create an invoice (Invoices → Create invoice).</Empty> : (
          <ul className="-mx-2 divide-y">
            {invs.map((i) => {
              const st = invStatus(i)
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => viewInvoice(i.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2"><span className="text-[14px] font-semibold">{i.number}</span><Pill tone={st}>{LABEL[st]}</Pill></span>
                      <span className="block text-[12.5px] text-muted-foreground">{i.period} · due {fmtDate(i.due)}{i.paidDate ? ` · paid ${fmtDate(i.paidDate)}` : ""}</span>
                    </span>
                    <span className="num text-[14px] font-bold">{money(i.total)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Details" aside="saved when you leave a box">
        <div className="grid gap-3 sm:grid-cols-2">
          {text("name", "Pharmacy or company name")}
          {text("email", "Accounts email", { type: "email" })}
          {text("contact", "Contact name")}
          {text("phone", "Phone", { type: "tel" })}
          <AreaField key={"address" + c.address} id="cl-address" label="Address" className="sm:col-span-2" defaultValue={c.address} onBlur={(e) => set("address", e.target.value.trim())} />
          <AreaField key={"notes" + c.notes} id="cl-notes" label="Notes" className="sm:col-span-2" placeholder="e.g. parking, who signs off hours, preferred invoice day" defaultValue={c.notes} onBlur={(e) => set("notes", e.target.value.trim())} />
        </div>
        <p className="mt-3 text-[12.5px] text-muted-foreground">New invoices use these details. Invoices you’ve already sent keep the details they were made with.</p>
      </Panel>

      <div>
        <Button variant="ghost" className="text-danger-ink hover:text-danger-ink" onClick={remove}>Delete pharmacy</Button>
      </div>
    </div>
  )
}
