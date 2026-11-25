// Getting to a shift: how long it takes, when to leave, and one tap to open the route in a maps app.
import { useState } from "react"
import { Bus, Car, ExternalLink, Navigation } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isPostcode, tidyPostcode } from "@/lib/geo"
import { fmtDate, type Shift, type TravelMode } from "@/lib/model"
import { placeName, shiftTimes } from "@/lib/shifts"
import { EARLY_OPTIONS, destinationOf, earlyOf, hhmm, journeyMins, leaveBy, mapLinks, minsText, modeOf, originOf, tripKey } from "@/lib/trip"
import { cn } from "@/lib/utils"
import { useApp } from "./ctx"
import { Chips } from "./bits"

/** "42 min drive · leave by 08:10", or what's missing. For lists. */
export function useTravel(s: Shift) {
  const { data } = useApp()
  const mode = modeOf(data, s)
  const mins = journeyMins(data, s)
  const from = originOf(data, s), to = destinationOf(data, s).query
  const pending = mode === "drive" && !s.travelMins && !!from && !!to && s.trip?.key !== tripKey(from, to)
  const failed = mode === "drive" && !s.travelMins && s.trip?.key === tripKey(from, to) && !!s.trip?.failed
  const leave = mins !== null ? leaveBy(s, mins, earlyOf(data)) : null
  const text = !to ? "Add the pharmacy’s address to see the journey"
    : mins !== null ? `${minsText(mins)} ${mode === "drive" ? (s.travelMins ? "journey" : "drive") : "by public transport"} · leave by ${hhmm(leave!)}`
    : !from ? "Add your home postcode to see when to leave"
    : pending ? "Working out the journey…"
    : failed ? "Couldn’t estimate the drive: add your journey time"
    : "Public transport: add your usual journey time"
  return { mode, mins, leave, text, links: mapLinks(data, s), hasMins: mins !== null }
}

export function MapButtons({ s, size = "sm" }: { s: Shift; size?: "sm" | "default" }) {
  const { links } = useTravel(s)
  const where = placeName(useApp().data, s)
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size={size} variant="outline"><a href={links.google} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${where} in Google Maps`}><Navigation /> Google Maps</a></Button>
      {links.waze && <Button asChild size={size} variant="outline"><a href={links.waze} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${where} in Waze`}><ExternalLink /> Waze</a></Button>}
      <Button asChild size={size} variant="outline"><a href={links.apple} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${where} in Apple Maps`}><ExternalLink /> Apple Maps</a></Button>
    </div>
  )
}

/** The next shift's journey, with how they travel, how early they like to arrive, and their home postcode. */
export function GettingTherePanel({ s }: { s: Shift }) {
  const { data, commit } = useApp()
  const p = data.profile
  const t = useTravel(s)
  const [home, setHome] = useState(p.homePostcode || "")
  const [mins, setMins] = useState(s.travelMins ? String(s.travelMins) : "")
  const start = shiftTimes(s).start
  const setProfile = (patch: Partial<typeof p>, msg: string) => commit((d) => void Object.assign(d.profile, patch), msg)

  return (
    <section aria-labelledby="h-getting-there" className="grid gap-4 rounded-xl bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="h-getting-there" className="text-[13px] text-muted-foreground">Getting to your next shift</h2>
          <p className="mt-0.5 font-display text-[18px] font-medium leading-snug">{placeName(data, s)} · {fmtDate(s.date)}, {s.start}</p>
          <p className="text-[12.5px] text-muted-foreground">From {originOf(data, s) || "home (not set)"} to {destinationOf(data, s).full || "the pharmacy"}</p>
        </div>
        <div className={cn("rounded-xl px-4 py-2.5 text-right", t.hasMins ? "bg-primary/10" : "bg-secondary")}>
          <span className="block text-[12px] text-muted-foreground">Leave by</span>
          <span className="num font-display text-[26px] font-medium leading-none">{t.leave ? hhmm(t.leave) : "—"}</span>
          {t.mins !== null && <span className="block text-[12px] text-muted-foreground">{minsText(t.mins)} + {earlyOf(data)} min early</span>}
        </div>
      </div>
      {!t.hasMins && <p className="text-[13px] text-muted-foreground">{t.text}.</p>}

      <MapButtons s={s} />

      <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <span className="text-[12.5px] text-muted-foreground">I usually travel</span>
          <Chips<TravelMode> label="I usually travel" value={p.travelMode || "drive"} onChange={(v) => setProfile({ travelMode: v }, v === "drive" ? "Travel set to driving" : "Travel set to public transport")}
            options={[["drive", "By car"], ["transit", "Public transport"]]} />
        </div>
        <div className="grid gap-1.5">
          <span className="text-[12.5px] text-muted-foreground">Arrive early by</span>
          <Chips label="Arrive early by" value={String(earlyOf(data))} options={EARLY_OPTIONS} onChange={(v) => setProfile({ arriveEarly: Number(v) }, `You’ll arrive ${v} minutes early`)} />
        </div>
        <form className="grid gap-1.5" onSubmit={(e) => { e.preventDefault(); if (isPostcode(home)) setProfile({ homePostcode: tidyPostcode(home) }, "Home postcode saved") }}>
          <label htmlFor="gt-home" className="text-[12.5px] text-muted-foreground">Home postcode</label>
          <div className="flex gap-2">
            <Input id="gt-home" value={home} onChange={(e) => setHome(e.target.value)} placeholder="e.g. LS1 4AP" autoComplete="postal-code" className="h-10 bg-field" />
            <Button type="submit" variant="outline" disabled={!isPostcode(home) || tidyPostcode(home) === (p.homePostcode || "")}>Save</Button>
          </div>
        </form>
        <form className="grid gap-1.5" onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(mins)); commit((d) => { const x = d.shifts.find((y) => y.id === s.id); if (x) x.travelMins = n > 0 && n < 600 ? n : undefined }, n > 0 ? "Journey time saved" : "Using the estimate") }}>
          <label htmlFor="gt-mins" className="text-[12.5px] text-muted-foreground">Your journey time for this shift (minutes, optional)</label>
          <div className="flex gap-2">
            <Input id="gt-mins" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder={t.mode === "drive" && s.trip?.mins ? `Estimate ${s.trip.mins}` : "e.g. 45"} className="h-10 bg-field" />
            <Button type="submit" variant="outline">Save</Button>
          </div>
        </form>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t.mode === "drive" ? <><Car className="mr-1 inline size-3.5" aria-hidden />Drive times are estimates without traffic, so check the live route in your maps app before you set off{start.getHours() >= 7 && start.getHours() <= 9 ? ", especially at rush hour" : ""}.</>
          : <><Bus className="mr-1 inline size-3.5" aria-hidden />Public transport times change through the day, so check the live times in Google Maps or Apple Maps.</>}
        {" "}Places are looked up with postcodes.io, OpenStreetMap and OSRM; your name isn’t sent.
      </p>
    </section>
  )
}
