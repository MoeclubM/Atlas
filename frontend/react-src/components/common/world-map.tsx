import { useEffect, useMemo, useRef } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useAppStore } from '@/state/app-store'
import { getLatencyHex } from '@/lib/latency'
import type { WorldMapRoute } from '@/lib/route-map'

export type ProbeMarker = {
  probe_id: string
  name: string
  location: string
  latitude: number
  longitude: number
  latency?: number
  status?: 'success' | 'failed' | 'timeout' | 'pending'
  packetLoss?: number
}

function FitBounds({
  markers,
  routes,
}: {
  markers: ProbeMarker[]
  routes: WorldMapRoute[]
}) {
  const map = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (hasFitted.current) return
    const coordinates = [
      ...markers.map(marker => [marker.latitude, marker.longitude] as [number, number]),
      ...routes.flatMap(route =>
        route.points.map(point => [point.latitude, point.longitude] as [number, number])
      ),
    ]
    if (!coordinates.length) return
    const bounds = L.latLngBounds(coordinates)
    if (!bounds.isValid()) return
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 })
    hasFitted.current = true
  }, [map, markers, routes])

  return null
}

export function WorldMap({
  probes = [],
  routes = [],
  height = 420,
}: {
  probes?: ProbeMarker[]
  routes?: WorldMapRoute[]
  height?: number
}) {
  const theme = useAppStore(state => state.theme)
  const tileUrl =
    theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const markers = useMemo(() => probes, [probes])
  const routePaths = useMemo(() => routes, [routes])
  const routeStroke = theme === 'dark' ? '#c48a58' : '#8a5a3c'
  const routeHopFill = theme === 'dark' ? '#f4ece3' : '#fffaf2'

  if (!markers.length && routePaths.length === 0) return null

  return (
    <div className="overflow-hidden rounded-sm border border-[var(--border)]">
      <MapContainer
        center={[25, 5]}
        zoom={2}
        scrollWheelZoom
        style={{ height: `${height}px`, width: '100%' }}
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors" url={tileUrl} />
        <FitBounds markers={markers} routes={routePaths} />
        {routePaths.map(route =>
          route.points.length >= 2 ? (
            <Polyline
              key={route.id}
              positions={route.points.map(point => [point.latitude, point.longitude])}
              pathOptions={{ color: routeStroke, weight: 3, opacity: 0.85 }}
            />
          ) : null
        )}
        {routePaths.flatMap(route =>
          route.points.map(point => (
            <CircleMarker
              key={point.id}
              center={[point.latitude, point.longitude]}
              radius={point.kind === 'probe' ? 8 : 6}
              pathOptions={{
                color: routeStroke,
                weight: 2,
                fillColor: point.kind === 'probe' ? routeStroke : routeHopFill,
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{point.label}</div>
                  {point.subtitle ? <div>{point.subtitle}</div> : null}
                </div>
              </Popup>
            </CircleMarker>
          ))
        )}
        {markers.map(probe => (
          <CircleMarker
            key={probe.probe_id}
            center={[probe.latitude, probe.longitude]}
            radius={10}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: getLatencyHex(probe.latency, probe.status),
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{probe.location}</div>
                <div>{probe.name}</div>
                {probe.latency !== undefined ? <div>{probe.latency.toFixed(1)} ms</div> : null}
                {probe.packetLoss !== undefined ? <div>{probe.packetLoss.toFixed(1)}%</div> : null}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
