'use client'

import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { pinIcon } from '@/lib/leaflet-icons'

const ZOOM = 15

type MandalMiniMapProps = {
  lat: number
  lng: number
}

export default function MandalMiniMap({ lat, lng }: MandalMiniMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={ZOOM}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={[lat, lng]} icon={pinIcon} />
    </MapContainer>
  )
}
