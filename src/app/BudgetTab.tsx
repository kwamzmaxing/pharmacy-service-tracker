import { useEffect, useState } from "react"
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { fmtDate, money, monthLabel, today, uid, type Budget, type IncomeKind, type OtherIncome, type Pot, type SaverStyle } from "@/lib/model"
import { allocated, BASES, TAX_TAB_KINDS, freeColor, INCOME_KINDS, incomeKindName, MAX_POTS, moneyIn, pruneMoved, starterPots, STYLES, suggest } from "@/lib/budget"
import { useApp } from "./ctx"
import { SavingsGuide } from "./SavingsGuide"
import { BalancePanel, OutgoingsPanel } from "./Outgoings"
import { Chips, Empty, Field, Ledger, MoneyField, Panel } from "./bits"
import { Donut, type Slice } from "./charts"

const potColor = (i: number) => `var(--pot-${i % MAX_POTS})`
const UNALLOCATED = "hsl(var(--muted-foreground) / 0.3)"
const pctText = (n: number) => `${Math.round(n)}%`

/** A money box that saves when you leave it (not on every key press). */
function SavedMoney({ id, label, value, onSave }: { id: string; label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "")
  useEffect(() => setV(value ? String(value) : ""), [value])
  const save = () => { const n = Math.max(0, Number(v) || 0); if (n !== value) onSave(n) }
  return <MoneyField id={id} label={label} value={v} placeholder="0" onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
}

export function BudgetTab() {
  const { data, commit, ask, go } = useApp()
  const b = data.budget
  const setB = (fn: (b: Budget) => void, message?: string, undo = false) => commit((d) => fn(d.budget), message, { undo })
  const [hot, setHot] = useState<string | null>(null)

  const m = moneyIn(data, b.basis)
  const sug = suggest(data, m)
  const isCustom = b.active === "custom"
  const pots = isCustom ? b.custom : sug.pots
  const amountOf = (p: Pot) => (isCustom ? (m.total * (Number(p.pct) || 0)) / 100 : sug.amounts[p.id] || 0)
  const alloc = isCustom ? allocated(b.custom) : sug.pots.length ? 100 : 0
  const free = Math.max(0, 100 - alloc)
  const over = Math.max(0, alloc - 100)
  const saving = pots.filter((p) => p.kind === "savings" || p.kind === "emergency" || p.kind === "invest").reduce((a, p) => a + amountOf(p), 0)

  const slices: Slice[] = pots.map((p) => ({ id: p.id, label: p.name || "Unnamed pot", value: amountOf(p), color: potColor(p.color) }))
  if (isCustom && free > 0 && m.total > 0) slices.push({ id: "free", label: "Not allocated yet", value: (m.total * free) / 100, color: UNALLOCATED })

  function startOwnSplit(from: "suggestion" | "starter") {
    setB((x) => {
      x.custom = from === "suggestion" && sug.pots.length
        ? sug.pots.map((p) => ({ ...p, id: uid(), why: undefined }))
        : starterPots(uid)
      x.active = "custom"
    }, from === "suggestion" ? "Copied the suggestion. Change any pot you like ✓" : "Started a split you can change ✓")
  }

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="grid gap-2">
        <h1 className="font-display text-[22px] font-medium">Accounting</h1>
        <p className="max-w-2xl text-[14px] text-muted-foreground">Share out what comes in: tax first, then what you pay each month, then savings and spending to suit how you like to save. Or make your own split.</p>
      </div>

      <div className="grid gap-3">
        <Chips label="Work it out from" value={b.basis} options={BASES} onChange={(v) => setB((x) => void (x.basis = v))} />
        {b.basis === "own" && (
          <div className="max-w-xs"><SavedMoney id="b-own" label="Money in per month" value={b.ownIncome} onSave={(n) => setB((x) => void (x.ownIncome = n), "Saved ✓")} /></div>
        )}
      </div>

      <Ledger cells={[
        { label: "Money in", value: money(m.total), sub: b.basis === "avg3" ? `Monthly average, ${m.label}` : m.label },
        { label: "From invoices", value: money(m.invoices), sub: b.basis === "own" ? "Your figure" : "Paid in this period" },
        { label: "Other income", value: money(m.other), sub: b.incomes.length ? "Added below" : "None added yet" },
        { label: "Saving & investing", value: m.total > 0 ? pctText((saving / m.total) * 100) : "—", sub: m.total > 0 ? `${money(saving)} a month` : "Once money comes in" },
      ]} />

      <OutgoingsPanel list={b.outgoings} setB={setB} ask={ask} />

      <Panel title="Your split" aside={<Chips label="Which split" value={b.active} options={[["suggested", "Suggested for me"], ["custom", "My own"]]} onChange={(v) => {
        if (v === "custom" && !b.custom.length) startOwnSplit(sug.pots.length ? "suggestion" : "starter")
        else setB((x) => void (x.active = v))
        setHot(null)
      }} />}>
        {!isCustom && (
          <div className="mb-6 grid gap-5">
            <div className="grid gap-2">
              <Label className="text-[12.5px] font-normal text-muted-foreground">How do you like to save?</Label>
              <Chips label="Saving style" value={b.style} options={STYLES.map(([k, l]) => [k, l] as [SaverStyle, string])} onChange={(v) => setB((x) => void (x.style = v))} />
              <p className="text-[13px] text-muted-foreground">{STYLES.find((s) => s[0] === b.style)?.[2]}</p>
            </div>
            {!b.outgoings.length && <p className="text-[13px] text-muted-foreground">Add what you pay each month below (rent, car, gym, savings, ISA…) and the split works around it.</p>}
            <label className="flex items-center justify-between gap-4 text-[14px]">
              <span>I already have 3 to 6 months of essentials saved<span className="block text-[12.5px] text-muted-foreground">Its share goes to savings or investing instead.</span></span>
              <Switch checked={b.emergencyDone} onCheckedChange={(v) => setB((x) => void (x.emergencyDone = v))} />
            </label>
            {sug.notes.map((n) => <p key={n} className="rounded-xl bg-warn-tint px-4 py-3 text-[13.5px] text-warn">{n}</p>)}
          </div>
        )}

        {m.total <= 0 ? (
          <Empty title={`No money in for ${b.basis === "avg3" ? "those months" : m.label}`}>
            <p className="mb-4">Mark invoices as paid, add other income below, or plan with a figure of your own.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setB((x) => void (x.basis = "own"))}>Use my own figure</Button>
              <Button size="sm" variant="outline" onClick={() => go("invoices")}>Go to invoices</Button>
            </div>
          </Empty>
        ) : (
          <div className="grid items-start gap-6 md:grid-cols-[260px_1fr] md:gap-10">
            <Donut slices={slices} total={m.total} centreLabel={b.basis === "avg3" ? "Money in a month" : "Money in"} active={hot} onActive={setHot} />
            {isCustom ? (
              <CustomPots pots={b.custom} total={m.total} hot={hot} setHot={setHot} setB={setB} free={free} over={over} ask={ask} />
            ) : (
              <ul className="grid gap-1" aria-label="Pots">
                {sug.pots.map((p) => (
                  <li key={p.id}>
                    <button type="button" onMouseEnter={() => setHot(p.id)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(p.id)} onBlur={() => setHot(null)}
                      className={cn("grid w-full grid-cols-[12px_1fr_auto] items-baseline gap-x-3 rounded-lg px-2 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", hot === p.id && "bg-secondary")}>
                      <span className="size-3 translate-y-[1px] rounded-[3px]" style={{ background: potColor(p.color) }} />
                      <span className="min-w-0 text-[14.5px] font-medium">{p.name}</span>
                      <span className="num whitespace-nowrap text-right text-[14.5px]">{money(amountOf(p))} <span className="text-[12.5px] text-muted-foreground">· {p.pct}%</span></span>
                      {p.why && <span className="col-start-2 col-end-4 mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{p.why}</span>}
                      {p.items && (
                        <span className="col-start-2 col-end-4 mt-1.5 grid gap-0.5 text-[12.5px]">
                          {p.items.map((it, k) => <span key={k} className="flex justify-between gap-3"><span className="truncate text-muted-foreground">{it.name}</span><span className="num">{money(it.amount)}</span></span>)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                <li className="mt-3 flex flex-wrap items-center gap-3 px-2">
                  <Button size="sm" variant="outline" onClick={() => startOwnSplit("suggestion")}><Pencil /> Change this split</Button>
                  <span className="text-[12.5px] text-muted-foreground">Copies it to “My own” so you can edit it.</span>
                </li>
              </ul>
            )}
          </div>
        )}
      </Panel>

      {m.total > 0 && <BalancePanel sug={sug} emergencyDone={b.emergencyDone} tips={b.tips} setB={setB} />}

      {m.total > 0 && pots.length > 0 && <MoveMoney pots={pots} amountOf={amountOf} moved={b.moved} setB={setB} basisNote={b.basis !== "month"} />}

      <OtherIncomePanel incomes={b.incomes} setB={setB} ask={ask} />

      <SavingsGuide />

      <p className="max-w-3xl px-1 text-[12.5px] leading-relaxed text-muted-foreground">
        <Sparkles className="mr-1 inline size-3.5 -translate-y-px" />
        The suggested split is worked out from your own figures: what came in, your expenses, your tax settings and the amounts above. The tax pot uses this year’s UK rates on a full year at this month’s pace, so treat it as an estimate. This is general guidance, not financial advice. Nothing moves money for you: tick off each pot when you’ve moved it at your bank.
      </p>
    </div>
  )
}

/* ---------- my own split ---------- */
function CustomPots({ pots, total, hot, setHot, setB, free, over, ask }: {
  pots: Pot[]; total: number; hot: string | null; setHot: (id: string | null) => void
  setB: (fn: (b: Budget) => void, message?: string, undo?: boolean) => void; free: number; over: number
  ask: (o: { title: string; message: string; ok?: string; danger?: boolean }) => Promise<boolean>
}) {
  // Slider values while dragging, saved when let go
  const [drag, setDrag] = useState<Record<string, number>>({})
  const pctOf = (p: Pot) => drag[p.id] ?? (Number(p.pct) || 0)
  const update = (id: string, fn: (p: Pot) => void, message?: string) => setB((x) => { const p = x.custom.find((q) => q.id === id); if (p) fn(p) }, message)

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2" aria-label="Your pots">
        {pots.map((p) => (
          <li key={p.id} onMouseEnter={() => setHot(p.id)} onMouseLeave={() => setHot(null)}
            className={cn("grid gap-2 rounded-lg px-2 py-2.5 transition-colors", hot === p.id && "bg-secondary")}>
            <div className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-x-3">
              <span className="size-3 rounded-[3px]" style={{ background: potColor(p.color) }} />
              <PotName pot={p} onSave={(name) => update(p.id, (q) => void (q.name = name))} onFocus={() => setHot(p.id)} />
              <span className="num whitespace-nowrap text-right text-[14.5px]">{money((total * pctOf(p)) / 100)}</span>
              <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`Remove ${p.name || "pot"}`}
                onClick={async () => { if (await ask({ title: "Remove this pot?", message: `“${p.name || "Unnamed pot"}” will be taken out of your split.`, ok: "Remove", danger: true })) setB((x) => void (x.custom = x.custom.filter((q) => q.id !== p.id)), "Pot removed", true) }}>
                <Trash2 />
              </Button>
            </div>
            <div className="grid grid-cols-[12px_1fr_auto] items-center gap-x-3">
              <span />
              <Slider value={[pctOf(p)]} min={0} max={100} step={1} aria-label={`${p.name || "Pot"} share`}
                onValueChange={([v]) => setDrag((d) => ({ ...d, [p.id]: v }))}
                onValueCommit={([v]) => { update(p.id, (q) => void (q.pct = v)); setDrag((d) => { const n = { ...d }; delete n[p.id]; return n }) }} />
              <PctBox value={pctOf(p)} label={`${p.name || "Pot"} percentage`} onSave={(v) => update(p.id, (q) => void (q.pct = v))} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <p className={cn("text-[13.5px] font-medium", over ? "text-danger-ink" : free ? "text-warn" : "text-ok-ink")} role="status">
          {over ? `Over by ${over}%: take some off a pot` : free ? `${free}% not given to a pot yet` : <><Check className="mr-1 inline size-4 -translate-y-px" />All 100% shared out</>}
        </p>
        <div className="flex flex-wrap gap-2">
          {free > 0 && pots.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setB((x) => {
              const s = x.custom.find((q) => q.kind === "savings") || x.custom[x.custom.length - 1]
              s.pct = (Number(s.pct) || 0) + free
            }, "Added the rest ✓")}>Put the rest in {(pots.find((q) => q.kind === "savings") || pots[pots.length - 1]).name || "the last pot"}</Button>
          )}
          <Button size="sm" variant="outline" disabled={pots.length >= MAX_POTS}
            onClick={() => setB((x) => void x.custom.push({ id: uid(), name: "", pct: Math.min(free, 10), color: freeColor(x.custom), kind: "custom" }))}>
            <Plus /> Add a pot
          </Button>
        </div>
      </div>
      {pots.length >= MAX_POTS && <p className="px-2 text-[12.5px] text-muted-foreground">Up to {MAX_POTS} pots, so the pie stays readable. Combine two to make room.</p>}
    </div>
  )
}

function PotName({ pot, onSave, onFocus }: { pot: Pot; onSave: (n: string) => void; onFocus: () => void }) {
  const [v, setV] = useState(pot.name)
  useEffect(() => setV(pot.name), [pot.name])
  return (
    <Input value={v} placeholder="Name this pot" aria-label="Pot name" maxLength={40}
      className="h-9 border-transparent bg-transparent px-2 text-[14.5px] font-medium shadow-none hover:border-input focus-visible:bg-field"
      onChange={(e) => setV(e.target.value)} onFocus={onFocus}
      onBlur={() => v.trim() !== pot.name && onSave(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  )
}

function PctBox({ value, label, onSave }: { value: number; label: string; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  return (
    <div className="relative w-[72px]">
      <Input value={v} inputMode="numeric" aria-label={label} className="h-9 bg-field pr-6 text-right text-[14px]"
        onChange={(e) => setV(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
        onBlur={() => { const n = Math.min(100, Math.max(0, Number(v) || 0)); setV(String(n)); if (n !== value) onSave(n) }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">%</span>
    </div>
  )
}

/* ---------- tick off each pot as it's moved ---------- */
function MoveMoney({ pots, amountOf, moved, setB, basisNote }: {
  pots: Pot[]; amountOf: (p: Pot) => number; moved: Budget["moved"]
  setB: (fn: (b: Budget) => void, message?: string, undo?: boolean) => void; basisNote: boolean
}) {
  const ym = today().slice(0, 7)
  const done = new Set(moved[ym] || [])
  const count = pots.filter((p) => done.has(p.id)).length
  const toggle = (id: string, on: boolean) => setB((x) => {
    const list = new Set(x.moved[ym] || [])
    if (on) list.add(id)
    else list.delete(id)
    x.moved = pruneMoved({ ...x.moved, [ym]: [...list] })
  })
  return (
    <Panel title="Move your money" aside={`${monthLabel(ym)} · ${count} of ${pots.length} done`}>
      <p className="mb-4 text-[13.5px] text-muted-foreground">
        Set up a savings pot or account for each one at your bank, then tick it off once the money’s moved.{basisNote && " Amounts follow the period chosen at the top."}
      </p>
      <ul className="grid gap-1 sm:grid-cols-2 sm:gap-x-6">
        {pots.map((p) => {
          const on = done.has(p.id)
          return (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-secondary">
                <Checkbox checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} aria-label={`Moved ${p.name}`} />
                <span className="size-3 flex-none rounded-[3px]" style={{ background: potColor(p.color) }} />
                <span className={cn("min-w-0 flex-1 truncate text-[14px]", on && "text-muted-foreground line-through")}>{p.name || "Unnamed pot"}</span>
                <span className={cn("num text-[14px]", on && "text-muted-foreground")}>{money(amountOf(p))}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/* ---------- money from elsewhere ---------- */
const blank = (): OtherIncome => ({ id: "", date: today(), amount: 0, kind: "selfemployed", desc: "", setAsideTax: true })

function OtherIncomePanel({ incomes, setB, ask }: {
  incomes: OtherIncome[]; setB: (fn: (b: Budget) => void, message?: string, undo?: boolean) => void
  ask: (o: { title: string; message: string; ok?: string; danger?: boolean }) => Promise<boolean>
}) {
  const [form, setForm] = useState<OtherIncome | null>(null)
  const [all, setAll] = useState(false)
  const sorted = [...incomes].sort((a, b) => b.date.localeCompare(a.date))
  const shown = all ? sorted : sorted.slice(0, 8)
  const valid = !!form && Number(form.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.date)

  function save() {
    if (!form || !valid) return
    const item = { ...form, amount: Math.round(Number(form.amount) * 100) / 100, desc: form.desc.trim().slice(0, 120) }
    setB((x) => {
      if (item.id) x.incomes = x.incomes.map((i) => (i.id === item.id ? item : i))
      else x.incomes.push({ ...item, id: uid() })
    }, item.id ? "Updated ✓" : "Income added ✓")
    setForm(null)
  }

  return (
    <Panel title="Other income" aside={!form && <Button size="sm" onClick={() => setForm(blank())}><Plus /> Add income</Button>}>
      <p className="mb-4 text-[13.5px] text-muted-foreground">Money that didn’t come from an invoice: a salary, rent, other work or a gift. It’s added to “Money in” for the month it arrived.</p>

      {form && (
        <div className="mb-5 grid gap-4 rounded-xl bg-secondary/60 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField id="oi-amt" label="Amount" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: e.target.value as unknown as number })} autoFocus />
            <Field id="oi-date" label="Date received" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <div className="grid gap-1.5">
              <Label htmlFor="oi-kind" className="text-[12.5px] font-normal text-muted-foreground">Type</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as IncomeKind, setAsideTax: INCOME_KINDS.find((k) => k[0] === v)?.[2] ?? false })}>
                <SelectTrigger id="oi-kind" className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
                <SelectContent>{INCOME_KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Field id="oi-desc" label="Note (optional)" placeholder="e.g. Weekend clinic, March rent" value={form.desc} maxLength={120} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
          {TAX_TAB_KINDS.includes(form.kind) ? (
            <p className="text-[13px] text-muted-foreground">
              {form.kind === "rental"
                ? "Counted on the Tax tab: income tax after the £1,000 property allowance. National Insurance on rent is voluntary, so it isn’t included. Your tax pot includes it."
                : "Counted on the Tax tab with your invoices, for income tax and National Insurance. Your tax pot includes it."}
            </p>
          ) : (
            <label className="flex items-center justify-between gap-4 text-[14px]">
              <span>Put tax aside for this<span className="block text-[12.5px] text-muted-foreground">Adds income tax to your tax pot. Leave off for money that’s already taxed or isn’t taxable. Not added to the Tax tab.</span></span>
              <Switch checked={form.setAsideTax} onCheckedChange={(v) => setForm({ ...form, setAsideTax: v })} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!valid}>{form.id ? "Save changes" : "Add income"}</Button>
            <Button variant="ghost" onClick={() => setForm(null)}><X /> Cancel</Button>
          </div>
        </div>
      )}

      {!sorted.length && !form ? (
        <Empty title="No other income yet">Invoices you mark as paid are counted already.</Empty>
      ) : (
        <ul className="divide-y">
          {shown.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{i.desc || incomeKindName(i.kind)}</p>
                <p className="text-[12.5px] text-muted-foreground">{fmtDate(i.date)} · {incomeKindName(i.kind)}{TAX_TAB_KINDS.includes(i.kind) ? " · on the Tax tab" : i.setAsideTax ? " · tax put aside" : ""}</p>
              </div>
              <span className="num text-[14px]">{money(i.amount)}</span>
              <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Edit" onClick={() => setForm({ ...i })}><Pencil /></Button>
              <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Delete"
                onClick={async () => { if (await ask({ title: "Delete this income?", message: `${money(i.amount)} on ${fmtDate(i.date)} will be removed.`, ok: "Delete", danger: true })) setB((x) => void (x.incomes = x.incomes.filter((q) => q.id !== i.id)), "Income deleted", true) }}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > 8 && <button type="button" className="mt-3 text-[13px] font-semibold text-brand-ink hover:underline" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${sorted.length}`}</button>}
    </Panel>
  )
}
