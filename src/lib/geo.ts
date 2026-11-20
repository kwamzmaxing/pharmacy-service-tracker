// Finding places and driving distances, using free open services:
//   postcodes.io (UK postcodes) · OpenStreetMap Nominatim (place names) · OSRM (driving routes)
import type { Place } from "./model"

const POSTCODE = /^\s*([A-Za-z]{1,2}\d[A-Za-z\d]?)\s*(\d[A-Za-z]{2})\s*$/
export const isPostcode = (q: string) => POSTCODE.test(q)
export const tidyPostcode = (q: string) => q.toUpperCase().replace(POSTCODE, "$1 $2").trim()

export class GeoError extends Error {}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new GeoError(String(res.status))
  return res.json()
}

/** Turn a postcode or place name into a point on the map. */
export async function findPlace(query: string, label?: string): Promise<Place> {
  const q = query.trim()
  if (!q) throw new GeoError("Enter a postcode or place.")
  if (isPostcode(q)) {
    const pc = tidyPostcode(q)
    try {
      const j = await getJson(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)
      return { label: label || pc, query: pc, postcode: pc, lat: j.result.latitude, lng: j.result.longitude }
    } catch {
      throw new GeoError(`Couldn’t find the postcode ${pc}. Check it and try again.`)
    }
  }
  try {
    const j = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`)
    if (!j.length) throw new Error("none")
    const name = String(j[0].display_name || q).split(",").slice(0, 2).join(",").trim()
    return { label: label || name, query: q, lat: Number(j[0].lat), lng: Number(j[0].lon) }
  } catch {
    throw new GeoError(`Couldn’t find “${q}”. Try a postcode instead.`)
  }
}

const toRad = (d: number) => (d * Math.PI) / 180
/** Straight-line distance in miles. */
export function crowMiles(a: Place, b: Place) {
  const R = 3958.8
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Keep every nth point so a long route stays small enough to save. */
function thin(path: [number, number][], max = 160) {
  if (path.length <= max) return path
  const step = (path.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => path[Math.round(i * step)])
}

export type Route = { miles: number; minutes?: number; path: [number, number][]; approximate: boolean }
/** Driving distance and route. Falls back to an estimate if the routing service can't be reached. */
export async function drivingRoute(a: Place, b: Place): Promise<Route> {
  try {
    const j = await getJson(
      `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`,
    )
    const r = j.routes?.[0]
    if (!r) throw new Error("no route")
    const path = (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5] as [number, number])
    return { miles: Math.round((r.distance / 1609.344) * 10) / 10, minutes: Math.round(r.duration / 60), path: thin(path), approximate: false }
  } catch {
    // Roads are rarely straight: a 1.25× straight-line distance is a common rough estimate
    return { miles: Math.round(crowMiles(a, b) * 1.25 * 10) / 10, path: [[a.lat, a.lng], [b.lat, b.lng]], approximate: true }
  }
}
