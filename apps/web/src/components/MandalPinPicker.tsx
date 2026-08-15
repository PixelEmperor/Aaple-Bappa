'use client'

import 'leaflet/dist/leaflet.css'
import type { LeafletMouseEvent } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { pinIcon } from '@/lib/leaflet-icons'

const MUMBAI_CENTER: [number, number] = [19.03, 72.92]
const DEFAULT_ZOOM = 11
const PICKED_ZOOM = 16

export type PinLocation = { lat: number; lng: number }

function ClickHandler({ onChange }: { onChange: (value: PinLocation) => void }) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

type MandalPinPickerProps = {
  value: PinLocation | null
  onChange: (value: PinLocation) => void
}

export default function MandalPinPicker({ value, onChange }: MandalPinPickerProps) {
  return (
    <MapContainer
      center={value ? [value.lat, value.lng] : MUMBAI_CENTER}
      zoom={value ? PICKED_ZOOM : DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <ClickHandler onChange={onChange} />
      {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
    </MapContainer>
  )
}
