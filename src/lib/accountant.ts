// "Talk to an accountant": people register interest, KASA matches them with an accountant.
// One request per person, stored at accountantRequests/{uid}; only that person and the admin can read it.
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from "firebase/firestore"
import { db } from "./firebase"

export const TOPICS = [
  "My Self Assessment tax return",
  "Expenses: what I can claim",
  "Locum work alongside a PAYE job",
  "Making Tax Digital",
  "Setting up a limited company",
  "VAT",
  "Student loan repayments",
  "Payments on account and budgeting for tax",
  "Pensions and saving tax-efficiently",
  "An HMRC letter or penalty",
] as const
export type RequestStatus = "new" | "contacted" | "matched" | "closed"
export type AccountantRequest = {
  uid: string
  name: string
  email: string
  phone: string
  contactBy: "email" | "phone" | "either"
  topics: string[]
  other: string
  details: string
  when: string
  consent: boolean
  status: RequestStatus
  at: string
  emailedAt?: string
}

const ref = (uid: string) => doc(db, "accountantRequests", uid)
export async function myRequest(uid: string) {
  const s = await getDoc(ref(uid))
  return s.exists() ? (s.data() as AccountantRequest) : null
}
export const sendRequest = (r: Omit<AccountantRequest, "status" | "at" | "emailedAt">) =>
  setDoc(ref(r.uid), { ...r, status: "new", at: new Date().toISOString() })
export const withdrawRequest = (uid: string) => deleteDoc(ref(uid))

export async function listRequests(): Promise<AccountantRequest[]> {
  const snap = await getDocs(query(collection(db, "accountantRequests"), orderBy("at", "desc")))
  return snap.docs.map((d) => d.data() as AccountantRequest)
}
export const setRequestStatus = (uid: string, status: RequestStatus) => updateDoc(ref(uid), { status })
export const markEmailed = (uid: string) => updateDoc(ref(uid), { emailedAt: new Date().toISOString() })

/** The email that goes to the business inbox. */
export function requestEmail(r: AccountantRequest) {
  const lines = [
    `New request to talk to an accountant (KASA.Rx)`,
    ``,
    `Name: ${r.name}`,
    `Email: ${r.email}`,
    `Phone: ${r.phone || "not given"}`,
    `Prefers: ${r.contactBy === "either" ? "email or phone" : r.contactBy}`,
    `Best time: ${r.when || "not given"}`,
    `Sent: ${new Date(r.at).toLocaleString("en-GB")}`,
    ``,
    `Wants to talk about:`,
    ...r.topics.map((t) => `- ${t}`),
    ...(r.other ? [`- Other: ${r.other}`] : []),
    ``,
    `Details:`,
    r.details || "(none)",
    ``,
    `They agreed to KASA sharing these details with an accountant to arrange a consultation.`,
    `Manage this request on the Admin page of KASA.Rx.`,
  ]
  return { subject: `Accountant request: ${r.name}`, body: lines.join("\n") }
}
