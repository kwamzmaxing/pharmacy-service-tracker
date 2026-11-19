// Tracker accounts: email + password, stored in the shared database but
// encrypted, so other people who can open the page can't read anyone's data.
//
//   accounts/<id>                  { salt, iter, verifier, wrapped }   (id = hash of the email)
//   vaults/<id>/docs/<docId>       { iv, ct }                          (AES-GCM, one per data document)
//
// The password derives two values with PBKDF2: a key that unlocks the
// account's random data key, and a verifier that checks the password.
// The email itself is never stored.
import { assembleDocs, buildDocs, type Data, type DocMap } from "./model"
import type { Json, KV } from "./kv"

const ITER = 310_000
const enc = { encode: (t: string): Bytes => new TextEncoder().encode(t) as Bytes }
const dec = new TextDecoder()
const b64 = (u: ArrayBuffer | Uint8Array) => {
  const a = u instanceof Uint8Array ? u : new Uint8Array(u)
  let s = ""
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string): Bytes => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
type Bytes = Uint8Array<ArrayBuffer>
const rand = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n))
const hex = (u: ArrayBuffer) => [...new Uint8Array(u)].map((b) => b.toString(16).padStart(2, "0")).join("")

export const normEmail = (e: string) => e.trim().toLowerCase()
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
export async function accountId(email: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode("pst-account:" + normEmail(email)))).slice(0, 40)
}

type AccountDoc = { v: 1; salt: string; iter: number; verifier: string; wrapped: { iv: string; ct: string }; created: string }

async function derive(password: string, salt: Bytes, iter: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, 512))
  const kek = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"])
  return { kek, verifier: b64(bits.slice(32)) }
}
async function seal(key: CryptoKey, bytes: Bytes) {
  const iv = rand(12)
  return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes)) }
}
async function open(key: CryptoKey, box: { iv: string; ct: string }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct)))
}
const importDek = (raw: Bytes) => crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"])
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

export type Session = { id: string; email: string; dek: CryptoKey }
export const exportDek = async (s: Session) => new Uint8Array(await crypto.subtle.exportKey("raw", s.dek)) as Bytes

/** Point an account at a new password, keeping the same data key (used by reset links). */
async function setPassword(kv: KV, id: string, password: string, dekRaw: Bytes) {
  const doc = (await kv.get("accounts/" + id)) as unknown as AccountDoc | null
  if (!doc) throw new AuthError("no_account")
  const salt = rand(16)
  const { kek, verifier } = await derive(password, salt, ITER)
  await kv.set("accounts/" + id, { ...doc, salt: b64(salt), iter: ITER, verifier, wrapped: await seal(kek, dekRaw) } as unknown as Json)
}

/* ---------- reset links ---------- */
// resets/<id>  { salt, iter, wrapped, expires }   the data key, locked with a one-time code sent by email
const RESET_ITER = 120_000
const CODE_CHARS = "abcdefghijkmnpqrstuvwxyz23456789"
/** 12 characters shown as xxxx-xxxx-xxxx; 32-letter alphabet with no look-alike characters. */
export function newResetCode() {
  const c = [...rand(12)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("")
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`
}
export const cleanCode = (c: string) => c.toLowerCase().replace(/[^a-z0-9]/g, "")
export async function createReset(kv: KV, id: string, dekRaw: Bytes, code: string, days = 3) {
  const salt = rand(16)
  const { kek } = await derive(cleanCode(code), salt, RESET_ITER)
  const expires = new Date(Date.now() + days * 86400000).toISOString()
  await kv.set("resets/" + id, { salt: b64(salt), iter: RESET_ITER, wrapped: await seal(kek, dekRaw), expires })
  return expires
}
export class ResetError extends Error {
  code: "missing" | "expired" | "bad_code" | "unreachable"
  constructor(code: ResetError["code"]) {
    super(code)
    this.code = code
  }
}
/** Use a reset link: unlock the data key with the code, set the new password, sign in. */
export async function useReset(kv: KV, id: string, code: string, email: string, newPassword: string): Promise<Session> {
  let doc: Json | null
  try {
    doc = await kv.get("resets/" + id)
  } catch {
    throw new ResetError("unreachable")
  }
  if (!doc) throw new ResetError("missing")
  if (String(doc.expires) < new Date().toISOString()) throw new ResetError("expired")
  if ((await accountId(email)) !== id) throw new ResetError("bad_code")
  let dekRaw: Bytes
  try {
    const { kek } = await derive(cleanCode(code), unb64(String(doc.salt)), Number(doc.iter) || RESET_ITER)
    dekRaw = await open(kek, doc.wrapped as { iv: string; ct: string })
  } catch {
    throw new ResetError("bad_code")
  }
  await setPassword(kv, id, newPassword, dekRaw)
  await kv.del("resets/" + id).catch(() => {})
  return { id, email: normEmail(email), dek: await importDek(dekRaw) }
}
export type AuthCode = "exists" | "no_account" | "wrong_password" | "unreachable" | "blocked"
export class AuthError extends Error {
  code: AuthCode
  constructor(code: AuthCode) {
    super(code)
    this.code = code
  }
}

function asAuthError(e: unknown): never {
  if (e instanceof AuthError) throw e
  const code = (e as { code?: string })?.code
  if (code === "invalid_argument") throw new AuthError("blocked")
  throw new AuthError("unreachable")
}

export async function signUp(kv: KV, email: string, password: string): Promise<Session> {
  try {
    const id = await accountId(email)
    if (await kv.get("accounts/" + id)) throw new AuthError("exists")
    const salt = rand(16)
    const { kek, verifier } = await derive(password, salt, ITER)
    const dekRaw = rand(32)
    const doc: AccountDoc = { v: 1, salt: b64(salt), iter: ITER, verifier, wrapped: await seal(kek, dekRaw), created: new Date().toISOString() }
    await kv.set("accounts/" + id, doc as unknown as Json)
    return { id, email: normEmail(email), dek: await importDek(dekRaw) }
  } catch (e) {
    asAuthError(e)
  }
}

export async function signIn(kv: KV, email: string, password: string): Promise<Session> {
  try {
    const id = await accountId(email)
    const doc = (await kv.get("accounts/" + id)) as unknown as AccountDoc | null
    if (!doc) throw new AuthError("no_account")
    const { kek, verifier } = await derive(password, unb64(doc.salt), doc.iter || ITER)
    if (!sameText(verifier, doc.verifier)) throw new AuthError("wrong_password")
    return { id, email: normEmail(email), dek: await importDek(await open(kek, doc.wrapped)) }
  } catch (e) {
    asAuthError(e)
  }
}

export async function changePassword(kv: KV, s: Session, current: string, next: string) {
  const doc = (await kv.get("accounts/" + s.id)) as unknown as AccountDoc | null
  if (!doc) throw new AuthError("no_account")
  const old = await derive(current, unb64(doc.salt), doc.iter || ITER)
  if (!sameText(old.verifier, doc.verifier)) throw new AuthError("wrong_password")
  const dekRaw = new Uint8Array(await crypto.subtle.exportKey("raw", s.dek))
  const salt = rand(16)
  const { kek, verifier } = await derive(next, salt, ITER)
  const updated: AccountDoc = { ...doc, salt: b64(salt), iter: ITER, verifier, wrapped: await seal(kek, dekRaw) }
  await kv.set("accounts/" + s.id, updated as unknown as Json)
}

export async function deleteAccount(kv: KV, s: Session) {
  for (const d of await kv.list(`vaults/${s.id}/docs`)) await kv.del(`vaults/${s.id}/docs/${d.id}`)
  await kv.del("accounts/" + s.id)
}

/* ---------- remembered sign-in on this device ---------- */
const SESSION_KEY = "pst_session_v3"
export async function rememberSession(s: Session, keep: boolean) {
  const raw = { id: s.id, email: s.email, dek: b64(await crypto.subtle.exportKey("raw", s.dek)) }
  const str = JSON.stringify(raw)
  try {
    sessionStorage.setItem(SESSION_KEY, str)
    if (keep) localStorage.setItem(SESSION_KEY, str)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* not remembered */
  }
}
export async function recallSession(): Promise<Session | null> {
  let str: string | null = null
  try {
    str = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
  if (!str) return null
  try {
    const raw = JSON.parse(str)
    return { id: raw.id, email: raw.email, dek: await importDek(unb64(raw.dek)) }
  } catch {
    return null
  }
}
export function forgetSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/* ---------- the signed-in person's data ---------- */
export type SaveProblem = "blocked" | "offline" | "full" | "failed"
export type Vault = {
  load(): Promise<Data | null>
  save(d: Data): Promise<void>
  /** Re-read; resolves new data only if it changed on another device. */
  refresh(): Promise<Data | null>
}

export function openVault(kv: KV, s: Session, onProblem: (p: SaveProblem) => void): Vault {
  const col = `vaults/${s.id}/docs`
  let last: Record<string, string> = {}
  let chain: Promise<void> = Promise.resolve()

  async function write(fn: () => Promise<void>) {
    try {
      await fn()
      return true
    } catch (e) {
      const code = (e as { code?: string })?.code
      onProblem(code === "invalid_argument" ? "blocked" : code === "quota_exceeded" ? "full" : code === "unavailable" || code === "timeout" ? "offline" : "failed")
      return false
    }
  }
  async function flush(docs: DocMap) {
    for (const [k, v] of Object.entries(docs)) {
      const plain = JSON.stringify(v)
      if (last[k] === plain) continue
      const box = await seal(s.dek, enc.encode(plain))
      if (await write(() => kv.set(`${col}/${k}`, box))) last[k] = plain
    }
    for (const k of Object.keys(last)) {
      if (!(k in docs) && (await write(() => kv.del(`${col}/${k}`)))) delete last[k]
    }
  }
  async function load() {
    const rows = await kv.list(col)
    const docs: DocMap = {}
    for (const r of rows) {
      try {
        docs[r.id] = JSON.parse(dec.decode(await open(s.dek, r.data as { iv: string; ct: string })))
      } catch {
        /* unreadable document: skip */
      }
    }
    last = Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, JSON.stringify(v)]))
    return assembleDocs(docs)
  }
  return {
    load,
    save(d) {
      const docs = buildDocs(d)
      chain = chain.then(() => flush(docs))
      return chain
    },
    async refresh() {
      await chain
      const before = JSON.stringify(last)
      const d = await load()
      return JSON.stringify(last) !== before ? d : null
    },
  }
}
