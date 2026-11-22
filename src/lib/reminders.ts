// Reminders for overdue invoices and upcoming shifts, shown as phone or computer notifications.
// The page works out the reminders and hands them to the service worker (public/reminders-sw.js),
// which shows each one once when it's due: straight away while the app is open, and in the background
// where the browser allows it (installed app on Android or a computer, via periodic background sync).
import { followUpsDue, money, nextFollowUp, type Data } from "./model"
import { placeName, shiftTimes, upcoming } from "./shifts"

export type Reminder = { id: string; at: number; title: string; body: string; tab: "invoices" | "shifts" }
export type NotifyPrefs = { on: boolean; invoices: boolean; shifts: boolean }
const PREFS = "pst_notify"
export function notifyPrefs(): NotifyPrefs {
  try { return { on: false, invoices: true, shifts: true, ...JSON.parse(localStorage.getItem(PREFS) || "{}") } } catch { return { on: false, invoices: true, shifts: true } }
}
export function saveNotifyPrefs(p: NotifyPrefs) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)) } catch { /* ignore */ }
}
export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00`).getTime()

/** Reminders from now until two weeks ahead (and anything due in the last few days not yet shown). */
export function buildReminders(d: Data, p: NotifyPrefs, now = new Date()): Reminder[] {
  const out: Reminder[] = []
  if (p.invoices) {
    // Each unpaid invoice once its next follow-up date arrives (9am), a new reminder for each follow-up round
    const due = new Set(followUpsDue(d).map((i) => i.id))
    for (const i of d.invoices) {
      const next = nextFollowUp(i, d.profile)
      if (!next) continue
      out.push({
        // Already due (even long ago): remind now; otherwise at 9am on the follow-up date
        id: `inv-${i.id}-${next}`, at: due.has(i.id) ? now.getTime() : at(next, "09:00"),
        title: `${i.number} is overdue`, body: `${money(i.total)} from ${i.to.name || "the pharmacy"}. Open KASA.Rx to send a follow-up.`, tab: "invoices",
      })
    }
  }
  if (p.shifts) {
    // The evening before (7pm), or 2 hours before if it was booked later than that
    for (const s of upcoming(d, now)) {
      const { start } = shiftTimes(s)
      if (start.getTime() < now.getTime()) continue
      const dayBefore = new Date(start); dayBefore.setDate(dayBefore.getDate() - 1); dayBefore.setHours(19, 0, 0, 0)
      const when = dayBefore.getTime() > now.getTime() - 60_000 ? dayBefore.getTime() : Math.max(now.getTime(), start.getTime() - 2 * 3600_000)
      const isTomorrow = when === dayBefore.getTime()
      out.push({
        id: `shift-${s.id}-${s.date}-${s.start}`, at: when,
        title: `${isTomorrow ? "Tomorrow" : "Today"}: ${placeName(d, s)} at ${s.start}`, body: `Shift ${s.start}–${s.end}. Open KASA.Rx for details.`, tab: "shifts",
      })
    }
  }
  const horizon = now.getTime() + 14 * 86_400_000
  return out.filter((r) => r.at <= horizon).sort((a, b) => a.at - b.at)
}

const storeKey = () => `${location.origin}${import.meta.env.BASE_URL}__kasa/reminders.json`
/** Hand the reminders to the service worker and ask it to show any that are due. */
export async function syncReminders(list: Reminder[], enabled: boolean) {
  if (!notificationsSupported() || !("caches" in window)) return
  try {
    const cache = await caches.open("kasa-reminders")
    const old = await cache.match(storeKey())
    const shown: string[] = old ? ((await old.json()).shown || []) : []
    await cache.put(storeKey(), new Response(JSON.stringify({ enabled: enabled && Notification.permission === "granted", list, shown }), { headers: { "Content-Type": "application/json" } }))
    const reg = await navigator.serviceWorker.getRegistration()
    reg?.active?.postMessage("kasa-deliver")
  } catch { /* storage or worker not available: reminders still show on the Home page */ }
}

/** Ask for permission and, where supported, background checks (installed app on Android and computers). */
export async function turnOnNotifications() {
  if (!notificationsSupported()) return "unsupported" as const
  const perm = await Notification.requestPermission()
  if (perm !== "granted") return perm
  try {
    const reg = await navigator.serviceWorker.ready
    const ps = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } }).periodicSync
    if (ps) {
      const st = await navigator.permissions.query({ name: "periodic-background-sync" as PermissionName }).catch(() => null)
      if (!st || st.state === "granted") await ps.register("kasa-reminders", { minInterval: 60 * 60 * 1000 }).catch(() => {})
    }
  } catch { /* background checks not available: reminders show when the app is open */ }
  return "granted" as const
}
