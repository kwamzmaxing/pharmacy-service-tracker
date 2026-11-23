// App lock with Face ID, Touch ID, fingerprint or the device PIN, using the phone's built-in
// authenticator (WebAuthn, the same technology as passkeys). It's a lock on this device's copy of the
// app, so someone who picks up your unlocked phone can't open your bank details and invoices.
// It doesn't replace your password: your account and data are still protected by your log-in.
type LockSettings = { credentialId: string; afterMins: number }
const key = (uid: string) => `pst_lock_${uid}`

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
const challenge = () => crypto.getRandomValues(new Uint8Array(32))

export async function lockAvailable() {
  try {
    return !!window.PublicKeyCredential && window.isSecureContext && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}
export function lockSettings(uid: string): LockSettings | null {
  try { return JSON.parse(localStorage.getItem(key(uid)) || "null") } catch { return null }
}
export function setLockAfter(uid: string, afterMins: number) {
  const s = lockSettings(uid)
  if (s) localStorage.setItem(key(uid), JSON.stringify({ ...s, afterMins }))
}
export function disableLock(uid: string) {
  try { localStorage.removeItem(key(uid)) } catch { /* ignore */ }
}

/** Turn the lock on: the phone asks for Face ID, fingerprint or PIN once to set it up. */
export async function enableLock(uid: string, email: string, name: string) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: "KASA.Rx", id: location.hostname },
      user: { id: new TextEncoder().encode(uid).slice(0, 64), name: email || uid, displayName: name || email || "KASA.Rx" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error("cancelled")
  localStorage.setItem(key(uid), JSON.stringify({ credentialId: b64(cred.rawId), afterMins: 5 } satisfies LockSettings))
}

/** Ask for Face ID, fingerprint or PIN. Resolves true when the person passes. */
export async function unlock(uid: string) {
  const s = lockSettings(uid)
  if (!s) return true
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: unb64(s.credentialId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    })
    return !!got
  } catch {
    return false
  }
}
