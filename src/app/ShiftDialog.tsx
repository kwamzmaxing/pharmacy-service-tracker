// Add or edit a booked shift.
import { useEffect, useState } from "react"
import { AlertTriangle, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addDays, fmtDate, money, plural, today, uid, type Shift } from "@/lib/model"
import { clashes, hoursText, placeName, shiftHours, shiftPay, timeText } from "@/lib/shifts"
import { useApp } from "./ctx"
import { Chips, MoneyField } from "./bits"

export type ShiftDraft = Partial<Shift> & { date: string }
const OTHER = "__other"
const BREAKS: [string, string][] = [["0", "None"], ["15", "15 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 hr"]]
const REPEATS: [string, string][] = [["0", "Doesn’t repeat"], ["4", "Every week for 4 weeks"], ["8", "Every week for 8 weeks"], ["12", "Every week for 12 weeks"]]

export function ShiftDialog({ draft, onClose }: { draft: ShiftDraft | null; onClose: () => void }) {
  const { data, commit, ask } = useApp()
  const existing = draft?.id ? data.shifts.find((s) => s.id === draft.id) : undefined
  // Start new shifts from the last one booked: same place, times and pay
  const last = [...data.shifts].sort((a, b) => b.created.localeCompare(a.created))[0]
  const hourly = data.services.find((s) => /hour/i.test(s.name))
  const blank = (d: ShiftDraft): Shift => ({
    id: "", date: d.date, start: d.start ?? last?.start ?? "09:00", end: d.end ?? last?.end ?? "18:00",
    breakMins: d.breakMins ?? last?.breakMins ?? 30, clientId: d.place ? undefined : (d.clientId ?? last?.clientId),
    place: d.place ?? (last?.clientId ? "" : last?.place ?? ""), pay: d.pay ?? last?.pay ?? "hourly",
    rate: d.rate ?? last?.rate ?? hourly?.fee ?? 25, notes: d.notes ?? "", created: "",
  })
  const [f, setF] = useState<Shift>(() => blank(draft ?? { date: today() }))
  const [rate, setRate] = useState("")
  const [repeat, setRepeat] = useState("0")
  // For a weekly repeat: change just this shift, or this one and the later ones not yet in the log
  const [scope, setScope] = useState<"one" | "later">("one")
  const later = existing?.series ? data.shifts.filter((x) => x.series === existing.series && x.id !== existing.id && x.date > existing.date && !x.entryId) : []
  useEffect(() => {
    if (!draft) return
    const s = existing ? { ...existing } : blank(draft)
    setF(s); setRate(String(s.rate)); setRepeat("0"); setScope("one")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const set = (patch: Partial<Shift>) => setF((x) => ({ ...x, ...patch }))
  const where = f.clientId || (f.place ? OTHER : "")
  const live = { ...f, rate: Math.max(0, parseFloat(rate) || 0) }
  const hours = shiftHours(live)
  const clash = draft ? clashes(data, { ...live, id: existing?.id ?? "" }) : []
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(f.date) && /^\d{2}:\d{2}$/.test(f.start) && /^\d{2}:\d{2}$/.test(f.end) && hours > 0 && (!!f.clientId || !!f.place?.trim())

  function save() {
    if (!valid) return
    const vals: Shift = { ...live, place: f.clientId ? undefined : f.place?.trim().slice(0, 80), notes: f.notes.trim().slice(0, 500) }
    if (existing) {
      const ids = new Set(scope === "later" ? later.map((x) => x.id) : [])
      commit((d) => {
        const s = d.shifts.find((x) => x.id === existing.id)
        if (s) Object.assign(s, vals, { id: s.id, created: s.created, entryId: s.entryId, gcalId: s.gcalId, gcalSent: s.gcalSent, series: s.series })
        // Later shifts in the repeat keep their own dates; everything else follows this one
        for (const x of d.shifts) if (ids.has(x.id)) Object.assign(x, { start: vals.start, end: vals.end, breakMins: vals.breakMins, clientId: vals.clientId, place: vals.place, pay: vals.pay, rate: vals.rate, notes: vals.notes })
      }, ids.size ? `${ids.size + 1} shifts updated ✓` : "Shift updated ✓")
    } else {
      const n = Number(repeat) || 1
      const now = new Date().toISOString()
      commit((d) => {
        const series = n > 1 ? uid() : undefined
        for (let i = 0; i < Math.max(1, n); i++) d.shifts.push({ ...vals, id: uid(), date: addDays(vals.date, i * 7), created: now, ...(series ? { series } : {}) })
      }, n > 1 ? `${n} shifts booked ✓` : "Shift booked ✓")
    }
    onClose()
  }
  async function remove() {
    if (!existing) return
    const gone = [existing, ...(scope === "later" ? later : [])]
    if (!(await ask({ title: gone.length > 1 ? `Delete ${gone.length} shifts?` : "Delete this shift?", message: gone.length > 1 ? `This shift on ${fmtDate(existing.date)} and the ${plural(later.length, "later one")} in the repeat. ${gone.some((x) => x.gcalId) ? "They’re taken out of Google Calendar too." : ""}` : `${placeName(data, existing)} on ${fmtDate(existing.date)}. ${existing.gcalId ? "It’s taken out of Google Calendar too." : ""}${existing.entryId ? " The log entry made from it stays." : ""}`, ok: "Delete", danger: true }))) return
    const ids = new Set(gone.map((x) => x.id))
    commit((d) => {
      d.shifts = d.shifts.filter((s) => !ids.has(s.id))
      for (const x of gone) if (x.gcalId) d.shiftCal.deletes.push(x.gcalId)
    }, gone.length > 1 ? `${gone.length} shifts deleted` : "Shift deleted", { undo: true })
    onClose()
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">{existing ? "Edit shift" : "Book a shift"}</DialogTitle>
          <DialogDescription>Work you’ve agreed to do. Once it’s done, add it to your log in one tap to invoice it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sh-where" className="text-[12.5px] font-normal text-muted-foreground">Where</Label>
            <Select value={where} onValueChange={(v) => set(v === OTHER ? { clientId: undefined, place: f.place || "" } : { clientId: v, place: "" })}>
              <SelectTrigger id="sh-where" className="h-11 bg-field text-[15px]"><SelectValue placeholder="Choose a pharmacy" /></SelectTrigger>
              <SelectContent>
                {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                <SelectItem value={OTHER}>Somewhere else…</SelectItem>
              </SelectContent>
            </Select>
            {where === OTHER && <Input aria-label="Place name" placeholder="e.g. Well Pharmacy, Harehills" maxLength={80} className="h-11 bg-field text-[15px]" value={f.place ?? ""} onChange={(e) => set({ place: e.target.value })} autoFocus />}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="sh-date" className="text-[12.5px] font-normal text-muted-foreground">Date</Label><Input id="sh-date" type="date" className="h-11 bg-field px-2 text-[14px]" value={f.date} onChange={(e) => set({ date: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="sh-start" className="text-[12.5px] font-normal text-muted-foreground">Starts</Label><Input id="sh-start" type="time" className="h-11 bg-field px-2 text-[14px]" value={f.start} onChange={(e) => set({ start: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="sh-end" className="text-[12.5px] font-normal text-muted-foreground">Ends</Label><Input id="sh-end" type="time" className="h-11 bg-field px-2 text-[14px]" value={f.end} onChange={(e) => set({ end: e.target.value })} /></div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-[12.5px] text-muted-foreground">Unpaid break</span>
            <Chips label="Unpaid break" value={String(f.breakMins)} options={BREAKS} onChange={(v) => set({ breakMins: Number(v) })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
            <div className="grid gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">Paid</span>
              <Chips<"hourly" | "fixed"> label="How it’s paid" value={f.pay} options={[["hourly", "By the hour"], ["fixed", "Fixed amount"]]} onChange={(v) => set({ pay: v })} />
            </div>
            <MoneyField id="sh-rate" label={f.pay === "hourly" ? "Rate per hour" : "Pay for the shift"} value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="grid gap-1.5"><Label htmlFor="sh-notes" className="text-[12.5px] font-normal text-muted-foreground">Notes (optional)</Label><Textarea id="sh-notes" rows={2} maxLength={500} placeholder="e.g. Booked through Locate a Locum, ask for keys at the back" className="bg-field text-[15px]" value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
          {!existing && (
            <div className="grid gap-1.5">
              <Label htmlFor="sh-repeat" className="text-[12.5px] font-normal text-muted-foreground">Repeat</Label>
              <Select value={repeat} onValueChange={setRepeat}>
                <SelectTrigger id="sh-repeat" className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
                <SelectContent>{REPEATS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="rounded-xl bg-secondary px-4 py-3 text-[14px]">
            <span className="num font-medium">{hours > 0 ? `${hoursText(hours)} paid · ${money(shiftPay(live))}` : "Check the start and end times"}</span>
            <span className="block text-[12.5px] text-muted-foreground">{timeText(f)}{repeat !== "0" && !existing ? ` · ${repeat} shifts, ${money(shiftPay(live) * Number(repeat))} in total` : ""}</span>
          </div>
          {existing && later.length > 0 && (
            <div className="grid gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">This shift is part of a weekly repeat. Apply changes to</span>
              <div role="radiogroup" aria-label="Apply changes to" className="flex flex-wrap gap-1.5">
                {([["one", "Just this shift"], ["later", `This and ${plural(later.length, "later one")}`]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={scope === k} onClick={() => setScope(k)}
                    className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${scope === k ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>{l}</button>
                ))}
              </div>
              {scope === "later" && <span className="text-[12px] text-muted-foreground">Later shifts keep their own dates. Shifts already in your log aren’t changed.</span>}
            </div>
          )}
          {clash.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-warn">
              <AlertTriangle className="mt-0.5 size-4 flex-none" />
              Overlaps {clash.map((c) => `${placeName(data, c)} (${fmtDate(c.date)}, ${timeText(c)})`).join(", ")}.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {existing ? <Button variant="ghost" className="text-danger-ink" onClick={remove}><Trash2 /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!valid}>{existing ? "Save changes" : repeat !== "0" ? `Book ${repeat} shifts` : "Book shift"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
