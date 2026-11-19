import { useEffect, useRef, useState } from "react"
import { money, type MonthPoint } from "@/lib/model"

const SERIES = [
  { key: "logged", label: "Earned (logged)", color: "var(--series-logged)" },
  { key: "paid", label: "Paid to you", color: "var(--series-paid)" },
] as const

function niceMax(v: number) {
  if (v <= 0) return 100
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}
const short = (v: number) => (v >= 1000 ? `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${Math.round(v)}`)

/** Earned vs paid per month: grouped bars, one y-axis, hover for exact values. */
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
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground"><th className="py-1.5 font-bold">Month</th><th className="py-1.5 text-right font-bold">Earned</th><th className="py-1.5 text-right font-bold">Paid</th></tr></thead>
            <tbody className="divide-y">{points.map((p) => <tr key={p.ym}><td className="py-1.5">{p.label}</td><td className="num py-1.5 text-right">{money(p.logged)}</td><td className="num py-1.5 text-right">{money(p.paid)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Earned and paid over the last ${points.length} months`} className="block overflow-visible">
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
                  <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-[2px]" style={{ background: s.color }} />{s.key === "logged" ? "Earned" : "Paid"}</span>
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
