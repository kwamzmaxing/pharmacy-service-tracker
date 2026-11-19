import { useEffect, useRef, useState } from "react"
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, GoogleAuthProvider,
  sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, updateProfile,
} from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/firebase"
import { Field } from "./bits"

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
function message(code: string) {
  if (/email-already-in-use/.test(code)) return "There’s already an account with that email. Log in instead."
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "That email and password don’t match. Try again, or reset your password."
  if (/too-many-requests/.test(code)) return "Too many tries. Wait a few minutes, or reset your password."
  if (/weak-password/.test(code)) return "Choose a stronger password: at least 8 characters."
  if (/popup-closed|cancelled-popup/.test(code)) return "The Google window was closed before finishing."
  if (/popup-blocked/.test(code)) return "Your browser blocked the Google window. Allow pop-ups for this site and try again."
  if (/network/.test(code)) return "The tracker can’t be reached right now. Check your connection and try again."
  if (/operation-not-allowed/.test(code)) return "This way of logging in isn’t switched on for the site yet."
  return "Something went wrong. Try again."
}

type Mode = "in" | "up" | "forgot"
export function AuthScreen({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<Mode>("in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")
  const [keep, setKeep] = useState(true)
  const [err, setErr] = useState("")
  const [info, setInfo] = useState(notice || "")
  const [busy, setBusy] = useState(false)
  const fields = useRef<HTMLDivElement>(null)
  useEffect(() => { setErr(""); fields.current?.querySelector("input")?.focus() }, [mode])
  useEffect(() => setInfo(notice || ""), [notice])

  async function remember() {
    await setPersistence(auth, keep ? browserLocalPersistence : browserSessionPersistence)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    if (mode === "up" && !name.trim()) return setErr("Enter your full name.")
    if (!validEmail(email)) return setErr("Enter a valid email address.")
    if (mode !== "forgot" && !pw) return setErr("Enter your password.")
    if (mode === "up" && pw.length < 8) return setErr("Use a password of at least 8 characters.")
    if (mode === "up" && pw !== pw2) return setErr("The passwords don’t match.")
    setBusy(true)
    try {
      if (mode === "forgot") {
        await sendPasswordResetEmail(auth, email.trim())
        setInfo(`If ${email.trim()} has an account, a reset link is on its way. Check your inbox and spam folder.`)
        setMode("in")
        return
      }
      await remember()
      if (mode === "up") {
        // Set before creating: the app opens the account as soon as Firebase reports the log-in
        sessionStorage.setItem("pst_new_name", name.trim())
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw)
        updateProfile(cred.user, { displayName: name.trim() }).catch(() => {})
        sendEmailVerification(cred.user).catch(() => {})
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), pw)
      }
    } catch (x) {
      const code = (x as { code?: string })?.code || ""
      setErr(mode === "forgot" && /user-not-found/.test(code) ? "" : message(code))
      if (/email-already-in-use/.test(code)) setMode("in")
      if (mode === "forgot" && /user-not-found/.test(code)) {
        setInfo(`If ${email.trim()} has an account, a reset link is on its way. Check your inbox and spam folder.`)
        setMode("in")
      }
    } finally {
      setBusy(false)
    }
  }
  async function google() {
    setErr("")
    setBusy(true)
    try {
      await remember()
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (x) {
      setErr(message((x as { code?: string })?.code || ""))
    } finally {
      setBusy(false)
    }
  }

  const label: Record<Mode, [string, string]> = { in: ["Log in", "Logging in…"], up: ["Create account", "Creating account…"], forgot: ["Email me a reset link", "Sending…"] }
  return (
    <div className="min-h-screen bg-header">
      <div className="wrap grid min-h-screen content-center gap-7 py-10 sm:grid-cols-[1fr_400px] sm:items-center sm:gap-12">
        <div className="text-header-fg">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 font-display text-[25px] font-bold">℞</div>
            <div>
              <h1 className="font-display text-[22px] font-bold leading-tight text-white">Service Tracker</h1>
              <p className="text-[13px] text-header-muted">Log it. Total it. Invoice it.</p>
            </div>
          </div>
          <ul className="mt-6 hidden max-w-sm gap-2 text-[13.5px] text-header-muted sm:grid">
            <li>Log services and hours as you go.</li>
            <li>Turn a month into an invoice with your own details.</li>
            <li>Email invoices from your Gmail, put due dates in your calendar, and follow up on late payments.</li>
          </ul>
        </div>

        <div className="rounded-[18px] border bg-card p-6 text-card-foreground shadow-[0_18px_50px_-20px_rgba(0,0,0,.45)]">
          {mode !== "forgot" ? (
            <div role="tablist" aria-label="Log in or create an account" className="mb-5 flex rounded-[10px] bg-secondary p-1">
              {(["in", "up"] as const).map((m) => (
                <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => { setMode(m); setInfo("") }}
                  className={cn("flex-1 rounded-lg py-2 text-[13.5px] font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === m && "bg-card text-brand-ink shadow-sm")}>
                  {m === "in" ? "Log in" : "Create account"}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-4">
              <h2 className="font-display text-[18px] font-bold">Forgot your password?</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Enter your account email and we’ll send you a link to choose a new one. Your entries and invoices are kept.</p>
            </div>
          )}
          {info && <p className="mb-4 rounded-[9px] bg-ok-tint px-3 py-2.5 text-[13px] text-brand-ink">{info}</p>}

          {mode !== "forgot" && (
            <>
              <Button type="button" variant="outline" className="h-11 w-full gap-2.5 text-[14.5px]" disabled={busy} onClick={google}>
                <svg viewBox="0 0 48 48" className="size-5" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                Continue with Google
              </Button>
              <div className="my-4 flex items-center gap-3 text-[12px] text-muted-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
            </>
          )}

          <form onSubmit={submit} noValidate className="grid gap-3">
            <div ref={fields} className="grid gap-3">
              {mode === "up" && <Field id="a-name" label="Full name" autoComplete="name" placeholder="As it should appear on invoices" value={name} onChange={(e) => setName(e.target.value)} />}
              <Field id="a-email" label="Email" type="email" autoComplete={mode === "up" ? "email" : "username"} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              {mode !== "forgot" && <Field id="a-pw" label="Password" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} placeholder={mode === "up" ? "At least 8 characters" : ""} value={pw} onChange={(e) => setPw(e.target.value)} />}
              {mode === "up" && <Field id="a-pw2" label="Confirm password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}
            </div>
            {mode !== "forgot" && (
              <label htmlFor="a-keep" className="mt-1 flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                <Checkbox id="a-keep" checked={keep} onCheckedChange={(v) => setKeep(v === true)} />
                Keep me logged in on this device
              </label>
            )}
            <p role="alert" className="min-h-[18px] text-[13px] text-danger-ink">{err}</p>
            <Button type="submit" disabled={busy} className="h-11 text-[14.5px]">{busy ? label[mode][1] : label[mode][0]}</Button>
          </form>
          <div className="mt-3 text-[13px]">
            {mode === "in" && <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => { setMode("forgot"); setInfo("") }}>Forgot password?</button>}
            {mode === "forgot" && <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => setMode("in")}>Back to log in</button>}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">Your account works on any phone or computer. Only you can see your entries and invoices.</p>
        </div>
      </div>
    </div>
  )
}
