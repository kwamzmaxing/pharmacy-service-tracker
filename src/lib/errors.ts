// Crash reports: when something breaks in someone's browser, a short report goes to the `errors`
// collection, which only the admin can read (Admin tab). No tracker data is included: just the error,
// the page, the browser and the user ID. At most 5 reports per visit, and each message only once.
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query } from "firebase/firestore"
import { auth, db } from "./firebase"

export type ErrorReport = { id: string; at: string; message: string; stack: string; page: string; ua: string; uid: string; version: string }
const sent = new Set<string>()
let page = "start"
export const setErrorPage = (p: string) => { page = p }

export function reportError(err: unknown, where = "") {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err)?.slice(0, 300) || "Unknown error")
    const message = (where ? `[${where}] ` : "") + (e.message || String(e))
    // Network blips and browser extensions aren't bugs in the tracker
    if (/Failed to fetch|NetworkError|Load failed|ResizeObserver loop|chrome-extension:|moz-extension:/i.test(message + (e.stack || ""))) return
    const uid = auth.currentUser?.uid
    if (!uid || sent.has(message) || sent.size >= 5) return
    sent.add(message)
    addDoc(collection(db, "errors"), {
      at: new Date().toISOString(),
      message: message.slice(0, 500),
      stack: (e.stack || "").slice(0, 2000),
      page: page.slice(0, 60),
      ua: navigator.userAgent.slice(0, 200),
      uid,
      version: String(import.meta.env.VITE_BUILD || "dev").slice(0, 40),
    }).catch(() => {})
  } catch { /* never let reporting break the page */ }
}

export function watchErrors() {
  window.addEventListener("error", (e) => reportError(e.error || e.message))
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "promise"))
}

export async function listErrors(): Promise<ErrorReport[]> {
  const snap = await getDocs(query(collection(db, "errors"), orderBy("at", "desc"), limit(50)))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ErrorReport, "id">) }))
}
export const clearError = (id: string) => deleteDoc(doc(db, "errors", id))
