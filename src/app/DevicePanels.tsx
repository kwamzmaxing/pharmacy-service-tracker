// Settings for this device: Face ID / fingerprint lock, and reminder notifications.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Bell, Fingerprint } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { disableLock, enableLock, lockAvailable, lockSettings, setLockAfter } from "@/lib/appLock"
import { buildReminders, notificationsSupported, notifyPrefs, saveNotifyPrefs, syncReminders, turnOnNotifications, type NotifyPrefs } from "@/lib/reminders"
import { useApp } from "./ctx"
import { Chips, Panel } from "./bits"

export function LockPanel() {
  const { me, data } = useApp()
  const [ok, setOk] = useState<boolean | null>(null)
  const [s, setS] = useState(() => lockSettings(me.uid))
  useEffect(() => { lockAvailable().then(setOk) }, [])
  if (ok === null) return null
  async function turnOn() {
    try {
      await enableLock(me.uid, me.email, data.profile.fullName || me.name)
      setS(lockSettings(me.uid))
      toast.success("App lock is on ✓")
    } catch {
      toast.error("The lock wasn’t set up. Try again and approve the Face ID, fingerprint or PIN prompt.")
    }
  }
  return (
    <Panel title="App lock" aside="this device">
      <div className="grid gap-3 text-[13.5px]">
        <p className="text-muted-foreground">
          Lock KASA.Rx with Face ID, Touch ID, your fingerprint or your device PIN, so nobody who picks up your phone can see your bank details and invoices. It’s set up separately on each device, and your log-in still protects your account.
        </p>
        {!ok ? (
          <p className="text-muted-foreground">This device or browser doesn’t offer Face ID, fingerprint or a device PIN to websites.</p>
        ) : !s ? (
          <div><Button onClick={turnOn}><Fingerprint /> Turn on app lock</Button></div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">Lock again after the app has been in the background for</span>
              <Chips<string> label="Lock after" value={String(s.afterMins)} onChange={(v) => { setLockAfter(me.uid, Number(v)); setS(lockSettings(me.uid)) }}
                options={[["0", "Straight away"], ["1", "1 minute"], ["5", "5 minutes"], ["15", "15 minutes"]]} />
            </div>
            <div><Button variant="outline" onClick={() => { disableLock(me.uid); setS(null); toast("App lock turned off on this device") }}>Turn off app lock</Button></div>
          </>
        )}
      </div>
    </Panel>
  )
}

export function NotificationsPanel() {
  const { data } = useApp()
  const [p, setP] = useState<NotifyPrefs>(notifyPrefs)
  const [perm, setPerm] = useState(() => (notificationsSupported() ? Notification.permission : "unsupported"))
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true
  const save = (next: NotifyPrefs) => { setP(next); saveNotifyPrefs(next); syncReminders(buildReminders(data, next), next.on) }

  async function turnOn() {
    const r = await turnOnNotifications()
    setPerm(r === "unsupported" ? "unsupported" : Notification.permission)
    if (r === "granted") { save({ ...p, on: true }); toast.success("Notifications are on ✓") }
    else if (r === "denied") toast.error("Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.")
  }
  return (
    <Panel title="Reminders" aside="this device">
      <div className="grid gap-3 text-[13.5px]">
        <p className="text-muted-foreground">Get a notification when an invoice needs a follow-up (9am on the day), and the evening before each shift.</p>
        {perm === "unsupported" ? (
          <p className="text-muted-foreground">
            {ios && !installed ? "On iPhone, add KASA.Rx to your Home Screen first (see “Use KASA.Rx as an app” above), then open it from there to turn on reminders." : "This browser doesn’t support notifications."}
          </p>
        ) : !p.on || perm !== "granted" ? (
          <div><Button onClick={turnOn}><Bell /> Turn on reminders</Button></div>
        ) : (
          <>
            <label className="flex items-center justify-between gap-3"><span>Overdue invoices</span><Switch checked={p.invoices} onCheckedChange={(v) => save({ ...p, invoices: v })} /></label>
            <label className="flex items-center justify-between gap-3"><span>Upcoming shifts</span><Switch checked={p.shifts} onCheckedChange={(v) => save({ ...p, shifts: v })} /></label>
            <div><Button variant="outline" onClick={() => { save({ ...p, on: false }); toast("Reminders turned off on this device") }}>Turn off reminders</Button></div>
          </>
        )}
        <p className="text-[12px] text-muted-foreground">
          Reminders appear while KASA.Rx is open. With the app installed on Android or a computer, they can also arrive when it’s closed (your phone decides how often it checks). iPhones only allow that with server push, which isn’t set up yet. Overdue invoices and your next shift are always listed on the Home page.
        </p>
      </div>
    </Panel>
  )
}
