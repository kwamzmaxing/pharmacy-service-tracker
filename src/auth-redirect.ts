// Microsoft sign-in windows land here and hand the answer back to the tracker tab.
import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge"

broadcastResponseToMainFrame().catch(() => {
  document.body.textContent = "Something went wrong signing in. Close this window and try again."
})
