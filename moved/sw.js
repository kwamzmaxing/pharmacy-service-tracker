// Replaces the old app's service worker on the GitHub address: clears its offline copy, removes itself,
// and reloads open pages so they reach the "moved to kasarx.co.uk" redirect.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k)
    await self.registration.unregister()
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url)
  })())
})
