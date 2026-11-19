import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { accountId, AuthError, cleanCode, ResetError, signIn, signUp, useReset, validEmail, type AuthCode, type Session } from "@/lib/accounts"
import { postItem, type AdminConfig } from "@/lib/admin"
import type { KV } from "@/lib/kv"
import { Field } from "./bits"

const MESSAGES: Record<AuthCode, string> = {
  exists: "There’s already an account with that email. Log in instead.",
  no_account: "No account uses that email. Check it, or create an account.",
  wrong_password: "That password isn’t right. Try again, or reset it.",
  unreachable: "The tracker can’t be reached right now. Check your connection and try again.",
  blocked: "You can’t create accounts on this page with view-only access. Ask the person who shared it for Contributor access.",
}
const RESET_MESSAGES: Record<ResetError["code"], string> = {
  missing: "There’s no reset waiting for that email. Ask for a new reset link.",
  expired: "That reset code has expired. Ask for a new one.",
  bad_code: "That code or email isn’t right. Check the email you were sent.",
  unreachable: "The tracker can’t be reached right now. Check your connection and try again.",
}

type Mode = "in" | "up" | "forgot" | "reset"
type Props = {
  kv: KV
  viewer: string | null
  cfg: AdminConfig | null
  startMode?: Mode
  notice?: string
  onSignedIn: (s: Session, keep: boolean, isNew: boolean, name: string) => void
}

export function AuthScreen({ kv, viewer, cfg, startMode = "in", notice, onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>(startMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")
  const [code, setCode] = useState("")
  const [keep, setKeep] = useState(true)
  const [err, setErr] = useState("")
  const [info, setInfo] = useState(notice || "")
  const [busy, setBusy] = useState(false)
  const fieldsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setErr("")
    fieldsRef.current?.querySelector("input")?.focus()
  }, [mode])
  useEffect(() => setInfo(notice || ""), [notice])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    if (mode === "up" && !name.trim()) return setErr("Enter your full name.")
    if (!validEmail(email)) return setErr("Enter a valid email address.")
    if (mode === "forgot") return requestReset()
    if (mode === "reset" && cleanCode(code).length < 12) return setErr("Enter the 12-character code from the email.")
    if ((mode === "up" || mode === "reset") && pw.length < 8) return setErr("Use a password of at least 8 characters.")
    if ((mode === "up" || mode === "reset") && pw !== pw2) return setErr("The passwords don’t match.")
    if (mode === "in" && !pw) return setErr("Enter your password.")
    setBusy(true)
    try {
      if (mode === "reset") {
        const s = await useReset(kv, await accountId(email), code, email, pw)
        try { history.replaceState(null, "", location.pathname + location.search) } catch { /* ignore */ }
        onSignedIn(s, keep, false, "")
      } else {
        const s = mode === "up" ? await signUp(kv, email, pw) : await signIn(kv, email, pw)
        onSignedIn(s, keep, mode === "up", name.trim())
      }
    } catch (x) {
      if (x instanceof ResetError) setErr(RESET_MESSAGES[x.code])
      else setErr(x instanceof AuthError ? MESSAGES[x.code] : MESSAGES.unreachable)
      if (x instanceof AuthError && x.code === "exists") setMode("in")
    } finally {
      setBusy(false)
    }
  }

  async function requestReset() {
    if (!cfg) return setErr("Password reset isn’t set up on this page yet. Ask the person who runs it.")
    if (!viewer) return setErr("Password reset needs you to be signed in to claude.ai.")
    setBusy(true)
    try {
      await postItem(kv, viewer, { type: "reset", acctId: await accountId(email), email: email.trim().toLowerCase(), name: "" })
      setInfo(`Request sent. ${cfg.adminName || "The admin"} will email a reset code to that address if it has an account. Then come back and choose “I have a reset code”.`)
      setMode("in")
    } catch {
      setErr(MESSAGES.unreachable)
    } finally {
      setBusy(false)
    }
  }

  const cloud = kv.kind === "cloud"
  const titles: Record<Mode, string> = { in: "Log in", up: "Create account", forgot: "Forgot your password?", reset: "Choose a new password" }
  const actions: Record<Mode, [string, string]> = {
    in: ["Log in", "Logging in…"], up: ["Create account", "Creating account…"], forgot: ["Send reset request", "Sending…"], reset: ["Save new password", "Saving…"],
  }
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
            <li>Email invoices, put due dates in your calendar, and follow up on late payments.</li>
          </ul>
        </div>

        <div className="rounded-[18px] border bg-card p-6 text-card-foreground shadow-[0_18px_50px_-20px_rgba(0,0,0,.45)]">
          {mode === "in" || mode === "up" ? (
            <div role="tablist" aria-label="Log in or create an account" className="mb-5 flex rounded-[10px] bg-secondary p-1">
              {(["in", "up"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setInfo("") }}
                  className={cn("flex-1 rounded-lg py-2 text-[13.5px] font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === m && "bg-card text-brand-ink shadow-sm")}
                >
                  {m === "in" ? "Log in" : "Create account"}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-4">
              <h2 className="font-display text-[18px] font-bold">{titles[mode]}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {mode === "forgot"
                  ? `Enter your account email. ${cfg?.adminName || "The admin"} will email you a reset code.`
                  : "Enter your account email, the code from your reset email, and a new password."}
              </p>
            </div>
          )}
          {info && <p className="mb-4 rounded-[9px] bg-ok-tint px-3 py-2.5 text-[13px] text-brand-ink">{info}</p>}
          <form onSubmit={submit} noValidate className="grid gap-3">
            <div ref={fieldsRef} className="grid gap-3">
              {mode === "up" && <Field id="a-name" label="Full name" autoComplete="name" placeholder="As it should appear on invoices" value={name} onChange={(e) => setName(e.target.value)} />}
              <Field id="a-email" label="Email" type="email" autoComplete={mode === "up" ? "email" : "username"} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              {mode === "reset" && <Field id="a-code" label="Reset code" autoComplete="one-time-code" placeholder="xxxx-xxxx-xxxx" value={code} onChange={(e) => setCode(e.target.value)} />}
              {mode !== "forgot" && (
                <Field id="a-pw" label={mode === "reset" ? "New password" : "Password"} type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder={mode === "in" ? "" : "At least 8 characters"} value={pw} onChange={(e) => setPw(e.target.value)} />
              )}
              {(mode === "up" || mode === "reset") && <Field id="a-pw2" label="Confirm password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}
            </div>
            {mode !== "forgot" && (
              <label htmlFor="a-keep" className="mt-1 flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                <Checkbox id="a-keep" checked={keep} onCheckedChange={(v) => setKeep(v === true)} />
                Keep me logged in on this device
              </label>
            )}
            <p role="alert" className="min-h-[18px] text-[13px] text-danger-ink">{err}</p>
            <Button type="submit" disabled={busy} className="h-11 text-[14.5px]">{busy ? actions[mode][1] : actions[mode][0]}</Button>
          </form>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-[13px]">
            {mode === "in" ? (
              <>
                <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => { setMode("forgot"); setInfo("") }}>Forgot password?</button>
                <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => { setMode("reset"); setInfo("") }}>I have a reset code</button>
              </>
            ) : mode !== "up" ? (
              <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => setMode("in")}>Back to log in</button>
            ) : null}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            {cloud
              ? "Your account works on any device that opens this page. Your data is locked with your password, so other people who use this page can’t read it."
              : "Accounts on this copy are saved in this browser only."}
          </p>
        </div>
      </div>
    </div>
  )
}
