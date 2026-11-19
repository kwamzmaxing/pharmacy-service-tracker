// The page owner's admin tools: account directory, recovery, an inbox of
// requests (password resets, emails to send from the admin's Gmail, feedback).
//
//   admin/config              { publicKey, adminName, relay, sheet }        everyone reads, admin writes
//   data/users/<owner>/adminkey  { privateKey }                             only the owner can read
//   directory/<viewer>        { accounts: { <id>: DirEntry } }              each viewer writes their own, admin reads all
//   inbox/<viewer>            { items: { <itemId>: InboxItem } }            each viewer writes their own, admin reads all
//
// <viewer> is the claude.ai viewer id; several tracker accounts can share one.
import type { Json, KV } from "./kv"
import { uid } from "./model"

export type AdminConfig = {
  publicKey: JsonWebKey
  adminName: string
  /** Account holders may send emails through the admin's Gmail. */
  relay: boolean
  /** Send waiting emails automatically whenever the owner opens the tracker. */
  autoSend?: boolean
  sheet?: { id?: string; url?: string; updatedAt: string }
}
export type DirEntry = {
  name: string
  email: string
  created: string
  lastLogin: string
  /** The account's data key, locked to the admin's recovery key. */
  recovery?: string
}
type Base = { id: string; acctId: string; email: string; name: string; at: string; status: "new" | "done" | "failed"; doneAt?: string; error?: string }
export type InboxItem =
  | (Base & { type: "reset" })
  | (Base & { type: "email"; kind: "invoice" | "followup"; invoiceId: string; invoiceNumber: string; to: string; subject: string; body: string; attachment?: { filename: string; mimeType: string; content: string } })
  | (Base & { type: "feedback"; rating: number; topic: string; message: string })

const b64 = (u: ArrayBuffer | Uint8Array) => {
  const a = u instanceof Uint8Array ? u : new Uint8Array(u)
  let s = ""
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const RSA = { name: "RSA-OAEP", hash: "SHA-256" } as const

/* ---------- config ---------- */
export async function getConfig(kv: KV): Promise<AdminConfig | null> {
  try {
    return ((await kv.get("admin/config")) as unknown as AdminConfig) || null
  } catch {
    return null
  }
}
export const saveConfig = (kv: KV, c: AdminConfig) => kv.set("admin/config", c as unknown as Json)

/** First-time setup by the owner: make the recovery key pair. */
export async function setUpAdmin(kv: KV, ownerUid: string, adminName: string) {
  const pair = (await crypto.subtle.generateKey(
    { ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey)
  await kv.set(`data/users/${ownerUid}/adminkey`, { privateKey: privateKey as unknown as Json, created: new Date().toISOString() })
  const cfg: AdminConfig = { publicKey, adminName, relay: true }
  await saveConfig(kv, cfg)
  return cfg
}
export async function loadPrivateKey(kv: KV, ownerUid: string): Promise<CryptoKey | null> {
  const d = await kv.get(`data/users/${ownerUid}/adminkey`).catch(() => null)
  if (!d?.privateKey) return null
  return crypto.subtle.importKey("jwk", d.privateKey as JsonWebKey, RSA, false, ["decrypt"])
}

/* ---------- directory ---------- */
export async function recordAccount(kv: KV, viewer: string, acctId: string, entry: Partial<DirEntry> & { email: string }, dekRaw: Uint8Array, cfg: AdminConfig | null) {
  const e: Partial<DirEntry> = { ...entry, lastLogin: new Date().toISOString() }
  if (cfg?.publicKey) {
    const pub = await crypto.subtle.importKey("jwk", cfg.publicKey, RSA, false, ["encrypt"])
    e.recovery = b64(await crypto.subtle.encrypt(RSA, pub, dekRaw as Uint8Array<ArrayBuffer>))
  }
  await kv.merge(`directory/${viewer}`, { accounts: { [acctId]: e } })
}
export async function forgetAccount(kv: KV, viewer: string, acctId: string) {
  const d = await kv.get(`directory/${viewer}`).catch(() => null)
  if (!d) return
  const accounts = { ...((d.accounts as Record<string, unknown>) || {}) }
  delete accounts[acctId]
  await kv.set(`directory/${viewer}`, { ...d, accounts })
}
export type AccountRow = DirEntry & { acctId: string; viewer: string }
export async function listAccounts(kv: KV): Promise<AccountRow[]> {
  const rows = await kv.list("directory")
  const out: AccountRow[] = []
  for (const r of rows) for (const [acctId, e] of Object.entries((r.data.accounts as Record<string, DirEntry>) || {})) out.push({ ...e, acctId, viewer: r.id })
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
export async function unlockForReset(priv: CryptoKey, recovery: string) {
  return new Uint8Array(await crypto.subtle.decrypt(RSA, priv, unb64(recovery)))
}

/* ---------- inbox ---------- */
type DOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewItem = DOmit<InboxItem, "id" | "at" | "status">
export async function postItem(kv: KV, viewer: string, item: NewItem) {
  const full = { ...item, id: uid() + uid(), at: new Date().toISOString(), status: "new" } as InboxItem
  const cur = await kv.get(`inbox/${viewer}`).catch(() => null)
  const items = { ...((cur?.items as Record<string, InboxItem>) || {}) }
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  for (const [k, it] of Object.entries(items)) {
    if (it.status !== "new" && (it.doneAt || it.at) < cutoff) delete items[k]
    else if (it.status !== "new" && it.type === "email" && it.attachment) items[k] = { ...it, attachment: undefined }
  }
  items[full.id] = full
  await kv.set(`inbox/${viewer}`, { items: JSON.parse(JSON.stringify(items)) })
  return full
}
export async function myItems(kv: KV, viewer: string): Promise<InboxItem[]> {
  const d = await kv.get(`inbox/${viewer}`).catch(() => null)
  return Object.values((d?.items as Record<string, InboxItem>) || {})
}
export type InboxRow = InboxItem & { viewer: string }
export async function listInbox(kv: KV): Promise<InboxRow[]> {
  const rows = await kv.list("inbox")
  const out: InboxRow[] = []
  for (const r of rows) for (const it of Object.values((r.data.items as Record<string, InboxItem>) || {})) out.push({ ...it, viewer: r.id })
  return out.sort((a, b) => b.at.localeCompare(a.at))
}
export const markItem = (kv: KV, viewer: string, id: string, patch: Partial<Base>) =>
  kv.merge(`inbox/${viewer}`, { items: { [id]: { ...patch, doneAt: new Date().toISOString() } } })

/** The page's address on claude.ai, for links in emails. */
export const PAGE_URL = "https://claude.ai/artifact/4huXhKykyFuNvDhViVwXxa"
export const RESET_URL = PAGE_URL + "#reset" 
