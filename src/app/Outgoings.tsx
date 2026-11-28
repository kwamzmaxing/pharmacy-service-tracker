// "What you pay each month" on the Accounting tab, and the balance score that reads it.
import { useEffect, useState } from "react"
import { Check, Plus, Star, StarHalf, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { money, uid, type Budget, type OutCat, type Outgoing } from "@/lib/model"
import { balanceScore, catLabel, cutBackTips, OUT_CATS, type Suggestion } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { Panel } from "./bits"

type SetB = (fn: (b: Budget) => void, message?: string, undo?: boolean) => void
const QUICK: OutCat[] = ["housing", "bills", "food", "transport", "subscriptions", "health", "debt", "emergency", "savings", "isa", "pension", "childcare", "insurance"]

function AmountBox({ value, label, onSave }: { value: number; label: string; onSave: (n: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "")
  useEffect(() => setV(value ? String(value) : ""), [value])
  return (
    <div className="relative w-[110px]">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">£</span>
      <Input value={v} inputMode="decimal" aria-label={label} placeholder="0" className="h-9 bg-field pl-6 text-right text-[14px]"
        onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
        onBlur={() => { const n = Math.max(0, Math.round((Number(v) || 0) * 100) / 100); if (n !== value) onSave(n) }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
    </div>
  )
}
function NameBox({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (s: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <Input value={v} placeholder={placeholder} aria-label="What it is" maxLength={40}
    className="h-9 border-transparent bg-transparent px-2 text-[14px] font-medium shadow-none hover:border-input focus-visible:bg-field"
    onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== value && onSave(v.trim())} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
}

export function OutgoingsPanel({ list, setB, ask }: { list: Outgoing[]; setB: SetB; ask: (o: { title: string; message: string; ok?: string; danger?: boolean }) => Promise<boolean> }) {
  const update = (id: string, fn: (o: Outgoing) => void) => setB((x) => { const o = x.outgoings.find((q) => q.id === id); if (o) fn(o) })
  const add = (cat: OutCat) => setB((x) => void x.outgoings.push({ id: uid(), name: "", cat, amount: 0 }))
  const monthly = list.reduce((a, o) => a + (Number(o.amount) || 0), 0)
  return (
    <Panel title="What you pay each month" aside={list.length ? <span className="num">{money(monthly)} a month</span> : undefined}>
      <p className="mb-4 max-w-[64ch] text-[13.5px] text-muted-foreground">
        Add what goes out regularly. The suggested split pays these first, then shares out what’s left to suit how you like to save. Anything you already put into savings, an emergency fund, an ISA or a pension counts towards those goals.
      </p>
      {list.length > 0 && (
        <ul className="mb-4 grid gap-1" aria-label="Your monthly outgoings">
          {list.map((o) => (
            <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-1 py-1 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto]">
              <NameBox value={o.name} placeholder={catLabel(o.cat)} onSave={(n) => update(o.id, (q) => void (q.name = n))} />
              <div className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto">
                <Select value={o.cat} onValueChange={(v) => update(o.id, (q) => void (q.cat = v as OutCat))}>
                  <SelectTrigger aria-label="Category" className="h-9 bg-field text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{OUT_CATS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <AmountBox value={o.amount} label={`${o.name || catLabel(o.cat)} per month`} onSave={(n) => update(o.id, (q) => void (q.amount = n))} />
              <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`Remove ${o.name || catLabel(o.cat)}`}
                onClick={async () => { if (!o.amount || await ask({ title: "Remove this?", message: `${o.name || catLabel(o.cat)} (${money(o.amount)} a month) will be taken out of your plan.`, ok: "Remove", danger: true })) setB((x) => void (x.outgoings = x.outgoings.filter((q) => q.id !== o.id)), "Removed", true) }}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2">
        <span className="text-[12.5px] text-muted-foreground">{list.length ? "Add another" : "Start with what you pay"}</span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((c) => (
            <button key={c} type="button" onClick={() => add(c)} title={OUT_CATS.find((x) => x[0] === c)?.[3]}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Plus className="size-3.5" aria-hidden />{catLabel(c)}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--pot-3)]" role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => n >= i
        ? <Star key={i} className="size-6 fill-current" aria-hidden />
        : n >= i - 0.5 ? <span key={i} className="relative inline-flex"><Star className="size-6 text-muted-foreground/40" aria-hidden /><StarHalf className="absolute inset-0 size-6 fill-current" aria-hidden /></span>
        : <Star key={i} className="size-6 text-muted-foreground/40" aria-hidden />)}
    </span>
  )
}

export function BalancePanel({ sug, emergencyDone, tips, setB }: { sug: Suggestion; emergencyDone: boolean; tips: boolean; setB: SetB }) {
  const score = balanceScore(sug, emergencyDone)
  if (!score) return null
  const list = tips ? cutBackTips(sug) : []
  const verdict = score.stars >= 4.5 ? "Well balanced" : score.stars >= 3.5 ? "Mostly balanced" : score.stars >= 2.5 ? "Some things to look at" : "Out of balance"
  return (
    <Panel title="How balanced is it?" aside="A guide, not financial advice">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Stars n={score.stars} />
        <span className="font-display text-[18px] font-medium">{score.stars} out of 5 · {verdict}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">Judged on your take-home this period ({money(sug.plan.takeHome)} after tax and business costs), using the plan above.</p>
      <ul className="mt-4 grid gap-2 text-[13.5px] leading-snug">
        {score.reasons.map((r) => (
          <li key={r.text} className="flex gap-2">
            {r.ok ? <Check className="mt-0.5 size-4 flex-none text-ok-ink" aria-label="Good" /> : <X className="mt-0.5 size-4 flex-none text-danger-ink" aria-label="To look at" />}
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      <label className="mt-5 flex items-center justify-between gap-4 border-t pt-4 text-[14px]">
        <span>Suggest where I could cut back<span className="block text-[12.5px] text-muted-foreground">Ideas worked out from your own figures.</span></span>
        <Switch checked={tips} onCheckedChange={(v) => setB((x) => void (x.tips = v))} />
      </label>
      {tips && list.length > 0 && (
        <ul className="mt-3 grid gap-2 text-[13.5px] leading-snug">
          {list.map((t) => <li key={t} className={cn("rounded-lg bg-secondary/60 px-3 py-2.5")}>{t}</li>)}
        </ul>
      )}
      <p className="mt-4 text-[12px] text-muted-foreground">The score is KASA.Rx’s own: it starts at 5 and loses some for low saving, a high share on essentials and repayments, high spending, or no emergency fund. The guides are common rules of thumb, not rules. For advice on your situation, MoneyHelper is free and government-backed.</p>
    </Panel>
  )
}
