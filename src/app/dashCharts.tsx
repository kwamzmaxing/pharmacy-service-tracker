// Dashboard pieces: stat cards with sparklines, a line chart with hover, and a bar list.
// Colours come from the validated series and categorical tokens in index.css; text stays in text tokens.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Change against the previous period, as a whole-number percentage (null when there's nothing to compare). */
export function pctChange(now: number, before: number): number | null {
  if (before <= 0) return now > 0 ? null : 0
  return Math.round(((now - before) / before) * 1000) / 10
}

/** A tiny trend line under a stat. Decorative: the number beside it carries the meaning. */
export function Sparkline({ values, color = "var(--series-logged)", className }: { values: number[]; color?: string; className?: string }) {
  const w = 120, h = 36, pad = 3
  if (values.length < 2 || values.every((v) => v === 0)) return <div className={cn("h-9", className)} aria-hidden />
  const max = Math.max(...values), min = Math.min(0, ...values)
  const x = (i: number) => pad + (i * (w - pad * 2)) / (values.length - 1)
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-9 w-full", className)} aria-hidden>
      <path d={`${line} L${x(values.length - 1)},${h} L${x(0)},${h} Z`} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** "+12.5%" / "−3%" with an arrow, so the direction never relies on colour alone. */
export function Change({ value, goodWhenUp = true, label = "vs last month" }: { value: number | null; goodWhenUp?: boolean; label?: string }) {
  if (value === null) return <span className="text-[12px] text-muted-foreground">New this period</span>
  const up = value > 0, flat = value === 0
  const good = flat ? null : up === goodWhenUp
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
        good === null ? "bg-secondary text-foreground" : good ? "bg-ok-tint text-ok-ink" : "bg-danger-tint text-danger-ink")}>
        {!flat && (up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />)}
        {flat ? "No change" : `${up ? "+" : "−"}${Math.abs(value)}%`}
      </span>
      {label}
    </span>
  )
}

/** A headline number with an optional change and sparkline. */
export function StatCard({ label, value, foot, spark, sparkColor, onClick, alert }: {
  label: string; value: string; foot?: ReactNode; spark?: number[]; sparkColor?: string; onClick?: () => void; alert?: boolean
}) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl bg-card p-4 text-left sm:p-5", onClick && "transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", alert && "bg-danger-tint hover:bg-danger-tint/80")}>
      <span className="text-[12.5px] leading-snug text-muted-foreground">{label}</span>
      <span className={cn("num font-display text-[clamp(20px,5vw,26px)] font-medium leading-tight", alert && "text-danger-ink")}>{value}</span>
      {foot}
      {spark && <Sparkline values={spark} color={sparkColor} className="mt-1" />}
    </Tag>
  )
}

export type LineSeries = { key: string; label: string; color: string }
export type LinePoint = { label: string; long?: string; values: Record<string, number> }
function niceMax(v: number) {
  if (v <= 0) return 10
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}
/**
 * Lines over time on one axis, with a crosshair and tooltip on hover or tap, a legend for 2+ series,
 * and a table view. The first series gets a soft area fill.
 */
export function LineChart({ points, series, format, axis, ariaLabel, empty }: {
  points: LinePoint[]; series: LineSeries[]; format: (v: number) => string; axis: (v: number) => string; ariaLabel: string; empty?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [table])
  const h = 210, padL = 46, padR = 10, padT = 12, padB = 26
  const max = niceMax(Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] || 0))))
  const plotW = Math.max(120, w - padL - padR)
  const x = (i: number) => padL + (points.length <= 1 ? plotW / 2 : (i * plotW) / (points.length - 1))
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / max)
  const path = (k: string) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.values[k] || 0).toFixed(1)}`).join(" ")
  const isEmpty = points.every((p) => series.every((s) => !p.values[s.key]))
  const step = Math.ceil(points.length / Math.max(2, Math.floor(plotW / 56)))

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground" aria-label="Legend">
            {series.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded-full" style={{ background: s.color }} />{s.label}</li>)}
          </ul>
        ) : <span />}
        <button type="button" className="text-[12.5px] font-semibold text-brand-ink hover:underline" onClick={() => setTable(!table)} aria-pressed={table}>{table ? "Show chart" : "Show as table"}</button>
      </div>
      {table ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground"><th className="py-1.5 font-bold">Period</th>{series.map((s) => <th key={s.key} className="py-1.5 text-right font-bold">{s.label}</th>)}</tr></thead>
            <tbody className="divide-y">{points.map((p) => <tr key={p.label + (p.long || "")}><td className="py-1.5">{p.long || p.label}</td>{series.map((s) => <td key={s.key} className="num py-1.5 text-right">{format(p.values[s.key] || 0)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {[0, max / 2, max].map((t) => (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-muted-foreground text-[11px]">{axis(t)}</text>
              </g>
            ))}
            {!isEmpty && series[0] && <path d={`${path(series[0].key)} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={series[0].color} opacity={0.1} />}
            {!isEmpty && series.map((s) => <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
            {points.map((p, i) => (i % step === 0 || i === points.length - 1) && <text key={i} x={x(i)} y={h - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{p.label}</text>)}
            {hover !== null && !isEmpty && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" />
                {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(points[hover].values[s.key] || 0)} r={4.5} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />)}
              </g>
            )}
            {points.map((_, i) => {
              const half = points.length <= 1 ? plotW / 2 : plotW / (points.length - 1) / 2
              return <rect key={i} x={x(i) - half} y={0} width={half * 2} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />
            })}
          </svg>
          {isEmpty && <p className="pointer-events-none absolute inset-x-0 top-16 text-center text-[13px] text-muted-foreground">{empty || "Nothing to show yet."}</p>}
          {hover !== null && !isEmpty && (
            <div role="status" className="pointer-events-none absolute top-0 z-10 w-max min-w-[150px] max-w-[240px] -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-[12.5px] shadow-md"
              style={{ left: Math.min(Math.max(x(hover), 84), w - 84) }}>
              <div className="mb-1 font-semibold">{points[hover].long || points[hover].label}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground"><span className="h-[3px] w-3 flex-none rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="num font-semibold">{format(points[hover].values[s.key] || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export type Column = { label: string; long?: string; value: number; note?: string }
/**
 * Monthly totals as columns on one axis (magnitude per period), with a dashed average line,
 * a hover/tap tooltip, and a table view. One series, so one colour.
 */
export function ColumnChart({ points, format, axis, ariaLabel, empty, avgLabel = "Monthly average" }: {
  points: Column[]; format: (v: number) => string; axis: (v: number) => string; ariaLabel: string; empty?: string; avgLabel?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [table])
  const h = 230, padL = 46, padR = 10, padT = 16, padB = 26
  const isEmpty = points.every((p) => !p.value)
  const avg = points.length ? points.reduce((a, p) => a + p.value, 0) / points.length : 0
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const plotW = Math.max(120, w - padL - padR)
  const slot = plotW / Math.max(1, points.length)
  const barW = Math.max(3, Math.min(40, slot - 2 * Math.max(2, slot * 0.18)))
  const cx = (i: number) => padL + slot * (i + 0.5)
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / max)
  const step = Math.ceil(points.length / Math.max(2, Math.floor(plotW / 48)))
  const bar = (i: number, v: number) => {
    const x0 = cx(i) - barW / 2, top = y(v), base = y(0), r = Math.min(4, barW / 2, base - top)
    if (base - top < 0.5) return ""
    return `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {!isEmpty && <><span className="w-3.5 border-t-2 border-dashed border-muted-foreground" aria-hidden />{avgLabel}: <span className="num font-medium text-foreground">{format(avg)}</span></>}
        </span>
        <button type="button" className="text-[12.5px] font-semibold text-brand-ink hover:underline" onClick={() => setTable(!table)} aria-pressed={table}>{table ? "Show chart" : "Show as table"}</button>
      </div>
      {table ? (
        <div className="max-h-[280px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground"><th className="py-1.5 font-bold">Month</th><th className="py-1.5 text-right font-bold">Revenue</th></tr></thead>
            <tbody className="divide-y">{points.map((p) => <tr key={p.long || p.label}><td className="py-1.5">{p.long || p.label}{p.note ? ` (${p.note})` : ""}</td><td className="num py-1.5 text-right">{format(p.value)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {[0, max / 2, max].map((t) => (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-muted-foreground text-[11px]">{axis(t)}</text>
              </g>
            ))}
            {!isEmpty && points.map((p, i) => <path key={i} d={bar(i, p.value)} fill="var(--series-logged)" opacity={hover === null || hover === i ? 1 : 0.45} />)}
            {!isEmpty && <line x1={padL} x2={w - padR} y1={y(avg)} y2={y(avg)} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 4" />}
            {points.map((p, i) => (i % step === 0 || i === points.length - 1) && <text key={i} x={cx(i)} y={h - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{p.label}</text>)}
            {points.map((_, i) => <rect key={i} x={cx(i) - slot / 2} y={0} width={slot} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />)}
          </svg>
          {isEmpty && <p className="pointer-events-none absolute inset-x-0 top-16 text-center text-[13px] text-muted-foreground">{empty || "Nothing to show yet."}</p>}
          {hover !== null && !isEmpty && (
            <div role="status" className="pointer-events-none absolute z-10 w-max min-w-[140px] max-w-[240px] -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-[12.5px] shadow-md"
              style={{ left: Math.min(Math.max(cx(hover), 78), w - 78), top: Math.max(0, y(points[hover].value) - 64) }}>
              <div className="font-semibold">{points[hover].long || points[hover].label}</div>
              <div className="num mt-0.5 font-semibold">{format(points[hover].value)}</div>
              <div className="text-muted-foreground">{points[hover].note || (avg > 0 ? `${points[hover].value >= avg ? "Above" : "Below"} the average` : "")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Horizontal bars for ranked counts (one series, so one colour; labels and values in text ink). */
export function BarList({ rows, format = (v) => String(v), color = "var(--series-logged)", empty }: {
  rows: { label: string; value: number; note?: string }[]; format?: (v: number) => string; color?: string; empty?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="text-[13px] text-muted-foreground">{empty || "Nothing yet."}</p>
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="min-w-0 truncate">{r.label}</span>
          <span className="num font-medium">{format(r.value)}</span>
          {r.note && <span className="col-span-2 -mt-1 text-[12px] text-muted-foreground">{r.note}</span>}
          <span className="col-span-2 h-[6px] overflow-hidden rounded-full bg-secondary" aria-hidden>
            {r.value > 0 && <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Activity feed rows. */
export type Activity = { id: string; at: string; icon: ReactNode; text: ReactNode; sub?: string }
export function ActivityList({ items, empty }: { items: Activity[]; empty: string }) {
  if (!items.length) return <p className="text-[13px] text-muted-foreground">{empty}</p>
  return (
    <ul className="grid divide-y divide-border/60">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 text-[13.5px]">
          <span className="mt-0.5 flex size-7 flex-none items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-[15px]" aria-hidden>{a.icon}</span>
          <span className="min-w-0 flex-1 leading-snug">{a.text}{a.sub && <span className="block text-[12px] text-muted-foreground">{a.sub}</span>}</span>
          <span className="whitespace-nowrap text-[12px] text-muted-foreground">{ago(a.at)}</span>
        </li>
      ))}
    </ul>
  )
}
/** "2h ago", "Yesterday", "3d ago", or a date. */
export function ago(iso: string) {
  const t = new Date(iso.length === 10 ? iso + "T12:00:00" : iso).getTime()
  const s = (Date.now() - t) / 1000
  if (iso.length === 10) {
    const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(iso + "T00:00:00").getTime()) / 86_400_000)
    if (days <= 0) return days < 0 ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Today"
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days}d ago`
    return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  }
  if (s < 60) return "Just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
