// The viewer's own claude.ai connectors, called from the page.
// Gmail and Google Drive argument names below match those connectors' published
// schemas. Google Calendar's are read from the connector at run time.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const GMAIL = "Gmail"
export const DRIVE = "Google Drive"
export const CALENDAR = "Google Calendar"

export type ConnStatus =
  | "unavailable" // this view can't use connectors (outside claude.ai)
  | "not_connected" // not added in claude.ai Settings → Connectors
  | "needs_reauth"
  | "denied" // turned off for this page
  | "ready" // allowed, or will ask on first use
export type GmailStatus = ConnStatus

export async function connectorStatus(mcp: any, permissions: any, server: string): Promise<ConnStatus> {
  if (!mcp) return "unavailable"
  const perm: string = permissions ? await permissions.state("mcp:" + server).catch(() => "unavailable") : "prompt"
  if (perm === "denied") return "denied"
  try {
    const { servers } = await mcp.listTools(server)
    const s = servers?.find((x: any) => x.server === server)
    if (!s) return "not_connected"
    if (s.authStatus === "needs_reauth") return "needs_reauth"
    if (s.authStatus === "connected" && !s.tools?.length) return "not_connected"
    return "ready"
  } catch (e: any) {
    if (e?.code === "needs_reauth") return "needs_reauth"
    if (e?.code === "server_not_connected" || e?.code === "selection_required") return "not_connected"
    return "unavailable"
  }
}
export const gmailStatus = (mcp: any, permissions: any) => connectorStatus(mcp, permissions, GMAIL)

/** Ask the viewer to let this page use a connector (one dialog). */
export async function allowConnector(permissions: any, server: string): Promise<boolean> {
  if (!permissions) return true
  const r = await permissions.request(["mcp:" + server]).catch(() => ({}))
  const st = r?.["mcp:" + server]
  return st === "granted" || st === "prompt"
}
export const allowGmail = (permissions: any) => allowConnector(permissions, GMAIL)

export type GmailErrorKind = "not_connected" | "needs_reauth" | "not_allowed" | "no_schema" | "uncertain" | "failed"
export class GmailError extends Error {
  kind: GmailErrorKind
  constructor(kind: GmailErrorKind, message?: string) {
    super(message || kind)
    this.kind = kind
  }
}
function toError(e: any): GmailError {
  const code = e?.code
  if (code === "server_not_connected" || code === "selection_required") return new GmailError("not_connected")
  if (code === "needs_reauth") return new GmailError("needs_reauth")
  if (code === "not_in_manifest" || code === "approval_required" || code === "blocked_by_policy") return new GmailError("not_allowed")
  if (code === "tool_error") return new GmailError("failed", e?.message)
  return new GmailError("uncertain") // timeouts and upstream errors: the outcome is unknown
}
async function call(mcp: any, server: string, tool: string, input: unknown) {
  if (!mcp) throw new GmailError("not_connected")
  try {
    return (await mcp.callTool(server, tool, input))?.payload as any
  } catch (e) {
    throw toError(e)
  }
}

export type Attachment = { filename: string; mimeType: string; content: string /* base64 */ }
export type Mail = { to: string; subject: string; body: string; attachments?: Attachment[] }
const gmailInput = (m: Mail) => ({
  to: m.to.split(/[,;\s]+/).filter(Boolean),
  subject: m.subject,
  body: m.body,
  ...(m.attachments?.length ? { attachments: m.attachments } : {}),
})
/** Send now from the viewer's Gmail. */
export const sendMail = (mcp: any, m: Mail) => call(mcp, GMAIL, "send_message", gmailInput(m))
/** Save to the viewer's Gmail drafts. */
export const createDraft = (mcp: any, m: Mail) => call(mcp, GMAIL, "create_draft", gmailInput(m))

/* ---------- Google Drive (the admin's master sheet) ---------- */
export async function uploadSheet(mcp: any, title: string, xlsx: ArrayBuffer) {
  const bytes = new Uint8Array(xlsx)
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const p = await call(mcp, DRIVE, "create_file", {
    title,
    base64Content: btoa(s),
    contentMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const id: string | undefined = p?.id || p?.fileId || p?.file?.id
  const url: string | undefined = p?.webViewLink || p?.alternateLink || p?.viewUrl || (id ? `https://docs.google.com/spreadsheets/d/${id}` : undefined)
  return { id, url }
}
export const trashFile = (mcp: any, fileId: string) => call(mcp, DRIVE, "trash_file", { fileId })

/* ---------- Google Calendar ---------- */
/** A link that opens Google Calendar with the event filled in — works without any connector. */
export function calendarLink(title: string, date: string, details: string) {
  const d = date.replace(/-/g, "")
  const next = new Date(date + "T00:00:00")
  next.setDate(next.getDate() + 1)
  const n = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${d}/${n}`, details })
  return "https://calendar.google.com/calendar/render?" + q.toString()
}

type Schema = { properties?: Record<string, any>; required?: string[] }
/** Build create_event input from the connector's own schema; throws no_schema when it doesn't fit. */
export function mapEventInput(schema: Schema | undefined, ev: { title: string; date: string; details: string }) {
  const props = schema?.properties || {}
  const keys = Object.keys(props)
  const find = (re: RegExp) => keys.find((k) => re.test(k))
  const titleKey = find(/^(summary|title|name)$/i)
  const descKey = find(/^(description|details|notes?)$/i)
  const input: Record<string, unknown> = {}
  if (!titleKey) throw new GmailError("no_schema")
  input[titleKey] = ev.title
  if (descKey) input[descKey] = ev.details
  const next = new Date(ev.date + "T00:00:00")
  next.setDate(next.getDate() + 1)
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
  const startKey = find(/^start$/i), endKey = find(/^end$/i)
  const startTime = find(/^(start_?time|start_?date_?time|startDateTime)$/i), endTime = find(/^(end_?time|end_?date_?time|endDateTime)$/i)
  if (startKey && endKey) {
    const inner = props[startKey]?.properties || {}
    if ("date" in inner) { input[startKey] = { date: ev.date }; input[endKey] = { date: end } }
    else if ("dateTime" in inner) { input[startKey] = { dateTime: `${ev.date}T09:00:00` }; input[endKey] = { dateTime: `${ev.date}T09:30:00` } }
    else if (props[startKey]?.type === "string") { input[startKey] = `${ev.date}T09:00:00`; input[endKey] = `${ev.date}T09:30:00` }
    else throw new GmailError("no_schema")
  } else if (startTime && endTime) {
    input[startTime] = `${ev.date}T09:00:00`
    input[endTime] = `${ev.date}T09:30:00`
  } else throw new GmailError("no_schema")
  const missing = (schema?.required || []).filter((k) => !(k in input))
  if (missing.length) throw new GmailError("no_schema")
  return input
}
export async function addCalendarEvent(mcp: any, ev: { title: string; date: string; details: string }) {
  if (!mcp) throw new GmailError("not_connected")
  let schema: Schema | undefined
  try {
    schema = (await mcp.describeTool(CALENDAR, "create_event")).inputSchema as Schema
  } catch (e) {
    throw toError(e).kind === "uncertain" ? new GmailError("no_schema") : toError(e)
  }
  return call(mcp, CALENDAR, "create_event", mapEventInput(schema, ev))
}

export const GMAIL_HELP: Record<GmailErrorKind | ConnStatus, string> = {
  unavailable: "Connected apps can only be used when this page is open on claude.ai.",
  not_connected: "Add it in claude.ai Settings → Connectors, then come back to this page.",
  needs_reauth: "Reconnect it in claude.ai Settings → Connectors.",
  denied: "It’s turned off for this page. Turn it on from the page’s Permissions menu.",
  not_allowed: "This page isn’t allowed to use it. Allow it when claude.ai asks, or from the page’s Permissions menu.",
  no_schema: "The connected app didn’t accept the details this page sends.",
  uncertain: "The app didn’t confirm. Check it before trying again, so nothing is sent twice.",
  failed: "The app reported an error.",
  ready: "",
}
