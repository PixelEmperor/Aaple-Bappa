import L from 'leaflet'

/**
 * Divicons with inline styles rather than L.Icon + image assets: Leaflet's
 * default marker images don't resolve reliably through bundlers without
 * extra config, and a plain colored dot/badge is all this needs.
 *
 * This module touches `leaflet`, which touches `window` at import time —
 * only ever import it from code already isolated behind a client-only
 * dynamic(() => ..., { ssr: false }) boundary (MapCanvas, MandalMiniMap).
 */

export const pinIcon = L.divIcon({
  className: '',
  html: '<div style="background:#ea580c;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [16, 16],
})

export function clusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 32 : count < 50 ? 40 : 48
  return L.divIcon({
    className: '',
    html: `<div style="background:#ea580c;color:white;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${count}</div>`,
    iconSize: [size, size],
  })
}
