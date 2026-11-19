// Small shared presentational pieces.
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { Status } from "@/lib/model"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function Panel({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[10px] border bg-card p-5 text-card-foreground", className)}>
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title && <h2 className="font-display text-[16px] font-bold tracking-[-0.015em]">{title}</h2>}
          {aside && <span className="text-xs font-medium text-muted-foreground">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground", className)}>{children}</p>
}

const STATUS_STYLE: Record<Status | "pending" | "done", string> = {
  paid: "bg-ok-tint text-brand-ink",
  done: "bg-ok-tint text-brand-ink",
  unpaid: "bg-warn-tint text-warn",
  pending: "bg-warn-tint text-warn",
  overdue: "bg-danger-tint text-danger-ink",
}
export function Pill({ tone, children }: { tone: keyof typeof STATUS_STYLE; children: ReactNode }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[0.04em]", STATUS_STYLE[tone])}>
      {children}
    </span>
  )
}

type FieldProps = {
  id: string
  label: ReactNode
  hint?: ReactNode
  className?: string
} & React.InputHTMLAttributes<HTMLInputElement>
export function Field({ id, label, hint, className, ...input }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label} {hint && <span className="font-normal">{hint}</span>}
      </Label>
      <Input id={id} className="h-10 bg-field text-[14.5px] shadow-none" {...input} />
    </div>
  )
}
export function MoneyField(props: FieldProps) {
  const { id, label, className, ...input } = props
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
        <Input id={id} type="number" min={0} step="0.01" inputMode="decimal" className="h-10 bg-field pl-6 text-[14.5px] shadow-none" {...input} />
      </div>
    </div>
  )
}
export function AreaField({ id, label, className, ...rest }: { id: string; label: ReactNode; className?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <Textarea id={id} rows={3} className="bg-field text-[14.5px] shadow-none" {...rest} />
    </div>
  )
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === k ? "border-primary bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-2 py-7 text-center text-[13.5px] text-muted-foreground">
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      {children}
    </div>
  )
}

export function Callout({ tone = "warn", children }: { tone?: "warn" | "danger"; children: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[9px] px-3.5 py-3 text-[13px]", tone === "danger" ? "bg-danger-tint text-danger-ink" : "bg-warn-tint text-warn")}>
      {children}
    </div>
  )
}

/** A row of headline figures in one ruled strip (not a set of floating cards). */
export function Ledger({ cells }: { cells: { label: string; value: string; sub?: string; alert?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border bg-card sm:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} className={cn("min-w-0 px-4 py-3.5", i % 2 === 1 && "border-l", i >= 2 && "border-t sm:border-t-0", i === 2 && "sm:border-l", c.alert && "bg-danger-tint")}>
          <div className="truncate text-[12px] font-medium text-muted-foreground">{c.label}</div>
          <div className={cn("num mt-1 truncate font-display text-[clamp(18px,4.8vw,23px)] font-bold tracking-[-0.02em]", c.alert && "text-danger-ink")}>{c.value}</div>
          {c.sub && <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}
