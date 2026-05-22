'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'
import type { PlanningApplicationSummary } from '@/lib/types'

const CONFIGS = [
  { status: 'approved',  color: [34,  197, 94]  },
  { status: 'refused',   color: [239, 68,  68]  },
  { status: 'pending',   color: [245, 158, 11]  },
  { status: 'withdrawn', color: [107, 114, 128] },
] as const

type Rgba = `rgba(${number},${number},${number},${number})`
function rgba(rgb: readonly [number, number, number], a: number): Rgba {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`
}

function toGeoJSON(apps: PlanningApplicationSummary[], status: string) {
  return {
    type: 'FeatureCollection' as const,
    features: apps
      .filter(a => a.status === status)
      .map(a => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.longitude, a.latitude] },
        properties: {},
      })),
  }
}

interface Props {
  applications: PlanningApplicationSummary[]
  enabled: boolean
}

export default function HeatmapLayer({ applications, enabled }: Props) {
  const { current: mapRef } = useMap()
  const map = mapRef?.getMap() as maplibregl.Map | undefined
  const ready = useRef(false)
  const enabledRef = useRef(enabled)
  const appsRef = useRef(applications)

  enabledRef.current = enabled
  appsRef.current = applications

  useEffect(() => {
    if (!map) return

    const setup = () => {
      for (const { status, color } of CONFIGS) {
        const sid = `hm-src-${status}`
        const lid = `hm-${status}`

        if (!map.getSource(sid)) {
          map.addSource(sid, { type: 'geojson', data: toGeoJSON([], status) })
        }
        if (!map.getLayer(lid)) {
          map.addLayer({
            id: lid,
            type: 'heatmap',
            source: sid,
            paint: {
              'heatmap-weight': 1,
              'heatmap-radius': 24,
              'heatmap-opacity': 0.7,
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0,   rgba(color, 0),
                0.4, rgba(color, 0.5),
                1,   rgba(color, 0.95),
              ],
            },
          })
        }

        map.setLayoutProperty(lid, 'visibility', enabledRef.current ? 'visible' : 'none')
      }

      for (const { status } of CONFIGS) {
        const src = map.getSource(`hm-src-${status}`) as maplibregl.GeoJSONSource | undefined
        src?.setData(toGeoJSON(appsRef.current, status) as unknown as Parameters<typeof src.setData>[0])
      }

      ready.current = true
    }

    if (map.isStyleLoaded()) setup()
    else map.once('load', setup)

    return () => {
      for (const { status } of CONFIGS) {
        if (map.getLayer(`hm-${status}`)) map.removeLayer(`hm-${status}`)
        if (map.getSource(`hm-src-${status}`)) map.removeSource(`hm-src-${status}`)
      }
      ready.current = false
    }
  }, [map])

  useEffect(() => {
    if (!map || !ready.current) return
    for (const { status } of CONFIGS) {
      const src = map.getSource(`hm-src-${status}`) as maplibregl.GeoJSONSource | undefined
      src?.setData(toGeoJSON(applications, status) as unknown as Parameters<typeof src.setData>[0])
    }
  }, [map, applications])

  useEffect(() => {
    if (!map || !ready.current) return
    for (const { status } of CONFIGS) {
      if (map.getLayer(`hm-${status}`)) {
        map.setLayoutProperty(`hm-${status}`, 'visibility', enabled ? 'visible' : 'none')
      }
    }
  }, [map, enabled])

  return null
}
