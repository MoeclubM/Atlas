import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useAppStore } from '@/state/app-store'
import { getLatencyHex } from '@/lib/latency'

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

function FitBounds({ markers }: { markers: ProbeMarker[] }) {
  const map = useMap()

  useEffect(() => {
    if (!markers.length) return
    const bounds = L.latLngBounds(markers.map(marker => [marker.latitude, marker.longitude]))
    if (!bounds.isValid()) return
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 })
  }, [map, markers])

  return null
}

export function WorldMap({ probes, height = 420 }: { probes: ProbeMarker[]; height?: number }) {
  const theme = useAppStore(state => state.theme)
  const tileUrl =
    theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const markers = useMemo(() => probes, [probes])

  if (!markers.length) return null

  return (
    <div className="overflow-hidden rounded-sm border border-[var(--border)]">
      <MapContainer
        center={[25, 5]}
        zoom={2}
        scrollWheelZoom={false}
        style={{ height: `${height}px`, width: '100%' }}
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors" url={tileUrl} />
        <FitBounds markers={markers} />
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
