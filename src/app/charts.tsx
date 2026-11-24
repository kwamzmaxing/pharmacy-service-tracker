import { useEffect, useRef, useState } from "react"
import { money, type MonthPoint } from "@/lib/model"

const SERIES = [
  { key: "logged", label: "Work logged", color: "var(--series-logged)" },
  { key: "paid", label: "Paid for so far", color: "var(--series-paid)" },
] as const

function niceMax(v: number) {
  if (v <= 0) return 100
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}
const short = (v: number) => (v >= 1000 ? `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${Math.round(v)}`)

/** Per month worked: work logged vs how much of it has been paid for. Grouped bars, one y-axis, hover for exact values. */
export function MonthlyBars({ points }: { points: MonthPoint[] }) {
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
  }, [])

  const h = 200, padL = 44, padR = 8, padT = 10, padB = 26
  const max = niceMax(Math.max(...points.flatMap((p) => [p.logged, p.paid])))
  const ticks = [0, max / 2, max]
  const plotW = Math.max(120, w - padL - padR)
  const band = plotW / points.length
  const barW = Math.min(18, Math.max(6, (band - 14) / 2))
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / max)
  const empty = points.every((p) => !p.logged && !p.paid)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}</li>
          ))}
        </ul>
        <button type="button" className="text-[12.5px] font-semibold text-brand-ink hover:underline" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground"><th className="py-1.5 font-bold">Month</th><th className="py-1.5 text-right font-bold">Logged</th><th className="py-1.5 text-right font-bold">Paid for</th></tr></thead>
            <tbody className="divide-y">{points.map((p) => <tr key={p.ym}><td className="py-1.5">{p.label}</td><td className="num py-1.5 text-right">{money(p.logged)}</td><td className="num py-1.5 text-right">{money(p.paid)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Work logged and paid for, by month worked, over the last ${points.length} months`} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-muted-foreground text-[11px]">{short(t)}</text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = padL + band * i + band / 2
              return (
                <g key={p.ym}>
                  {hover === i && <rect x={padL + band * i + 2} y={padT} width={band - 4} height={h - padT - padB} rx={6} fill="hsl(var(--secondary))" />}
                  {SERIES.map((s, k) => {
                    const v = p[s.key]
                    const top = y(v)
                    const bh = Math.max(0, y(0) - top)
                    const x = cx + (k === 0 ? -barW - 1 : 1)
                    // rounded data end, square at the baseline
                    const r = Math.min(4, bh, barW / 2)
                    const d = bh <= 0 ? "" : `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`
                    return d ? <path key={s.key} d={d} style={{ fill: s.color }} /> : null
                  })}
                  <text x={cx} y={h - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{p.label}</text>
                  <rect x={padL + band * i} y={0} width={band} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />
                </g>
              )
            })}
          </svg>
          {empty && <p className="pointer-events-none absolute inset-x-0 top-14 text-center text-[13px] text-muted-foreground">Nothing logged in the last six months yet.</p>}
          {hover !== null && !empty && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-[12.5px] shadow-md"
              style={{ left: Math.min(Math.max(padL + band * hover + band / 2, 80), w - 80) }}
              role="status"
            >
              <div className="mb-1 font-semibold">{points[hover].label}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-[2px]" style={{ background: s.color }} />{s.key === "logged" ? "Logged" : "Paid for"}</span>
                  <span className="num font-semibold">{money(points[hover][s.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- budget pie ---------- */
export type Slice = { id: string; label: string; value: number; color: string }
/** Pots as a ring: a 2px gap between slices, hover or focus a slice (or its row) to read it in the middle. */
export function Donut({ slices, total, centreLabel, active, onActive, format = money }: {
  slices: Slice[]
  total: number
  centreLabel: string
  active: string | null
  onActive: (id: string | null) => void
  /** How values are written (money by default; counts for the admin page). */
  format?: (v: number) => string
}) {
  const size = 220, r = 100, inner = 70, c = size / 2
  const sumV = slices.reduce((a, s) => a + Math.max(0, s.value), 0)
  const point = (rad: number, a: number) => [c + rad * Math.sin(a), c - rad * Math.cos(a)]
  let at = 0
  const arcs = sumV > 0 ? slices.filter((s) => s.value > 0).map((s) => {
    const frac = s.value / sumV
    const a0 = at * 2 * Math.PI, a1 = (at + frac) * 2 * Math.PI
    at += frac
    if (frac >= 0.9999) {
      // A full ring can't be one arc: draw two halves
      const d = `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} M ${c} ${c - inner} A ${inner} ${inner} 0 1 0 ${c} ${c + inner} A ${inner} ${inner} 0 1 0 ${c} ${c - inner} Z`
      return { s, d }
    }
    const large = a1 - a0 > Math.PI ? 1 : 0
    const [x0, y0] = point(r, a0), [x1, y1] = point(r, a1), [x2, y2] = point(inner, a1), [x3, y3] = point(inner, a0)
    return { s, d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z` }
  }) : []
  const hot = slices.find((s) => s.id === active)
  const pct = (v: number) => (sumV > 0 ? Math.round((v / sumV) * 100) : 0)
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full" role="img"
        aria-label={`Split of ${format(total)}: ${slices.map((s) => `${s.label} ${pct(s.value)}%`).join(", ")}`}
        onMouseLeave={() => onActive(null)}>
        {!arcs.length && <circle cx={c} cy={c} r={(r + inner) / 2} fill="none" stroke="hsl(var(--secondary))" strokeWidth={r - inner} />}
        {arcs.map(({ s, d }) => (
          <path key={s.id} d={d} fill={s.color} fillRule="evenodd" stroke="hsl(var(--card))" strokeWidth={2} strokeLinejoin="round"
            opacity={active && active !== s.id ? 0.35 : 1} className="cursor-pointer transition-opacity"
            onMouseEnter={() => onActive(s.id)} onClick={() => onActive(active === s.id ? null : s.id)} />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-[22%] flex flex-col items-center justify-center text-center" aria-live="polite">
        <span className="line-clamp-2 text-[12px] leading-tight text-muted-foreground">{hot ? hot.label : centreLabel}</span>
        <span className="num mt-1 font-display text-[clamp(17px,5vw,22px)] font-medium leading-tight">{format(hot ? hot.value : total)}</span>
        {hot && <span className="mt-0.5 text-[12px] text-muted-foreground">{pct(hot.value)}%</span>}
      </div>
    </div>
  )
}
