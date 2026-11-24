// How long KASA.Rx keeps the records that aren't part of someone's own tracker. The privacy policy
// (public/privacy.html, "How long we keep it") states these same periods, so change both together.
// Run when the administrator opens Admin, since only the administrator can delete these records.
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore"
import { db } from "./firebase"

const DAY = 86_400_000
export const RETENTION = {
  /** Crash reports. */
  errorsDays: 90,
  /** Emails sent through the administrator, once sent or marked not sent (the PDF is removed as soon as it's sent). */
  outboxDays: 30,
  /** "Talk to an accountant" requests, once they've been dealt with (no longer "new"). */
  requestsDays: 365,
  /** Feedback. */
  feedbackDays: 730,
}
const older = (iso: unknown, days: number) => typeof iso === "string" && iso > "" && Date.now() - new Date(iso).getTime() > days * DAY

/** Delete records past their retention period. Returns how many were removed. */
export async function applyRetention(): Promise<number> {
  const before = (days: number) => new Date(Date.now() - days * DAY).toISOString()
  let n = 0
  const drop = async (col: string, id: string) => { try { await deleteDoc(doc(db, col, id)); n++ } catch { /* try again next time */ } }
  const jobs: Promise<void>[] = []
  jobs.push(getDocs(query(collection(db, "errors"), where("at", "<", before(RETENTION.errorsDays))))
    .then((s) => Promise.all(s.docs.map((d) => drop("errors", d.id)))).then(() => {}))
  jobs.push(getDocs(query(collection(db, "feedback"), where("at", "<", before(RETENTION.feedbackDays))))
    .then((s) => Promise.all(s.docs.map((d) => drop("feedback", d.id)))).then(() => {}))
  jobs.push(getDocs(collection(db, "outbox")).then((s) => Promise.all(s.docs
    .filter((d) => d.data().status !== "new" && older(d.data().doneAt || d.data().at, RETENTION.outboxDays))
    .map((d) => drop("outbox", d.id)))).then(() => {}))
  jobs.push(getDocs(collection(db, "accountantRequests")).then((s) => Promise.all(s.docs
    .filter((d) => d.data().status !== "new" && older(d.data().emailedAt || d.data().at, RETENTION.requestsDays))
    .map((d) => drop("accountantRequests", d.id)))).then(() => {}))
  await Promise.allSettled(jobs)
  return n
}
