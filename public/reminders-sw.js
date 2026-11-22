// Loaded into the app's service worker. Shows KASA.Rx reminders (overdue invoices, upcoming shifts)
// that the page has worked out and saved, each one once, when it's due.
const KASA_STORE = "kasa-reminders"
const kasaKey = () => new URL("__kasa/reminders.json", self.registration.scope).href

async function kasaDeliver() {
  const cache = await caches.open(KASA_STORE)
  const res = await cache.match(kasaKey())
  if (!res) return
  const s = await res.json()
  if (!s.enabled) return
  const now = Date.now()
  let changed = false
  for (const r of s.list || []) {
    if (r.at <= now && r.at > now - 3 * 86400000 && !(s.shown || []).includes(r.id)) {
      await self.registration.showNotification(r.title, { body: r.body, tag: r.id, icon: "pwa-192.png", badge: "pwa-192.png", data: { tab: r.tab } })
      s.shown = [...(s.shown || []), r.id].slice(-300)
      changed = true
    }
  }
  if (changed) await cache.put(kasaKey(), new Response(JSON.stringify(s), { headers: { "Content-Type": "application/json" } }))
}

self.addEventListener("periodicsync", (e) => { if (e.tag === "kasa-reminders") e.waitUntil(kasaDeliver()) })
self.addEventListener("message", (e) => { if (e.data === "kasa-deliver") e.waitUntil(kasaDeliver()) })
self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  const tab = (e.notification.data && e.notification.data.tab) || ""
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const c of all) { c.postMessage({ kasaGo: tab }); return c.focus() }
    return clients.openWindow(new URL("#" + tab, self.registration.scope).href)
  })())
})
