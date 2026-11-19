// Fill these in from your Firebase project (Project settings → Your apps → Web app)
// and Google Cloud (APIs & Services → Credentials → OAuth client ID, type "Web application").
// These values are public by design: they identify the project, they are not secrets.
// Access is controlled by the security rules in firestore.rules.

export const firebaseConfig = {
  apiKey: "AIzaSyB_QYvUECZZ39uk6jp3VyaB0BZBQmgK7tA",
  authDomain: "service-tracker-invoice.firebaseapp.com",
  projectId: "service-tracker-invoice",
  storageBucket: "service-tracker-invoice.firebasestorage.app",
  messagingSenderId: "1006803367671",
  appId: "1:1006803367671:web:9427b1642630a1b08045f2",
}

/** OAuth client ID used to connect each person's Gmail and Google Calendar. */
export const googleClientId = ""

/** Where the site is published; used in emails. */
export const siteUrl = "https://kwamzmaxing.github.io/pharmacy-service-tracker/"

const useEmulator = import.meta.env.VITE_USE_EMULATOR === "1"
export const isConfigured = useEmulator || !!(firebaseConfig.apiKey && firebaseConfig.projectId)
export const emulator = useEmulator
