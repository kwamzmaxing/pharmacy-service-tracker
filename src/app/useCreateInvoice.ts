// Create an invoice from logged work: confirm, save, mark the entries as invoiced, open it,
// and put the payment date in Google Calendar when that's connected. Shared by Create invoice and Home.
import { addCalendarEvent, hasToken } from "@/lib/google"
import { draftInvoice, money, plural, type Range } from "@/lib/model"
import { useApp } from "./ctx"

export function useCreateInvoice() {
  const { data, commit, ask, viewInvoice, me, google } = useApp()
  return async function create(clientId: string, range: Range, opts: { strict?: boolean; period?: string } = {}) {
    const client = data.clients.find((c) => c.id === clientId)
    if (!client) return false
    const p = data.profile
    const inv = draftInvoice(data, range, p.fullName || me.name || me.email, client.id, opts)
    if (!inv) return false
    const ok = await ask({
      title: "Create invoice",
      message: `Create ${inv.number} for ${money(inv.total)} to ${client.name}${opts.period ? ` for ${opts.period}` : ""}?\n\n${plural(inv.entryIds.length, "entry", "entries")} will be marked as invoiced. Payment due ${inv.due.split("-").reverse().join("/")}, using your saved details for ${client.name}.`,
      ok: "Create invoice",
    })
    if (!ok) return false
    commit((d) => {
      d.invoices.push(inv)
      d.profile.nextNo = (Number(d.profile.nextNo) || 1) + 1
      d.meta.lastClientId = client.id
      const ids = new Set(inv.entryIds)
      for (const e of d.entries) if (ids.has(e.id)) Object.assign(e, { invoiced: true, invoiceId: inv.id, clientId: client.id })
    }, `Invoice ${inv.number} saved ✓`)
    viewInvoice(inv.id, true)
    if (p.calendar && google.calendar === "ready" && hasToken("calendar")) {
      addCalendarEvent({ title: `Payment due: ${inv.number} · ${money(inv.total)}`, date: inv.due, details: `Expected payment for ${inv.number} from ${client.name}: ${money(inv.total)}.` }, me.email)
        .then(() => commit((d) => void (d.invoices.find((x) => x.id === inv.id)!.calendarAt = new Date().toISOString()), `Added ${inv.due.split("-").reverse().join("/")} to your Google Calendar ✓`))
        .catch(() => {})
    }
    return true
  }
}
