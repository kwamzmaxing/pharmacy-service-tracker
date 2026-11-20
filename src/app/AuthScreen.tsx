import { useEffect, useRef, useState } from "react"
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, GoogleAuthProvider, OAuthProvider,
  sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, updateProfile,
} from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/firebase"
import { Field } from "./bits"
import { GoogleLogo, MicrosoftLogo, Wordmark } from "./brand"
import { microsoftLogin } from "@/config"

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
function message(code: string) {
  if (/email-already-in-use/.test(code)) return "There’s already an account with that email. Log in instead."
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "That email and password don’t match. Try again, or reset your password."
  if (/too-many-requests/.test(code)) return "Too many tries. Wait a few minutes, or reset your password."
  if (/weak-password/.test(code)) return "Choose a stronger password: at least 8 characters."
  if (/account-exists-with-different-credential/.test(code)) return "There’s already an account with that email, made another way. Log in with Google or your password instead."
  if (/popup-closed|cancelled-popup/.test(code)) return "The sign-in window was closed before finishing."
  if (/popup-blocked/.test(code)) return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."
  if (/network/.test(code)) return "The tracker can’t be reached right now. Check your connection and try again."
  if (/operation-not-allowed/.test(code)) return "This way of logging in isn’t switched on for the site yet."
  if (/configuration-not-found/.test(code)) return "Logins aren’t switched on for this site yet. The site owner needs to enable Authentication in Firebase."
  if (/unauthorized-domain/.test(code)) return "This web address isn’t allowed to log in yet. The site owner needs to add it to Firebase’s authorised domains."
  if (/api-key|requests-from-referer/.test(code)) return "The site’s Firebase key was refused. The site owner needs to check its settings."
  return `Something went wrong (${code || "unknown error"}). Try again.`
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
  async function withProvider(which: "google" | "microsoft") {
    setErr("")
    setBusy(true)
    try {
      await remember()
      const provider = which === "google" ? new GoogleAuthProvider() : new OAuthProvider("microsoft.com")
      if (provider instanceof OAuthProvider) provider.setCustomParameters({ prompt: "select_account" })
      await signInWithPopup(auth, provider)
    } catch (x) {
      setErr(message((x as { code?: string })?.code || ""))
    } finally {
      setBusy(false)
    }
  }

  const label: Record<Mode, [string, string]> = { in: ["Log in", "Logging in…"], up: ["Create account", "Creating account…"], forgot: ["Email me a reset link", "Sending…"] }
  return (
    <div className="min-h-screen bg-background">
      <div className="wrap grid min-h-screen max-w-[1080px] content-center gap-10 py-12 md:grid-cols-[1fr_420px] md:items-center md:gap-16">
        <div>
          <Wordmark tagline />
          <h1 className="mt-10 max-w-[14ch] font-display text-[clamp(32px,6vw,52px)] font-medium leading-[1.1]">Locum work, invoiced and paid.</h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted-foreground">
            Log shifts, services and mileage as you go. Turn them into invoices in one tap, follow up when payments are late, and see what you owe in tax.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-6 text-card-foreground sm:p-8">
          {mode !== "forgot" ? (
            <div role="tablist" aria-label="Log in or create an account" className="mb-6 flex rounded-full bg-secondary p-1">
              {(["in", "up"] as const).map((m) => (
                <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => { setMode(m); setInfo("") }}
                  className={cn("flex-1 rounded-full py-2 text-[14px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === m && "bg-card text-foreground")}>
                  {m === "in" ? "Log in" : "Create account"}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-4">
              <h2 className="font-display text-[22px] font-medium">Forgot your password?</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Enter your account email and we’ll send you a link to choose a new one. Your entries and invoices are kept.</p>
            </div>
          )}
          {info && <p className="mb-4 rounded-xl bg-ok-tint px-3 py-2.5 text-[13px] text-brand-ink">{info}</p>}

          {mode !== "forgot" && (
            <>
              <Button type="button" variant="outline" className="h-11 w-full gap-2.5 text-[14.5px]" disabled={busy} onClick={() => withProvider("google")}>
                <GoogleLogo />
                Continue with Google
              </Button>
              {microsoftLogin && (
                <Button type="button" variant="outline" className="mt-2 h-11 w-full gap-2.5 text-[14.5px]" disabled={busy} onClick={() => withProvider("microsoft")}>
                  <MicrosoftLogo className="size-[18px]" />
                  Continue with Microsoft
                </Button>
              )}
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
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">Your account works on any phone or computer. Only you can see your entries and invoices. <a href={`${import.meta.env.BASE_URL}privacy.html`} className="font-medium text-brand-ink hover:underline">Privacy policy</a></p>
        </div>
      </div>
    </div>
  )
}
