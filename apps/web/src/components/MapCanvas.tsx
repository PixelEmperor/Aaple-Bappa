'use client'

import type L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import useSupercluster from 'use-supercluster'
import { clusterIcon, pinIcon } from '@/lib/leaflet-icons'
import type { Mandal } from '@/shared/schemas'

const MUMBAI_CENTER: [number, number] = [19.03, 72.92]
const DEFAULT_ZOOM = 11
const CLUSTER_MAX_ZOOM = 18

function boundsToBbox(map: L.Map): [number, number, number, number] {
  const bounds = map.getBounds()
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
}

type MandalPointProperties = {
  cluster: false
  mandalId: string
  slug: string
  name: string
}

function ClusterLayer({ mandals }: { mandals: Mandal[] }) {
  const map = useMap()
  const [bounds, setBounds] = useState<[number, number, number, number]>(() => boundsToBbox(map))
  const [zoom, setZoom] = useState(map.getZoom())

  useMapEvents({
    moveend: () => {
      setBounds(boundsToBbox(map))
      setZoom(map.getZoom())
    },
  })

  const points = useMemo(() => {
    // Invalid coordinates are rejected before insert (supabase/migrations —
    // design-plan.md Milestone 1), so a bad lat/lng here would mean that
    // guarantee broke, not a normal runtime case to filter around quietly.
    for (const mandal of mandals) {
      console.assert(
        Number.isFinite(mandal.lat) && Number.isFinite(mandal.lng),
        'Mandal with non-finite coordinates reached the map: %s (%s, %s)',
        mandal.slug,
        mandal.lat,
        mandal.lng
      )
    }

    return mandals.map((mandal) => ({
      type: 'Feature' as const,
      properties: {
        cluster: false as const,
        mandalId: mandal.id,
        slug: mandal.slug,
        name: mandal.name,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [mandal.lng, mandal.lat] as [number, number],
      },
    }))
  }, [mandals])

  const { clusters, supercluster } = useSupercluster<MandalPointProperties>({
    points,
    bounds,
    zoom,
    options: { radius: 75, maxZoom: CLUSTER_MAX_ZOOM },
  })

  return (
    <>
      {clusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates

        if ('point_count' in feature.properties) {
          const clusterId = feature.properties.cluster_id
          const pointCount = feature.properties.point_count
          return (
            <Marker
              key={`cluster-${clusterId}`}
              position={[lat, lng]}
              icon={clusterIcon(pointCount)}
              eventHandlers={{
                click: () => {
                  const expansionZoom = Math.min(
                    supercluster?.getClusterExpansionZoom(clusterId) ?? CLUSTER_MAX_ZOOM,
                    CLUSTER_MAX_ZOOM
                  )
                  map.setView([lat, lng], expansionZoom, { animate: true })
                },
              }}
            />
          )
        }

        return (
          <Marker key={feature.properties.mandalId} position={[lat, lng]} icon={pinIcon}>
            <Popup>
              <b>{feature.properties.name}</b>
              <br />
              <Link href={`/mandal/${feature.properties.slug}`}>View details →</Link>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

export default function MapCanvas({ mandals }: { mandals: Mandal[] }) {
  return (
    <MapContainer
      center={MUMBAI_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <ClusterLayer mandals={mandals} />
    </MapContainer>
  )
}
