import { initializeApp } from "firebase/app"
import { connectAuthEmulator, getAuth } from "firebase/auth"
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"
import { emulator, firebaseConfig } from "@/config"

const app = initializeApp(
  emulator ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-tracker", appId: "demo" } : firebaseConfig,
)
export const auth = getAuth(app)
// Keeps a copy on the device, so the tracker opens fast and works through short connection drops.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })

if (emulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })
  connectFirestoreEmulator(db, "127.0.0.1", 8080)
}
