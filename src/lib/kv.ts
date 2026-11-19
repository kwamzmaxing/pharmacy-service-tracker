// A tiny document store interface with two implementations: the claude.ai
// artifact database (shared across devices) and this browser's localStorage.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Json = Record<string, unknown>
export type KV = {
  kind: "cloud" | "local"
  get(path: string): Promise<Json | null>
  set(path: string, data: Json): Promise<void>
  del(path: string): Promise<void>
  /** Documents directly inside a collection path. */
  list(collection: string): Promise<{ id: string; data: Json }[]>
  /** Merge nested fields into a document, creating it if needed. */
  merge(path: string, data: Json): Promise<void>
}
function deepMerge(a: Json, b: Json): Json {
  const out: Json = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k]
    out[k] = v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur) ? deepMerge(cur as Json, v as Json) : v
  }
  return out
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r({ code: "timeout" }), ms))])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Retry a write once on a transient failure; rethrow everything else. */
async function retrying<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e: any) {
    if (e?.code !== "unavailable") throw e
    await sleep(600 + Math.random() * 900)
    return fn()
  }
}

export function cloudKV(db: any): KV {
  const clone = (v: unknown) => JSON.parse(JSON.stringify(v))
  return {
    kind: "cloud",
    async get(path) {
      const s = await withTimeout<any>(db.doc(path).get(), 12000)
      return s.exists ? clone(s.data()) : null
    },
    set: (path, data) => retrying(() => db.doc(path).set(data)),
    del: (path) => retrying(() => db.doc(path).delete()),
    async list(collection) {
      const snap = await withTimeout<any>(db.collection(collection).get(), 12000)
      return snap.docs.filter((d: any) => d.exists).map((d: any) => ({ id: d.id, data: clone(d.data()) }))
    },
    async merge(path, data) {
      const ref = db.doc(path)
      try {
        await retrying(() => ref.update(data))
      } catch (e: any) {
        if (e?.code !== "invalid_argument") throw e
        // update needs an existing document: create it, or fail on a real permission problem
        const s = await ref.get()
        if (s.exists) throw e
        await retrying(() => ref.set(data))
      }
    },
  }
}

export function localKV(): KV {
  const P = "pst3:"
  const mem = new Map<string, string>()
  const read = (k: string) => {
    try {
      return localStorage.getItem(P + k) ?? mem.get(k) ?? null
    } catch {
      return mem.get(k) ?? null
    }
  }
  const keys = () => {
    const out = new Set(mem.keys())
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(P)) out.add(k.slice(P.length))
      }
    } catch {
      /* storage blocked */
    }
    return [...out]
  }
  return {
    kind: "local",
    async get(path) {
      const v = read(path)
      return v ? JSON.parse(v) : null
    },
    async set(path, data) {
      const s = JSON.stringify(data)
      mem.set(path, s)
      try {
        localStorage.setItem(P + path, s)
      } catch {
        /* keep in memory */
      }
    },
    async del(path) {
      mem.delete(path)
      try {
        localStorage.removeItem(P + path)
      } catch {
        /* ignore */
      }
    },
    async list(collection) {
      const pre = collection + "/"
      return keys()
        .filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes("/"))
        .map((k) => ({ id: k.slice(pre.length), data: JSON.parse(read(k) || "{}") }))
    },
    async merge(path, data) {
      const cur = read(path)
      const next = deepMerge(cur ? JSON.parse(cur) : {}, data)
      await this.set(path, next)
    },
  }
}
