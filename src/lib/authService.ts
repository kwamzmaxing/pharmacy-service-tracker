// Every log-in and account action in one place, so a native app can swap in its own sign-in
// (for example a native Google or Apple sign-in) by changing only this file.
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider,
  GoogleAuthProvider, linkWithPopup, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, sendEmailVerification,
  sendPasswordResetEmail, setPersistence, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut, updatePassword, updateProfile,
  type User,
} from "firebase/auth"
import { auth } from "./firebase"
import { emulator } from "@/config"

// Local testing only: the Firebase emulator can't open Google's window here, so tests sign in with a fake
// Google credential. This code only exists in emulator builds (VITE_USE_EMULATOR=1), never on the real site.
if (emulator && typeof window !== "undefined") {
  ;(window as unknown as { __kasaTestGoogle?: (json: string) => Promise<unknown> }).__kasaTestGoogle = (json: string) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(json))
}

export type Provider = "google" | "microsoft"
const providerFor = (p: Provider) => {
  if (p === "google") return new GoogleAuthProvider()
  const m = new OAuthProvider("microsoft.com")
  m.setCustomParameters({ prompt: "select_account" })
  return m
}
const remember = (keep: boolean) => setPersistence(auth, keep ? browserLocalPersistence : browserSessionPersistence)

export async function logInWith(p: Provider, keep: boolean) {
  await remember(keep)
  return signInWithPopup(auth, providerFor(p))
}
export async function logInWithEmail(email: string, password: string, keep: boolean) {
  await remember(keep)
  return signInWithEmailAndPassword(auth, email, password)
}
export async function createAccount(name: string, email: string, password: string, keep: boolean) {
  await remember(keep)
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  updateProfile(cred.user, { displayName: name }).catch(() => {})
  sendEmailVerification(cred.user).catch(() => {})
  return cred
}
export const sendPasswordReset = (email: string) => sendPasswordResetEmail(auth, email)
export const resendVerification = () => (auth.currentUser ? sendEmailVerification(auth.currentUser) : Promise.resolve())
export const logOut = () => signOut(auth)

const via = (u: User, id: string) => u.providerData.some((x) => x.providerId === id)
/** How this person logs in, to know how to confirm it's them. */
export function loginKind(): "google" | "microsoft" | "password" | null {
  const u = auth.currentUser
  if (!u) return null
  return via(u, "google.com") ? "google" : via(u, "microsoft.com") ? "microsoft" : "password"
}
/** Confirm it's really them before something sensitive (Google/Microsoft window, or their password). */
export async function confirmIdentity(password?: string) {
  const u = auth.currentUser
  if (!u) throw new Error("Not logged in")
  const k = loginKind()
  if (k === "google" || k === "microsoft") await reauthenticateWithPopup(u, providerFor(k))
  else await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email || "", password || ""))
}
/**
 * Switch this session to Google without logging out: links Google to the account the first time, or asks
 * Google to confirm it's them (which can use a Google passkey). Admin access needs a Google session.
 */
export async function switchToGoogle() {
  const u = auth.currentUser
  if (!u) throw new Error("Not logged in")
  if (u.providerData.some((x) => x.providerId === "google.com")) await reauthenticateWithPopup(u, new GoogleAuthProvider())
  else await linkWithPopup(u, new GoogleAuthProvider())
  return (await u.getIdTokenResult(true)).signInProvider
}
export async function changePassword(current: string, next: string) {
  const u = auth.currentUser
  if (!u?.email) throw new Error("Not logged in")
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current))
  await updatePassword(u, next)
}
export async function deleteLogin() {
  if (auth.currentUser) await deleteUser(auth.currentUser)
}
