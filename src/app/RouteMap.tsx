import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

/** A small map showing one journey: the route line with a dot at each end. Tiles darken to match dark mode. */
export default function RouteMap({ path, from, to }: { path: [number, number][]; from: string; to: string }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
    // OpenStreetMap's own tiles: free, no key. In dark mode CSS turns them dark (see .route-tiles in index.css).
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "route-tiles",
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes by OSRM',
    }).addTo(m)
    L.control.zoom({ position: "bottomright" }).addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || path.length < 2) return
    const layer = L.layerGroup().addTo(m)
    const css = getComputedStyle(document.documentElement)
    const line = `hsl(${css.getPropertyValue("--primary").trim()})`
    L.polyline(path, { color: line, weight: 4, opacity: 0.9, lineCap: "round" }).addTo(layer)
    const dot = (at: [number, number], label: string, filled: boolean) =>
      L.circleMarker(at, { radius: 7, color: "#fff", weight: 2, fillColor: line, fillOpacity: filled ? 1 : 0.45 }).bindTooltip(label, { direction: "top" }).addTo(layer)
    dot(path[0], from, false)
    dot(path[path.length - 1], to, true)
    m.fitBounds(L.latLngBounds(path), { padding: [28, 28] })
    return () => { layer.remove() }
  }, [path, from, to])

  return <div ref={el} className="h-[220px] w-full overflow-hidden rounded-lg border sm:h-[260px]" role="img" aria-label={`Map of the route from ${from} to ${to}`} />
}
