// The admin overview: how many people use KASA.Rx, how active they are, what they say, and what needs
// attention. Built only from what the admin can see (accounts, feedback, emails, requests, crash reports);
// never anyone's tracker data, which stays private to them.
import { useEffect, useState } from "react"
import { AlertTriangle, Inbox, MessageSquare, UserPlus, UserRoundCheck } from "lucide-react"
import { listRequests, type AccountantRequest } from "@/lib/accountant"
import { listErrors, type ErrorReport } from "@/lib/errors"
import type { Feedback, OutboxItem, Person } from "@/lib/cloud"
import { Panel } from "./bits"
import { Donut, type Slice } from "./charts"
import { ActivityList, BarList, Change, LineChart, StatCard, pctChange, type Activity } from "./dashCharts"

const DAY = 86_400_000
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
const count = (n: number) => n.toLocaleString("en-GB")

export function AdminDashboard({ people, feedback, outbox }: { people: Person[]; feedback: Feedback[]; outbox: OutboxItem[] }) {
  const [requests, setRequests] = useState<AccountantRequest[]>([])
  const [errors, setErrors] = useState<ErrorReport[]>([])
  const [hot, setHot] = useState<string | null>(null)
  useEffect(() => {
    listRequests().then(setRequests).catch(() => {})
    listErrors().then(setErrors).catch(() => {})
  }, [])

  const now = Date.now()
  const within = (iso: string | undefined, from: number, to = 0) => { const t = ms(iso); return t > 0 && now - t <= from && now - t > to }
  const total = people.length
  const new30 = people.filter((p) => within(p.created, 30 * DAY)).length
  const prev30 = people.filter((p) => within(p.created, 60 * DAY, 30 * DAY)).length
  const active30 = people.filter((p) => within(p.lastLogin, 30 * DAY)).length
  const active7 = people.filter((p) => within(p.lastLogin, 7 * DAY)).length
  const rated = feedback.filter((f) => f.rating > 0)
  const avg = rated.length ? rated.reduce((a, f) => a + f.rating, 0) / rated.length : 0
  const newRequests = requests.filter((r) => r.status === "new").length
  const waiting = outbox.filter((o) => o.status === "new").length
  const crashes7 = errors.filter((e) => within(e.at, 7 * DAY)).length

  // Accounts at the end of each of the last 12 months
  const monthsBack = (k: number) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - k + 1, 1).getTime() }
  const growth = Array.from({ length: 12 }, (_, i) => {
    const k = 11 - i, end = Math.min(monthsBack(k), now + 1), start = monthsBack(k + 1)
    const d = new Date(start)
    return {
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      long: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      values: {
        total: people.filter((p) => { const t = ms(p.created || p.lastLogin); return t > 0 && t < end }).length,
        new: people.filter((p) => { const t = ms(p.created); return t >= start && t < end }).length,
      },
    }
  })

  // When people last logged in
  const seen: Slice[] = [
    { id: "today", label: "Today", value: people.filter((p) => within(p.lastLogin, DAY)).length, color: "var(--pot-0)" },
    { id: "week", label: "This week", value: people.filter((p) => within(p.lastLogin, 7 * DAY, DAY)).length, color: "var(--pot-1)" },
    { id: "month", label: "This month", value: people.filter((p) => within(p.lastLogin, 30 * DAY, 7 * DAY)).length, color: "var(--pot-2)" },
    { id: "older", label: "Longer ago", value: people.filter((p) => ms(p.lastLogin) > 0 && now - ms(p.lastLogin) > 30 * DAY).length, color: "var(--pot-3)" },
    { id: "never", label: "Not recorded", value: people.filter((p) => !p.lastLogin).length, color: "hsl(var(--muted-foreground))" },
  ].filter((s) => s.value > 0)

  const tally = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] || 0) + 1), a), {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  const ratings = [5, 4, 3, 2, 1].map((n) => ({ label: "★".repeat(n) + " " + n, value: rated.filter((f) => f.rating === n).length }))
  const topics = tally(feedback.map((f) => f.topic || "Other"))
  const askedAbout = tally(requests.flatMap((r) => [...r.topics, ...(r.other ? ["Something else"] : [])]))

  const activity: Activity[] = [
    ...people.filter((p) => p.created).map((p) => ({ id: "u" + p.uid, at: p.created!, icon: <UserPlus />, text: <>{p.name || p.email} created an account</> })),
    ...feedback.map((f) => ({ id: "f" + f.id, at: f.at, icon: <MessageSquare />, text: <>{f.name} sent feedback{f.rating ? ` (${f.rating}★)` : ""}</>, sub: f.topic })),
    ...requests.map((r) => ({ id: "r" + r.uid, at: r.at, icon: <UserRoundCheck />, text: <>{r.name} asked to talk to an accountant</>, sub: r.topics.slice(0, 2).join(", ") })),
    ...outbox.map((o) => ({ id: "o" + o.id, at: o.at, icon: <Inbox />, text: <>{o.name} queued {o.kind === "invoice" ? "an invoice" : "a follow-up"} {o.invoiceNumber}</>, sub: o.status === "new" ? "Waiting for you" : o.status === "done" ? "Sent" : "Not sent" })),
    ...errors.map((e) => ({ id: "e" + e.id, at: e.at, icon: <AlertTriangle />, text: <>Crash report: {e.message.slice(0, 60)}</>, sub: `${e.page} page` })),
  ].filter((a) => a.at).sort((a, b) => ms(b.at) - ms(a.at)).slice(0, 10)

  return (
    <div className="grid gap-5 sm:gap-6">
      <div>
        <h2 className="font-display text-[clamp(22px,4.5vw,28px)] font-medium leading-tight">Dashboard</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">Overview of KASA.Rx accounts, activity and requests. People’s own trackers stay private, so they aren’t included.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="Account holders" value={count(total)} foot={<Change value={pctChange(new30, prev30)} label={`${count(new30)} new in 30 days, vs the 30 before`} />} spark={growth.slice(-6).map((g) => g.values.total)} />
        <StatCard label="Active in the last 30 days" value={count(active30)} foot={<span className="text-[12px] text-muted-foreground">{total ? Math.round((active30 / total) * 100) : 0}% of accounts · {count(active7)} this week</span>} />
        <StatCard label="Average rating" value={rated.length ? `${avg.toFixed(1)} ★` : "—"} foot={<span className="text-[12px] text-muted-foreground">{rated.length ? `From ${count(rated.length)} rating${rated.length === 1 ? "" : "s"}` : "No ratings yet"} · {count(feedback.length)} feedback</span>} />
        <StatCard label="Accountant requests" value={count(newRequests)} foot={<span className="text-[12px] text-muted-foreground">New · {count(requests.length)} in total</span>} alert={newRequests > 0} />
        <StatCard label="Emails waiting for you" value={count(waiting)} foot={<span className="text-[12px] text-muted-foreground">{waiting ? "Check and send below" : "Nothing to send"}</span>} alert={waiting > 0} />
        <StatCard label="Crash reports this week" value={count(crashes7)} foot={<span className="text-[12px] text-muted-foreground">{count(errors.length)} kept · see Crash reports below</span>} alert={crashes7 > 0} />
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Account holders over time" aside="Last 12 months">
          <LineChart points={growth} series={[{ key: "total", label: "Account holders", color: "var(--series-logged)" }, { key: "new", label: "New that month", color: "var(--series-paid)" }]} format={count} axis={(v) => count(Math.round(v))}
            ariaLabel="Total account holders at the end of each of the last 12 months" empty="No accounts yet." />
        </Panel>
        <Panel title="When people last logged in">
          {seen.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <Donut slices={seen} total={total} centreLabel="Accounts" active={hot} onActive={setHot} format={count} />
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px]">
                {seen.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3" onMouseEnter={() => setHot(x.id)} onMouseLeave={() => setHot(null)}>
                    <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 flex-none rounded-[3px]" style={{ background: x.color }} /><span className="truncate">{x.label}</span></span>
                    <span className="num whitespace-nowrap text-muted-foreground"><span className="font-medium text-foreground">{count(x.value)}</span> · {Math.round((x.value / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-[13.5px] text-muted-foreground">No accounts yet.</p>}
        </Panel>
      </div>

      <div className="grid gap-5 sm:gap-6 md:grid-cols-3">
        <Panel title="Ratings"><BarList rows={ratings} format={count} empty="No ratings yet." /></Panel>
        <Panel title="Feedback topics"><BarList rows={topics} format={count} empty="No feedback yet." /></Panel>
        <Panel title="Accountant topics"><BarList rows={askedAbout} format={count} empty="No requests yet." /></Panel>
      </div>

      <Panel title="Recent activity">
        <ActivityList items={activity} empty="Nothing yet: sign-ups, feedback, requests and crash reports appear here." />
      </Panel>
    </div>
  )
}
