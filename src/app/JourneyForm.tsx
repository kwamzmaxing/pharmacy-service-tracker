import { lazy, Suspense, useMemo, useState } from "react"
import { ArrowDownUp, Car, Home, MapPin, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { fmtDate, money, plural, postcodeIn, today, uid, unitOf, type Data, type Journey, type Place } from "@/lib/model"
import { drivingRoute, findPlace, GeoError, isPostcode, tidyPostcode, type Route } from "@/lib/geo"
import { useApp } from "./ctx"
import { Field, MoneyField } from "./bits"

const RouteMap = lazy(() => import("./RouteMap"))

/** Mileage service used for journeys; created if the tracker doesn't have one. */
export function mileageService(d: Data) {
  let s = d.services.find((x) => unitOf(x) === "mile")
  if (!s) d.services.push((s = { id: uid(), name: "Mileage", fee: 0.5, unit: "mile" }))
  return s
}
const sameQuery = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function JourneyForm() {
  const { data, commit } = useApp()
  const p = data.profile
  const mile = data.services.find((x) => unitOf(x) === "mile")
  const lastClient = (data.meta.lastClientId as string | undefined) ?? ""

  const [from, setFrom] = useState(p.homePostcode || "")
  const [to, setTo] = useState("")
  const [returnTrip, setReturnTrip] = useState(true)
  const [clientId, setClientId] = useState(data.clients.some((c) => c.id === lastClient) ? lastClient : "")
  const [date, setDate] = useState(today())
  const [rate, setRate] = useState(String(mile?.fee ?? 0.5))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [result, setResult] = useState<{ from: Place; to: Place; route: Route; journeyId?: string } | null>(null)

  // Places you can pick by name: home and every saved pharmacy with a postcode in its address
  const known = useMemo(() => {
    const list: { name: string; query: string; clientId?: string }[] = []
    if (p.homePostcode) list.push({ name: "Home", query: p.homePostcode })
    for (const c of data.clients) {
      const pc = postcodeIn(c.address)
      if (pc) list.push({ name: c.name, query: pc, clientId: c.id })
    }
    return list
  }, [p.homePostcode, data.clients])
  const resolve = (text: string) => known.find((k) => sameQuery(k.name, text) || sameQuery(k.query, text))

  const saved = [...data.journeys].sort((a, b) => (b.lastUsed || b.created).localeCompare(a.lastUsed || a.created))
  const oneWay = result?.route.miles ?? 0
  const total = Math.round(oneWay * (returnTrip ? 2 : 1) * 10) / 10
  const amount = total * (parseFloat(rate) || 0)

  async function calculate(e?: React.FormEvent) {
    e?.preventDefault()
    setErr("")
    if (!from.trim() || !to.trim()) return setErr("Enter where you started and where you went.")
    setBusy(true)
    try {
      const kf = resolve(from), kt = resolve(to)
      const [a, b] = await Promise.all([findPlace(kf?.query ?? from, kf?.name), findPlace(kt?.query ?? to, kt?.name)])
      const route = await drivingRoute(a, b)
      setResult({ from: a, to: b, route })
      if (kt?.clientId) setClientId(kt.clientId)
    } catch (x) {
      setErr(x instanceof GeoError ? x.message : "Couldn’t work out the route. Check your connection and try again.")
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  function useSaved(j: Journey) {
    setFrom(j.from.label === "Home" ? j.from.query : j.from.label)
    setTo(j.to.label)
    setReturnTrip(j.returnTrip)
    if (j.clientId && data.clients.some((c) => c.id === j.clientId)) setClientId(j.clientId)
    setResult({ from: j.from, to: j.to, route: { miles: j.miles, minutes: j.minutes, path: j.path ?? [[j.from.lat, j.from.lng], [j.to.lat, j.to.lng]], approximate: !!j.approximate }, journeyId: j.id })
    setErr("")
  }

  function addToLog() {
    if (!result || !total) return
    const r = result
    const fee = Math.max(0, parseFloat(rate) || 0)
    commit((d) => {
      const svc = mileageService(d)
      const now = new Date().toISOString()
      // Save (or refresh) the journey so it's one tap next time
      let j = d.journeys.find((x) => x.id === r.journeyId) ?? d.journeys.find((x) => sameQuery(x.from.query, r.from.query) && sameQuery(x.to.query, r.to.query))
      if (!j) {
        j = { id: uid(), from: r.from, to: r.to, miles: r.route.miles, minutes: r.route.minutes, returnTrip, path: r.route.path, approximate: r.route.approximate, clientId: clientId || undefined, created: now, uses: 0 }
        d.journeys.push(j)
      }
      Object.assign(j, { returnTrip, lastUsed: now, uses: (j.uses || 0) + 1, ...(clientId ? { clientId } : {}) })
      d.entries.push({
        id: uid(), serviceId: svc.id, date, qty: total, fee, invoiced: false, journeyId: j.id,
        desc: `${r.from.label} → ${r.to.label}${returnTrip ? " and back" : ""}`,
        ...(clientId ? { clientId } : {}),
      })
      if (clientId) d.meta.lastClientId = clientId
    }, `Added ${plural(total, "mile")} (${money(amount)}) to your log ✓`)
    setResult(null)
    setTo("")
  }

  const fromIsNewHome = isPostcode(from) && tidyPostcode(from) !== (p.homePostcode || "")

  return (
    <div className="grid gap-4">
      {saved.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-normal text-muted-foreground">Saved journeys</span>
          <div className="flex flex-wrap gap-1.5">
            {saved.slice(0, 6).map((j) => (
              <button key={j.id} type="button" onClick={() => useSaved(j)}
                className={cn("flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[12.5px] transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  result?.journeyId === j.id ? "border-primary bg-accent text-accent-foreground" : "bg-card")}>
                <Car className="size-3.5 flex-none text-muted-foreground" />
                <span className="truncate font-semibold">{j.from.label} → {j.to.label}</span>
                <span className="num flex-none text-muted-foreground">{j.miles * (j.returnTrip ? 2 : 1)} mi</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={calculate} className="grid gap-3">
        <datalist id="known-places">{known.map((k) => <option key={k.name + k.query} value={k.name}>{k.query}</option>)}</datalist>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field id="j-from" label="From" placeholder="Postcode or place, e.g. LS1 4AP" list="known-places" autoComplete="off" value={from} onChange={(e) => { setFrom(e.target.value); setResult(null) }} />
          <Button type="button" variant="ghost" size="icon" className="hidden text-muted-foreground sm:flex" aria-label="Swap from and to" onClick={() => { setFrom(to); setTo(from); setResult(null) }}><ArrowDownUp className="rotate-90" /></Button>
          <Field id="j-to" label="To" placeholder="Pharmacy name or postcode" list="known-places" autoComplete="off" value={to} onChange={(e) => { setTo(e.target.value); setResult(null) }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="j-return" className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox id="j-return" checked={returnTrip} onCheckedChange={(v) => setReturnTrip(v === true)} />
            Return journey (count it both ways)
          </label>
          {fromIsNewHome && (
            <button type="button" className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-ink hover:underline"
              onClick={() => commit((d) => void (d.profile.homePostcode = tidyPostcode(from)), "Saved as your home postcode")}>
              <Home className="size-3.5" /> Use {tidyPostcode(from)} as home
            </button>
          )}
        </div>
        {err && <p role="alert" className="text-[13px] text-danger-ink">{err}</p>}
        {!result && <div><Button type="submit" disabled={busy} className="h-11 px-6"><MapPin /> {busy ? "Working out the route…" : "Calculate miles"}</Button></div>}
      </form>

      {result && (
        <div className="grid gap-4 rounded-lg border bg-field p-3 sm:p-4">
          <Suspense fallback={<div className="h-[220px] animate-pulse rounded-lg bg-secondary sm:h-[260px]" />}>
            <RouteMap path={result.route.path} from={result.from.label} to={result.to.label} />
          </Suspense>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div>
              <div className="num font-display text-[28px] font-medium leading-none">{plural(total, "mile")}</div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">
                {result.from.label} → {result.to.label} · {result.route.miles} mi each way{returnTrip ? ", there and back" : ""}
                {result.route.minutes ? ` · about ${result.route.minutes} min drive` : ""}
              </div>
            </div>
            <div className="num text-[15px] font-bold">{money(amount)}</div>
          </div>
          {result.route.approximate && (
            <p className="rounded-md bg-warn-tint px-3 py-2 text-[12.5px] text-warn">The road route couldn’t be fetched, so this is an estimate from the straight-line distance. Check it before adding.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="j-date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
            <MoneyField id="j-rate" label="Rate per mile" value={rate} onChange={(e) => setRate(e.target.value)} />
            {data.clients.length > 0 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="j-client" className="text-[12.5px] font-normal text-muted-foreground">Pharmacy</Label>
                <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
                  <SelectTrigger id="j-client" className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    <SelectItem value="none">Not for a particular pharmacy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : <div />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 px-6" onClick={addToLog}>Add {plural(total, "mile")} to log</Button>
            <Button variant="ghost" className="h-11" onClick={() => setResult(null)}>Change journey</Button>
          </div>
          <p className="text-[12px] text-muted-foreground">Adding saves this journey, so next time it’s one tap. The miles go on your next invoice to that pharmacy, and count towards your HMRC mileage allowance on the Tax tab.</p>
        </div>
      )}

      {saved.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer font-semibold text-muted-foreground">Manage saved journeys ({saved.length})</summary>
          <ul className="mt-2 divide-y">
            {saved.map((j) => (
              <li key={j.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{j.from.label} → {j.to.label}</span>
                  <span className="text-[12px] text-muted-foreground">{j.miles} mi each way · used {plural(j.uses || 0, "time")}{j.lastUsed ? `, last on ${fmtDate(j.lastUsed.slice(0, 10))}` : ""}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label={`Delete ${j.from.label} to ${j.to.label}`} className="text-muted-foreground hover:text-danger-ink"
                  onClick={() => commit((d) => void (d.journeys = d.journeys.filter((x) => x.id !== j.id)), "Journey removed")}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
