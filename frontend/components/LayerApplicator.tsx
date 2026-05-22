'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'
import { LAYER_GROUPS, type LayerEnabled } from '@/lib/layers'

const POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20'] as const
const TRANSIT_GROUPS = LAYER_GROUPS.filter(g => g.section === 'transit')
const POI_GROUPS     = LAYER_GROUPS.filter(g => g.section === 'poi')

function applyFilters(map: maplibregl.Map, enabled: LayerEnabled, base: Record<string, unknown>) {
  const activeTransit = TRANSIT_GROUPS.filter(g => enabled[g.id]).flatMap(g => g.classes)
  if (activeTransit.length === 0) {
    map.setLayoutProperty('poi_transit', 'visibility', 'none')
  } else {
    map.setLayoutProperty('poi_transit', 'visibility', 'visible')
    map.setFilter('poi_transit', ['match', ['get', 'class'], activeTransit, true, false] as unknown as maplibregl.FilterSpecification)
  }

  const hiddenClasses = POI_GROUPS.filter(g => !enabled[g.id]).flatMap(g => g.classes)
  POI_LAYERS.forEach(layerId => {
    const baseFilter = base[layerId]
    if (!baseFilter) return
    map.setFilter(
      layerId,
      (hiddenClasses.length === 0
        ? baseFilter
        : ['all', baseFilter, ['match', ['get', 'class'], hiddenClasses, false, true]]
      ) as unknown as maplibregl.FilterSpecification
    )
  })
}

export default function LayerApplicator({ enabled }: { enabled: LayerEnabled }) {
  const { current: mapRef } = useMap()
  const map = mapRef?.getMap() as maplibregl.Map | undefined
  const baseFilters  = useRef<Record<string, unknown>>({})
  const enabledRef   = useRef(enabled)
  const ready        = useRef(false)

  enabledRef.current = enabled

  useEffect(() => {
    if (!map) return
    const capture = () => {
      POI_LAYERS.forEach(id => { baseFilters.current[id] = map.getFilter(id) })
      ready.current = true
      applyFilters(map, enabledRef.current, baseFilters.current)
    }
    if (map.isStyleLoaded()) capture()
    else map.once('load', capture)
  }, [map])

  useEffect(() => {
    if (!map || !ready.current) return
    applyFilters(map, enabled, baseFilters.current)
  }, [map, enabled])

  return null
}
