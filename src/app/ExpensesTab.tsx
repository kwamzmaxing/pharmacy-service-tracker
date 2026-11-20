import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { Camera, Download, Plus, Receipt, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { categoryName, EXPENSE_CATEGORIES, fmtDate, money, monthLabel, plural, taxYear, taxYearsWithData, today, uid, type Expense, type ExpenseCategory } from "@/lib/model"
import { deleteReceipt, getReceipt, saveReceipt } from "@/lib/cloud"
import { shrinkImage } from "@/lib/images"
import { useApp } from "./ctx"
import { Empty, Field, Ledger, MoneyField, Panel } from "./bits"

export function ExpensesTab() {
  const { data, commit, me, ask } = useApp()
  const years = taxYearsWithData(data)
  const [yearFrom, setYearFrom] = useState(years[0].from)
  const ty = years.find((y) => y.from === yearFrom) ?? taxYear()
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<Expense | null>(null)

  const inYear = data.expenses.filter((x) => x.date >= ty.from && x.date <= ty.to).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const sum = (xs: Expense[]) => xs.reduce((a, x) => a + (Number(x.amount) || 0), 0)
  const thisMonth = data.expenses.filter((x) => x.date.slice(0, 7) === today().slice(0, 7))
  const byCat = EXPENSE_CATEGORIES.map(([c, name]) => ({ c, name, amount: sum(inYear.filter((x) => x.category === c)) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount)
  const max = byCat[0]?.amount || 1
  const groups = useMemo(() => {
    const g: { ym: string; items: Expense[] }[] = []
    for (const x of inYear) {
      const ym = x.date.slice(0, 7)
      if (g.at(-1)?.ym !== ym) g.push({ ym, items: [] })
      g.at(-1)!.items.push(x)
    }
    return g
  }, [inYear])

  async function remove(x: Expense) {
    if (!(await ask({ title: "Delete expense?", message: `Delete ${categoryName(x.category).toLowerCase()} of ${money(x.amount)} on ${fmtDate(x.date)}${x.receiptId ? " and its receipt photo" : ""}?`, ok: "Delete", danger: true }))) return
    commit((d) => void (d.expenses = d.expenses.filter((e) => e.id !== x.id)), "Expense deleted")
    if (x.receiptId) deleteReceipt(me.uid, x.receiptId).catch(() => {})
  }

  function exportYear() {
    if (!inYear.length) return toast("No expenses in this tax year yet.")
    const client = (id?: string) => data.clients.find((c) => c.id === id)?.name ?? ""
    const rows = [...inYear].reverse().map((x) => ({ Date: x.date, Category: categoryName(x.category), Description: x.desc, Pharmacy: client(x.clientId), Amount: Number(x.amount) || 0, Receipt: x.receiptId ? "Yes" : "" }))
    const months = [...new Set(inYear.map((x) => x.date.slice(0, 7)))].sort()
    const summary = months.map((ym) => {
      const row: Record<string, string | number> = { Month: monthLabel(ym) }
      for (const [c, name] of EXPENSE_CATEGORIES) row[name] = sum(inYear.filter((x) => x.date.startsWith(ym) && x.category === c))
      row.Total = sum(inYear.filter((x) => x.date.startsWith(ym)))
      return row
    })
    const totals: Record<string, string | number> = { Month: "Tax year total" }
    for (const [c, name] of EXPENSE_CATEGORIES) totals[name] = sum(inYear.filter((x) => x.category === c))
    totals.Total = sum(inYear)
    summary.push(totals)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Monthly summary")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Expenses")
    XLSX.writeFile(wb, `expenses-${ty.label.replace("/", "-")}.xlsx`)
    toast.success("Expenses exported ✓")
  }

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="x-year" className="text-[13px] text-muted-foreground">Tax year</Label>
          <Select value={yearFrom} onValueChange={setYearFrom}>
            <SelectTrigger id="x-year" className="h-9 w-auto gap-2 bg-card text-[13.5px] shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y.from} value={y.from}>{y.label} ({fmtDate(y.from)} – {fmtDate(y.to)})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportYear}><Download /> Export</Button>
          {!adding && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Add expense</Button>}
        </div>
      </div>

      <Ledger cells={[
        { label: `Expenses ${ty.label}`, value: money(sum(inYear)), sub: plural(inYear.length, "expense") },
        { label: "This month", value: money(sum(thisMonth)), sub: plural(thisMonth.length, "expense") },
        { label: "Receipts saved", value: String(inYear.filter((x) => x.receiptId).length), sub: `of ${inYear.length} this tax year` },
        { label: "Biggest category", value: byCat[0] ? byCat[0].name : "—", sub: byCat[0] ? money(byCat[0].amount) : "Nothing yet" },
      ]} />

      {adding && <ExpenseForm onDone={() => setAdding(false)} />}

      {byCat.length > 0 && (
        <Panel title="By category" aside={`${ty.label} tax year`}>
          <ul className="grid gap-2.5">
            {byCat.map((c) => (
              <li key={c.c} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-[13.5px]">
                <span className="font-medium">{c.name}</span>
                <span className="num font-semibold">{money(c.amount)}</span>
                <span className="col-span-2 h-[3px] overflow-hidden rounded-full bg-secondary" aria-hidden><span className="block h-full rounded-full bg-primary/60" style={{ width: `${Math.max(3, (c.amount / max) * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Expenses">
        {!groups.length ? (
          <Empty title="No expenses in this tax year">
            Add travel, accommodation, fees and other work costs as you go. They lower the profit you pay tax on.
            {!adding && <div className="mt-3"><Button size="sm" onClick={() => setAdding(true)}><Plus /> Add expense</Button></div>}
          </Empty>
        ) : (
          <div className="grid gap-4">
            {groups.map((g) => (
              <div key={g.ym}>
                <div className="flex items-baseline justify-between border-b pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground">{monthLabel(g.ym)}</span>
                  <span className="num text-[13px] font-semibold">{money(sum(g.items))}</span>
                </div>
                <ul className="divide-y">
                  {g.items.map((x) => {
                    const cl = data.clients.find((c) => c.id === x.clientId)
                    return (
                      <li key={x.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold">{x.desc || categoryName(x.category)}</div>
                          <div className="truncate text-[12.5px] text-muted-foreground">{fmtDate(x.date)} · {categoryName(x.category)}{cl ? ` · ${cl.name}` : ""}</div>
                        </div>
                        {x.receiptId && <Button variant="ghost" size="icon" aria-label="View receipt" className="text-brand-ink" onClick={() => setViewing(x)}><Receipt /></Button>}
                        <span className="num w-[84px] text-right text-[14px] font-bold">{money(x.amount)}</span>
                        <Button variant="ghost" size="icon" aria-label="Delete expense" className="text-muted-foreground hover:text-danger-ink" onClick={() => remove(x)}><Trash2 /></Button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
        Only costs that are wholly for work count. If you claim mileage (it’s counted automatically on the Tax tab), don’t add fuel, servicing or insurance for the same car; parking and tolls are fine. Keep receipts for at least 5 years after the 31 January deadline.
      </p>

      <ReceiptDialog expense={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { data, commit, me } = useApp()
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState<ExpenseCategory>("travel")
  const [desc, setDesc] = useState("")
  const shiftClient = (d: string) => data.entries.find((e) => e.date === d && e.clientId)?.clientId ?? ""
  const [clientId, setClientId] = useState(shiftClient(today()))
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Link to the shift that day: pick the pharmacy you logged work for on that date
  useEffect(() => { setClientId((c) => c || shiftClient(date)) }, [date]) // eslint-disable-line react-hooks/exhaustive-deps
  const worked = data.entries.some((e) => e.date === date)

  async function pick(f?: File) {
    if (!f) return
    try {
      setPhoto(await shrinkImage(f))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t read that photo.")
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const amt = Math.round((parseFloat(amount) || 0) * 100) / 100
    if (amt <= 0) return toast("Enter the amount.")
    setBusy(true)
    let receiptId: string | undefined
    if (photo) {
      receiptId = uid()
      try {
        await saveReceipt(me.uid, receiptId, photo)
      } catch {
        receiptId = undefined
        toast.error("The receipt photo couldn’t be saved, so the expense was saved without it. Ask the site owner to update the database rules (SETUP.md).")
      }
    }
    commit((d) => void d.expenses.push({ id: uid(), date, category, amount: amt, desc: desc.trim(), ...(clientId ? { clientId } : {}), ...(receiptId ? { receiptId } : {}) }), `Expense of ${money(amt)} added ✓`)
    setBusy(false)
    onDone()
  }

  return (
    <Panel title="Add an expense" aside={<Button variant="ghost" size="icon" aria-label="Close" onClick={onDone}><X /></Button>}>
      <form onSubmit={save} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="x-date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
          <MoneyField id="x-amount" label="Amount" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="grid gap-1.5">
            <Label htmlFor="x-cat" className="text-[12.5px] font-normal text-muted-foreground">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger id="x-cat" className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map(([c, name, hint]) => <SelectItem key={c} value={c}><span>{name}</span><span className="ml-2 text-[12px] text-muted-foreground">{hint}</span></SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field id="x-desc" label="What it was" hint="(optional)" placeholder="e.g. Parking at Riverside, GPhC renewal" value={desc} onChange={(e) => setDesc(e.target.value)} />
          {data.clients.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="x-client" className="text-[12.5px] font-normal text-muted-foreground">Shift at {worked ? "" : <span className="font-normal">(optional)</span>}</Label>
              <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
                <SelectTrigger id="x-client" className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  <SelectItem value="none">Not linked to a shift</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} id="x-photo" type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = "" }} />
          {photo ? (
            <div className="flex items-center gap-3">
              <img src={photo} alt="Receipt preview" className="h-16 w-12 rounded border object-cover" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)}>Remove photo</Button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Camera /> Add receipt photo</Button>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="h-11 px-6" disabled={busy}>{busy ? "Saving…" : "Save expense"}</Button>
          <Button type="button" variant="ghost" className="h-11" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Panel>
  )
}

function ReceiptDialog({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { me } = useApp()
  const [img, setImg] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    setImg(undefined)
    if (expense?.receiptId) getReceipt(me.uid, expense.receiptId).then(setImg).catch(() => setImg(null))
  }, [expense?.receiptId, me.uid])
  return (
    <Dialog open={!!expense} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto rounded-[12px]">
        {expense && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">{expense.desc || categoryName(expense.category)}</DialogTitle>
              <DialogDescription>{fmtDate(expense.date)} · {money(expense.amount)}</DialogDescription>
            </DialogHeader>
            {img === undefined ? <div className="h-64 animate-pulse rounded-lg bg-secondary" /> : img ? (
              <>
                <img src={img} alt={`Receipt for ${expense.desc || categoryName(expense.category)}`} className="w-full rounded-lg border" />
                <a href={img} download={`receipt-${expense.date}.jpg`} className="text-[13px] font-semibold text-brand-ink hover:underline">Download photo</a>
              </>
            ) : <p className="text-[13px] text-muted-foreground">The receipt photo couldn’t be loaded.</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
