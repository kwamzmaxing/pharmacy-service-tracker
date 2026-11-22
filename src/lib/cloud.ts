// Everything the tracker stores in Firestore.
//
//   users/{uid}                 { name, email, created, lastLogin }   the person; the admin can read it
//   users/{uid}/docs/{docId}    core / m-YYYY-MM / inv-<id>           the person's tracker, only they can read it
//   feedback/{id}               { uid, name, email, topic, rating, message, at }
//   outbox/{id}                 emails waiting to go out from the admin's Gmail
//   admins/{uid}                exists → that person is an admin (created in the Firebase console)
//   settings/public             { adminName, relay, sheetId, sheetUrl, sheetUpdatedAt }
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type Unsubscribe,
} from "firebase/firestore"
import { db } from "./firebase"
import { assembleDocs, buildDocs, type Data, type DocMap } from "./model"

export type SaveProblem = "offline" | "failed" | "full"

/* ---------- the person's tracker ---------- */
export type Vault = {
  load(): Promise<Data | null>
  save(d: Data): Promise<void>
  /** Hear changes made on another device. */
  watch(onChange: (d: Data) => void): Unsubscribe
}
export function openVault(uid: string, onProblem: (p: SaveProblem) => void): Vault {
  const col = collection(db, "users", uid, "docs")
  let last: Record<string, string> = {}
  let chain: Promise<void> = Promise.resolve()
  const remember = (docs: DocMap) => (last = Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, JSON.stringify(v)])))

  async function write(fn: () => Promise<void>) {
    try {
      await fn()
      return true
    } catch (e) {
      const code = (e as { code?: string })?.code || ""
      onProblem(code.includes("resource-exhausted") ? "full" : code.includes("unavailable") ? "offline" : "failed")
      return false
    }
  }
  async function flush(docs: DocMap) {
    for (const [k, v] of Object.entries(docs)) {
      const s = JSON.stringify(v)
      if (last[k] === s) continue
      if (await write(() => setDoc(doc(col, k), v))) last[k] = s
    }
    for (const k of Object.keys(last)) if (!(k in docs) && (await write(() => deleteDoc(doc(col, k))))) delete last[k]
  }
  return {
    async load() {
      const snap = await getDocs(col)
      const docs: DocMap = {}
      snap.forEach((d) => (docs[d.id] = d.data()))
      remember(docs)
      return assembleDocs(docs)
    },
    save(d) {
      const docs = buildDocs(d)
      chain = chain.then(() => flush(docs))
      return chain
    },
    watch(onChange) {
      return onSnapshot(col, (snap) => {
        if (snap.metadata.hasPendingWrites) return
        const docs: DocMap = {}
        snap.forEach((d) => (docs[d.id] = d.data()))
        const next = JSON.stringify(Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, JSON.stringify(v)])))
        if (next === JSON.stringify(last)) return
        remember(docs)
        const data = assembleDocs(docs)
        if (data) onChange(data)
      }, () => { /* offline or signed out: keep what's on screen */ })
    },
  }
}
export async function wipeVault(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "docs"))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}

/* ---------- the person (what the admin sees) ---------- */
export type Person = { uid: string; name: string; email: string; created?: string; lastLogin?: string }
export async function recordPerson(uid: string, p: { name: string; email: string; isNew: boolean }) {
  const now = new Date().toISOString()
  await setDoc(doc(db, "users", uid), { name: p.name.slice(0, 120), email: p.email, lastLogin: now, ...(p.isNew ? { created: now } : {}) }, { merge: true })
}
export const forgetPerson = (uid: string) => deleteDoc(doc(db, "users", uid))
/** Everything else stored under this person's ID: feedback, emails queued for the admin, the daily email count, crash reports. */
export async function wipeOwnRecords(uid: string) {
  // Each part on its own, so one failure (for example older database rules) never stops the account being deleted
  for (const c of ["feedback", "outbox", "errors"]) {
    try {
      const snap = await getDocs(query(collection(db, c), where("uid", "==", uid)))
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})))
    } catch { /* not allowed or offline: carry on */ }
  }
  await deleteDoc(doc(db, "outboxQuota", uid)).catch(() => {})
}
export async function listPeople(): Promise<Person[]> {
  const snap = await getDocs(collection(db, "users"))
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Person, "uid">) })).sort((a, b) => (a.name || "").localeCompare(b.name || ""))
}

/* ---------- admin ---------- */
export async function isAdmin(uid: string) {
  try {
    return (await getDoc(doc(db, "admins", uid))).exists()
  } catch {
    return false
  }
}
export type PublicSettings = { adminName: string; relay: boolean; sheetId?: string; sheetUrl?: string; sheetUpdatedAt?: string }
export async function getSettings(): Promise<PublicSettings | null> {
  try {
    const s = await getDoc(doc(db, "settings", "public"))
    return s.exists() ? (s.data() as PublicSettings) : null
  } catch {
    return null
  }
}
export const saveSettings = (s: Partial<PublicSettings>) => setDoc(doc(db, "settings", "public"), s, { merge: true })

/* ---------- feedback ---------- */
export type Feedback = { id: string; uid: string; name: string; email: string; topic: string; rating: number; message: string; at: string }
export const sendFeedback = (f: Omit<Feedback, "id" | "at">) => addDoc(collection(db, "feedback"), { ...f, name: f.name.slice(0, 120), at: new Date().toISOString(), ts: serverTimestamp() })
export async function listFeedback(): Promise<Feedback[]> {
  const snap = await getDocs(query(collection(db, "feedback"), orderBy("at", "desc")))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, "id">) }))
}

/* ---------- emails sent through the admin ---------- */
export type OutboxItem = {
  id: string
  uid: string
  name: string
  email: string
  kind: "invoice" | "followup"
  invoiceId: string
  invoiceNumber: string
  to: string
  subject: string
  body: string
  attachment?: { filename: string; mimeType: string; content: string }
  status: "new" | "done" | "failed"
  at: string
  doneAt?: string
  error?: string
}
/** Most emails one person can queue for the admin in a day (also enforced by firestore.rules). */
export const OUTBOX_DAILY_LIMIT = 10
export class QueueLimit extends Error {}
/** Queue an email for the admin to review and send, counting it against today's limit in the same write. */
export async function queueEmail(m: Omit<OutboxItem, "id" | "at" | "status">) {
  const quotaRef = doc(db, "outboxQuota", m.uid)
  const q = await getDoc(quotaRef)
  const day = Math.floor(Date.now() / 86400000)
  const prev = q.exists() && q.data().day === day ? Number(q.data().n) || 0 : 0
  if (prev >= OUTBOX_DAILY_LIMIT) throw new QueueLimit()
  const ref = doc(collection(db, "outbox"))
  const batch = writeBatch(db)
  batch.set(ref, { ...m, status: "new", at: new Date().toISOString() })
  batch.set(quotaRef, { day, n: prev + 1, last: ref.id })
  await batch.commit()
}
export async function myOutbox(uid: string): Promise<OutboxItem[]> {
  const snap = await getDocs(query(collection(db, "outbox"), where("uid", "==", uid)))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OutboxItem, "id">) }))
}
export async function listOutbox(): Promise<OutboxItem[]> {
  const snap = await getDocs(query(collection(db, "outbox"), orderBy("at", "desc")))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OutboxItem, "id">) }))
}
export const markOutbox = (id: string, patch: Partial<OutboxItem>) =>
  updateDoc(doc(db, "outbox", id), { ...patch, doneAt: new Date().toISOString(), ...(patch.status === "done" ? { attachment: null } : {}) })

/* ---------- receipt photos: users/{uid}/receipts/{id}, kept out of the main tracker documents ---------- */
export const saveReceipt = (uid: string, id: string, image: string) => setDoc(doc(db, "users", uid, "receipts", id), { image, at: new Date().toISOString() })
export async function getReceipt(uid: string, id: string): Promise<string | null> {
  const s = await getDoc(doc(db, "users", uid, "receipts", id))
  return s.exists() ? (s.data().image as string) : null
}
export const deleteReceipt = (uid: string, id: string) => deleteDoc(doc(db, "users", uid, "receipts", id))
export async function wipeReceipts(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "receipts"))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}
