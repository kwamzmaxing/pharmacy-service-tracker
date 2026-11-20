// Small shared presentational pieces.
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { Status } from "@/lib/model"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function Panel({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl bg-card p-5 text-card-foreground sm:p-7", className)}>
      {(title || aside) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {title && <h2 className="font-display text-[17px] font-medium">{title}</h2>}
          {aside && <span className="text-[12.5px] text-muted-foreground">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[12px] font-medium text-muted-foreground", className)}>{children}</p>
}

const STATUS_STYLE: Record<Status | "pending" | "done", string> = {
  paid: "bg-ok-tint text-ok-ink",
  done: "bg-ok-tint text-ok-ink",
  unpaid: "bg-warn-tint text-warn",
  pending: "bg-warn-tint text-warn",
  overdue: "bg-danger-tint text-danger-ink",
}
export function Pill({ tone, children }: { tone: keyof typeof STATUS_STYLE; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", STATUS_STYLE[tone])}>
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
      <Label htmlFor={id} className="text-[12.5px] font-normal text-muted-foreground">
        {label} {hint && <span className="font-normal">{hint}</span>}
      </Label>
      <Input id={id} className="h-11 bg-field text-[15px]" {...input} />
    </div>
  )
}
export function MoneyField(props: FieldProps) {
  const { id, label, className, ...input } = props
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-[12.5px] font-normal text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">£</span>
        <Input id={id} type="number" min={0} step="0.01" inputMode="decimal" className="h-11 bg-field pl-8 text-[15px]" {...input} />
      </div>
    </div>
  )
}
export function AreaField({ id, label, className, ...rest }: { id: string; label: ReactNode; className?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-[12.5px] font-normal text-muted-foreground">{label}</Label>
      <Textarea id={id} rows={3} className="bg-field text-[15px]" {...rest} />
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
            "rounded-full px-4 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === k ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground",
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
    <div className="px-2 py-9 text-center text-[14px] text-muted-foreground">
      <p className="mb-1.5 font-display text-[16px] font-medium text-foreground">{title}</p>
      {children}
    </div>
  )
}

export function Callout({ tone = "warn", children }: { tone?: "warn" | "danger"; children: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4 text-[13.5px]", tone === "danger" ? "bg-danger-tint text-danger-ink" : "bg-warn-tint text-warn")}>
      {children}
    </div>
  )
}

/** Headline figures: graphite tiles separated only by a hairline of canvas (no borders, no shadows). */
export function Ledger({ cells }: { cells: { label: string; value: string; sub?: string; alert?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-[2px] overflow-hidden rounded-xl sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className={cn("min-w-0 bg-card px-5 py-4 sm:py-5", c.alert && "bg-danger-tint")}>
          <div className="text-[12.5px] leading-snug text-muted-foreground">{c.label}</div>
          <div className={cn("num mt-1.5 truncate font-display text-[clamp(19px,5vw,26px)] font-medium leading-tight sm:text-[21px] md:text-[22px]", c.alert && "text-danger-ink")}>{c.value}</div>
          {c.sub && <div className="mt-1 text-[12px] leading-snug text-muted-foreground">{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}
