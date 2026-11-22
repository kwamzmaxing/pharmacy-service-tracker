// Shown instead of the tracker while the app lock is on.
import { useEffect, useRef, useState } from "react"
import { Fingerprint, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { unlock } from "@/lib/appLock"
import { Wordmark } from "./brand"

export function LockScreen({ uid, onUnlocked, onLogOut }: { uid: string; onUnlocked: () => void; onLogOut: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const tried = useRef(false)
  async function go() {
    setBusy(true)
    const ok = await unlock(uid)
    setBusy(false)
    if (ok) onUnlocked()
    else setFailed(true)
  }
  // Ask straight away when the lock appears (some phones need a tap first; the button is there for that)
  useEffect(() => { if (!tried.current) { tried.current = true; go() } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="grid max-w-xs justify-items-center gap-5 text-center">
        <Wordmark size="lg" tagline />
        <p className="text-[14px] text-muted-foreground">KASA.Rx is locked. Unlock with Face ID, your fingerprint or your device PIN.</p>
        <Button className="h-12 px-7 text-[15px]" disabled={busy} onClick={go}><Fingerprint /> {busy ? "Waiting…" : "Unlock"}</Button>
        {failed && <p role="alert" className="text-[13px] text-danger-ink">That didn’t work. Try again, or log out and log back in with your password.</p>}
        <Button variant="ghost" className="text-muted-foreground" onClick={onLogOut}><LogOut /> Log out instead</Button>
      </div>
    </div>
  )
}
