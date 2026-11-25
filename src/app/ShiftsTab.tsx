// Shifts: work that's booked, on a calendar, with what it should pay. Syncs to Google Calendar
// and exports a calendar file for Apple Calendar and other apps. Finished shifts go into the log in one tap.
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarCheck2, CalendarPlus, ChevronLeft, ChevronRight, Download, ExternalLink, MoreHorizontal, NotebookPen, Pencil, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { addDays, fmtDate, money, monthLabel, parseISO, plural, today, type Shift } from "@/lib/model"
import { GOOGLE_HELP, GoogleError, hasToken, listEvents, type GoogleEvent } from "@/lib/google"
import { saveFile } from "@/lib/store"
import {
  googleLink, logShift, hoursText, icsFile, monthGrid, needsSync, onDay, payText, placeName, shiftHours,
  shiftMonth, shiftPay, shiftTimes, thisMonth, timeText, toLog, totals, upcoming, weekStart,
} from "@/lib/shifts"
import { useApp } from "./ctx"
import { Callout, Empty, Ledger, Panel } from "./bits"
import { ShiftDialog, type ShiftDraft } from "./ShiftDialog"

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const dayLabel = (iso: string) => parseISO(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
const longDay = (iso: string) => parseISO(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })

export function ShiftsTab() {
  const { data, commit, google, connect, me, go, calendar } = useApp()
  const [month, setMonth] = useState(thisMonth())
  const [day, setDay] = useState(today())
  const [draft, setDraft] = useState<ShiftDraft | null>(null)
  const [showGoogle, setShowGoogle] = useState(false)
  const [gEvents, setGEvents] = useState<GoogleEvent[]>([])

  const now = new Date()
  const next = upcoming(data, now)
  const pending = toLog(data, now)
  const t0 = today()
  const wk = weekStart(t0)
  const week = totals(data, wk, addDays(wk, 6))
  const monthTot = totals(data, `${t0.slice(0, 7)}-01`, `${t0.slice(0, 7)}-31`)
  const four = totals(data, t0, addDays(t0, 27))
  const weeks = useMemo(() => monthGrid(month), [month])
  const connected = google.calendar === "ready"

  /* ---------- Google Calendar (synced from anywhere by useCalendarSync) ---------- */
  const { waiting, syncing, sync } = calendar

  // Google events for the weeks on screen
  useEffect(() => {
    if (!showGoogle || !hasToken("calendar")) return
    let live = true
    listEvents(weeks[0][0], weeks[weeks.length - 1][6], me.email).then((ev) => live && setGEvents(ev)).catch((e) => live && toast.error(e instanceof GoogleError ? GOOGLE_HELP[e.kind] : "Couldn’t load your Google Calendar."))
    return () => { live = false }
  }, [showGoogle, weeks, me.email])
  async function toggleGoogle(on: boolean) {
    if (on && !hasToken("calendar") && !(await connect("calendar"))) return
    setShowGoogle(on)
    if (!on) setGEvents([])
  }
  const eventsOn = (date: string) => gEvents.filter((e) => e.date <= date && (e.allDay ? e.endDate > date : e.endDate >= date))

  function exportIcs() {
    if (!next.length) return toast("No upcoming shifts to export yet.")
    saveFile(`kasa-shifts-${t0}.ics`, new Blob([icsFile(data, next)], { type: "text/calendar;charset=utf-8" }))
    toast.success(`${plural(next.length, "shift")} saved. Open the file to add them to your calendar ✓`)
  }
  const addToLog = (ids: string[]) => commit((d) => ids.forEach((id) => logShift(d, id)), ids.length > 1 ? `${ids.length} shifts added to your log ✓` : "Added to your log, ready to invoice ✓")

  const selected = onDay(data, day)

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-[22px] font-medium">Shifts</h1>
          <p className="max-w-xl text-[14px] text-muted-foreground">Work you’ve booked and what it should pay. It goes in your calendar now and into your log once it’s done.</p>
        </div>
        <Button onClick={() => setDraft({ date: day >= t0 ? day : t0 })}><Plus /> Book a shift</Button>
      </div>

      <Ledger cells={[
        { label: "Next shift", value: next[0] ? dayLabel(next[0].date) : "None booked", sub: next[0] ? `${next[0].start} · ${placeName(data, next[0])}` : "Book one to see it here" },
        { label: "This week", value: money(week.pay), sub: week.count ? `${plural(week.count, "shift")} · ${hoursText(Math.round(week.hours * 10) / 10)}` : "Nothing booked" },
        { label: "This month", value: money(monthTot.pay), sub: `${plural(monthTot.count, "shift")} in ${monthLabel(t0.slice(0, 7)).split(" ")[0]}` },
        { label: "Next 4 weeks", value: money(four.pay), sub: four.count ? `${plural(four.count, "shift")} booked` : "Nothing booked" },
      ]} />

      {pending.length > 0 && (
        <Callout>
          <span><b>{plural(pending.length, "finished shift")}</b> not in your log yet. Add {pending.length === 1 ? "it" : "them"} so {pending.length === 1 ? "it" : "they"} can be invoiced.</span>
          <span className="flex flex-wrap gap-2">
            {pending.length > 1 && <Button size="sm" variant="outline" className="border-current bg-transparent" onClick={() => addToLog(pending.map((s) => s.id))}>Add all {pending.length}</Button>}
            <Button size="sm" variant="outline" className="border-current bg-transparent" onClick={() => { setMonth(pending[0].date.slice(0, 7)); setDay(pending[0].date) }}>Review</Button>
          </span>
        </Callout>
      )}

      <Panel title={monthLabel(month)} aside={
        <span className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-8" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setMonth(thisMonth()); setDay(t0) }}>Today</Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></Button>
        </span>
      }>
        <div className="-mx-2 sm:mx-0" role="grid" aria-label={`Shifts in ${monthLabel(month)}`}>
          <div className="grid grid-cols-7 pb-1 text-center text-[11.5px] font-medium text-muted-foreground" role="row">
            {DOW.map((d) => <div key={d} role="columnheader">{d}</div>)}
          </div>
          {weeks.map((w) => (
            <div key={w[0]} className="grid grid-cols-7 gap-[2px] pb-[2px]" role="row">
              {w.map((date) => {
                const list = onDay(data, date)
                const ev = eventsOn(date)
                const inMonth = date.startsWith(month)
                const pay = list.reduce((a, s) => a + shiftPay(s), 0)
                return (
                  // Tap empty space on a day to book a shift there; tap a shift to change it.
                  // On phones the shifts are dots, so a day that has shifts opens its list below instead.
                  <div key={date} role="gridcell" tabIndex={0} aria-selected={day === date}
                    aria-label={`${longDay(date)}: ${list.length ? `${plural(list.length, "shift")}, ${money(pay)}` : "no shifts"}${ev.length ? `, ${plural(ev.length, "other event")}` : ""}. Press Enter to book a shift.`}
                    onClick={() => { setDay(date); if (!list.length || window.matchMedia("(min-width: 640px)").matches) setDraft({ date }) }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDay(date); setDraft({ date }) } }}
                    className={cn(
                      "flex min-h-[54px] min-w-0 cursor-pointer flex-col items-stretch gap-0.5 rounded-lg p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[92px] sm:p-1.5",
                      day === date ? "bg-secondary" : "hover:bg-secondary/60",
                      !inMonth && "text-muted-foreground",
                    )}>
                    <span className={cn("num flex size-6 items-center justify-center self-center rounded-full text-[12.5px] sm:self-start", date === t0 && "bg-primary font-semibold text-primary-foreground")}>{Number(date.slice(8))}</span>
                    {/* Phones: a dot per shift. Wider screens: time and place, each one tappable. */}
                    <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                      {list.slice(0, 3).map((s) => <span key={s.id} className={cn("size-1.5 rounded-full", s.entryId ? "bg-ok-ink" : "bg-primary")} />)}
                      {ev.slice(0, 2).map((e) => <span key={e.id} className="size-1.5 rounded-full bg-muted-foreground/50" />)}
                    </span>
                    <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                      {list.slice(0, 2).map((s) => (
                        <button key={s.id} type="button" aria-label={`Change ${placeName(data, s)}, ${s.start}`}
                          onClick={(e) => { e.stopPropagation(); setDay(date); setDraft({ ...s }) }}
                          className={cn("truncate rounded px-1 py-0.5 text-left text-[11px] font-medium leading-tight hover:ring-1 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", s.entryId ? "bg-ok-tint text-ok-ink" : "bg-primary/15 text-foreground")}>
                          {s.start} {placeName(data, s)}
                        </button>
                      ))}
                      {ev.slice(0, list.length >= 2 ? 0 : 2 - list.length).map((e) => <span key={e.id} className="truncate rounded border border-dashed border-border px-1 text-[11px] leading-tight text-muted-foreground">{e.allDay ? "" : e.start + " "}{e.title}</span>)}
                      {list.length + ev.length > 2 && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setDay(date) }} className="rounded px-1 text-left text-[11px] text-muted-foreground hover:text-foreground">+{list.length + ev.length - 2} more</button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground" aria-label="Key">
          <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Booked</li>
          <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok-ink" />In your log</li>
          {showGoogle && <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/50" />Google Calendar</li>}
          <li className="ml-auto hidden sm:block">Click a day to book · click a shift to change it</li>
          <li className="w-full sm:hidden">Tap an empty day to book · tap a day with shifts to see and change them below</li>
        </ul>

        <div className="mt-5 border-t pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-medium">{longDay(day)}</h3>
            <Button size="sm" variant="outline" onClick={() => setDraft({ date: day })}><Plus /> Book on this day</Button>
          </div>
          {!selected.length && !eventsOn(day).length && <p className="py-3 text-[13.5px] text-muted-foreground">Nothing booked.</p>}
          <ul className="divide-y">
            {selected.map((s) => <ShiftRow key={s.id} s={s} onEdit={() => setDraft({ ...s })} onLog={() => addToLog([s.id])} />)}
            {eventsOn(day).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-[88px] flex-none text-[13px] text-muted-foreground">{e.allDay ? "All day" : `${e.start}–${e.end}`}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">{e.title} <span className="text-[12px] text-muted-foreground">· Google Calendar</span></span>
                {!e.allDay && <Button size="sm" variant="ghost" onClick={() => setDraft({ date: e.date, start: e.start, end: e.end, place: e.title.slice(0, 80), breakMins: 0 })}><CalendarPlus /> Make it a shift</Button>}
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title="Coming up" aside={next.length ? `${plural(next.length, "shift")} · ${money(next.reduce((a, s) => a + shiftPay(s), 0))}` : undefined}>
        {!next.length ? (
          <Empty title="No shifts booked">
            <p className="mb-4">Add the shifts you’ve agreed to, with the rate, and see what’s coming in.</p>
            <Button size="sm" onClick={() => setDraft({ date: t0 })}><Plus /> Book a shift</Button>
          </Empty>
        ) : (
          <ul className="divide-y">
            {next.slice(0, 12).map((s) => <ShiftRow key={s.id} s={s} withDate onEdit={() => setDraft({ ...s })} onLog={() => addToLog([s.id])} />)}
          </ul>
        )}
        {next.length > 12 && <p className="mt-3 text-[12.5px] text-muted-foreground">And {plural(next.length - 12, "more shift")}: see them on the calendar.</p>}
      </Panel>

      <Panel title="Your calendars">
        <div className="grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="grid content-start gap-3">
            <h3 className="flex items-center gap-2 text-[14.5px] font-medium">Google Calendar {connected ? <span className="text-[12px] font-normal text-ok-ink">Connected</span> : null}</h3>
            {google.calendar === "unavailable" ? (
              <p className="text-[13.5px] text-muted-foreground">Not set up on this site. Use the links on each shift or the calendar file instead.</p>
            ) : (
              <>
                <label className="flex items-center justify-between gap-4 text-[14px]">
                  <span>Add my shifts automatically<span className="block text-[12.5px] text-muted-foreground">New, changed and deleted shifts are kept in step with your Google Calendar.</span></span>
                  <Switch checked={data.shiftCal.sync} onCheckedChange={(v) => commit((d) => void (d.shiftCal.sync = v), v ? "Shifts will go to Google Calendar ✓" : "Turned off")} />
                </label>
                <label className="flex items-center justify-between gap-4 text-[14px]">
                  <span>Show my Google events here<span className="block text-[12.5px] text-muted-foreground">See what else is on before you book, and turn an event into a shift.</span></span>
                  <Switch checked={showGoogle} onCheckedChange={toggleGoogle} />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={waiting ? "default" : "outline"} disabled={syncing} onClick={() => sync(true)}>
                    {connected ? <RefreshCw className={cn(syncing && "animate-spin")} /> : <CalendarCheck2 />}
                    {!connected ? "Connect Google Calendar" : syncing ? "Updating…" : waiting ? `Update Google Calendar (${waiting})` : "Check Google Calendar"}
                  </Button>
                  {waiting > 0 && !syncing && <span className="text-[12.5px] text-muted-foreground">{plural(waiting, "change")} not sent yet</span>}
                </div>
              </>
            )}
          </div>
          <div className="grid content-start gap-3">
            <h3 className="text-[14.5px] font-medium">Apple Calendar and other apps</h3>
            <p className="text-[13.5px] text-muted-foreground">Download your upcoming shifts as a calendar file and open it to add them to Apple Calendar or another calendar app. Download it again after you book more, and import only the new ones.</p>
            <div><Button size="sm" variant="outline" onClick={exportIcs}><Download /> Download upcoming shifts (.ics)</Button></div>
          </div>
        </div>
      </Panel>

      <p className="px-1 text-[12.5px] text-muted-foreground">
        Pay shown is before tax and expenses. Once a shift is in your log it’s invoiced like any other work, from the <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => go("invoices")}>Invoices</button> tab.
      </p>

      <ShiftDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  )
}

function ShiftRow({ s, withDate, onEdit, onLog }: { s: Shift; withDate?: boolean; onEdit: () => void; onLog: () => void }) {
  const { data, go } = useApp()
  const done = shiftTimes(s).end <= new Date()
  const synced = !!s.gcalId && !needsSync(data, s)
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {withDate && (
          <span className="flex w-12 flex-none flex-col items-center rounded-lg bg-secondary py-1 leading-tight">
            <span className="text-[11px] uppercase text-muted-foreground">{parseISO(s.date).toLocaleDateString("en-GB", { weekday: "short" })}</span>
            <span className="num font-display text-[17px] font-medium">{Number(s.date.slice(8))}</span>
            <span className="text-[10.5px] text-muted-foreground">{parseISO(s.date).toLocaleDateString("en-GB", { month: "short" })}</span>
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{placeName(data, s)}</span>
          <span className="block text-[12.5px] leading-snug text-muted-foreground">
            {timeText(s)} · {hoursText(Math.round(shiftHours(s) * 100) / 100)} · {payText(s)}{synced ? " · in Google Calendar" : ""}
          </span>
        </span>
        <span className="num whitespace-nowrap text-[14.5px]">{money(shiftPay(s))}</span>
      </button>
      {done && !s.entryId && <Button size="sm" variant="outline" onClick={onLog}><NotebookPen /> Add to log</Button>}
      {s.entryId && <Button size="sm" variant="ghost" className="text-ok-ink" onClick={() => go("log")}>In log</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`More for ${placeName(data, s)} on ${fmtDate(s.date)}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}><Pencil /> Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><a href={googleLink(data, s)} target="_blank" rel="noopener noreferrer"><ExternalLink /> Add to Google Calendar</a></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => saveFile(`shift-${s.date}.ics`, new Blob([icsFile(data, [s])], { type: "text/calendar;charset=utf-8" }))}><Download /> Calendar file (.ics)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
