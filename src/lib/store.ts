// Connects to whatever the page is running in: the claude.ai viewer (shared
// database, downloads, connectors) or a plain browser (localStorage only).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { assembleDocs, normalize, type Data, type DocMap } from "./model"
import { cloudKV, localKV, type KV } from "./kv"

declare global {
  interface Window {
    claude?: { use(name: string): Promise<any> }
  }
}

export type Connection = {
  kv: KV
  /** The viewer's claude.ai id (null outside claude.ai or with no identity). */
  uid: string | null
  /** The viewer owns this page (the admin). */
  isOwner: boolean
  downloads: { save(r: { filename: string; data: string | Blob }): Promise<unknown> } | null
  mcp: any | null
  permissions: any | null
  /** Data saved by the earlier version of the tracker (before tracker accounts), if any. */
  legacy(): Promise<Data | null>
  clearLegacy(): Promise<void>
}

export async function connect(): Promise<Connection> {
  const c = window.claude
  if (c && typeof c.use === "function") {
    const [user, db, downloads, mcp, permissions] = await Promise.all(
      ["user", "db", "downloads", "mcp", "permissions"].map((n) => c.use(n).catch(() => null)),
    )
    const uid: string | null = user ? await user.id().catch(() => null) : null
    const kv = db ? cloudKV(db) : localKV()
    const oldCol = db && uid ? "data/users/" + uid : null
    const isOwner: boolean = user ? await user.isOwner().catch(() => false) : false
    return {
      kv, downloads, mcp, permissions, uid: db ? uid : null, isOwner,
      async legacy() {
        if (!oldCol || !db) return null
        try {
          const rows = await cloudKV(db).list(oldCol)
          const docs: DocMap = Object.fromEntries(rows.map((r) => [r.id, r.data]))
          return assembleDocs(docs)
        } catch {
          return null
        }
      },
      async clearLegacy() {
        if (!oldCol || !db) return
        const k = cloudKV(db)
        for (const r of await k.list(oldCol).catch(() => [])) await k.del(`${oldCol}/${r.id}`).catch(() => {})
      },
    }
  }
  return {
    kv: localKV(), downloads: null, mcp: null, permissions: null, uid: "local", isOwner: true,
    async legacy() {
      try {
        const raw = localStorage.getItem("pst_local_v3")
        return raw ? normalize(JSON.parse(raw)) : null
      } catch {
        return null
      }
    },
    async clearLegacy() {
      try {
        localStorage.removeItem("pst_local_v3")
      } catch {
        /* ignore */
      }
    },
  }
}

/** Offer a file to the viewer. Uses the page's download permission on claude.ai, a normal download elsewhere. */
export async function saveFile(conn: Connection | null, filename: string, data: string | Blob): Promise<"saved" | "declined" | "failed"> {
  if (conn?.downloads) {
    try {
      await conn.downloads.save({ filename, data })
      return "saved"
    } catch (e: any) {
      return e?.code === "declined" ? "declined" : "failed"
    }
  }
  if (window.claude) return "failed"
  const blob = data instanceof Blob ? data : new Blob([data])
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return "saved"
}
