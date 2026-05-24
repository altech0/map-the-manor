'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'
import type { PlanningApplicationSummary } from '@/lib/types'

interface Props {
  applications: PlanningApplicationSummary[]
  onSelect: (app: PlanningApplicationSummary) => void
  selectedId: string | null
  visible?: boolean
}

const STATUS_COLOURS: Record<string, string> = {
  approved:  '#22c55e',
  refused:   '#ef4444',
  pending:   '#f59e0b',
  withdrawn: '#6b7280',
}

// Below this zoom individual dots show; above it clusters take over
const CLUSTER_MAX_ZOOM = 13

function toGeoJSON(apps: PlanningApplicationSummary[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: apps.map(a => ({
      type: 'Feature',
      id: a.id,
      geometry: { type: 'Point', coordinates: [a.longitude, a.latitude] },
      properties: { id: a.id, status: a.status },
    })),
  }
}

export default function ClusterLayer({ applications, onSelect, selectedId, visible = true }: Props) {
  const { current: mapRef } = useMap()
  const map = mapRef?.getMap() as maplibregl.Map | undefined
  const ready       = useRef(false)
  const appsRef     = useRef(applications)
  const onSelectRef = useRef(onSelect)
  const selectedRef = useRef(selectedId)
  const visibleRef  = useRef(visible)
  appsRef.current     = applications
  onSelectRef.current = onSelect
  selectedRef.current = selectedId
  visibleRef.current  = visible

  useEffect(() => {
    if (!map) return

    const setup = () => {
      if (!map.getSource('pins')) {
        map.addSource('pins', {
          type: 'geojson',
          data: toGeoJSON(appsRef.current) as unknown as Parameters<typeof map.addSource>[1] extends { data?: infer D } ? D : never,
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: 40,
        } as maplibregl.GeoJSONSourceSpecification)
      }

      // Cluster circle
      if (!map.getLayer('clusters')) {
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'pins',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#1e3a2a',
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 100, 30],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#c9a84c',
            'circle-opacity': 0.9,
          },
        })
      }

      // Cluster count label
      if (!map.getLayer('cluster-count')) {
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'pins',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: { 'text-color': '#c9a84c' },
        })
      }

      // Individual dots (unclustered)
      if (!map.getLayer('pins')) {
        map.addLayer({
          id: 'pins',
          type: 'circle',
          source: 'pins',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['case', ['==', ['get', 'id'], ''], 6, 6],
            'circle-color': ['match', ['get', 'status'],
              'approved',  '#22c55e',
              'refused',   '#ef4444',
              'pending',   '#f59e0b',
              'withdrawn', '#6b7280',
              '#f59e0b',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })
      }

      // Click cluster → zoom in
      map.on('click', 'clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        const cluster = features[0]
        const src = map.getSource('pins') as maplibregl.GeoJSONSource
        const zoom = await src.getClusterExpansionZoom(
          cluster.properties!.cluster_id as number
        )
        map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom })
      })

      // Click individual pin → select
      map.on('click', 'pins', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const props = feature.properties as { id: string; status: string }
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates
        const app = appsRef.current.find(a => a.id === props.id)
        if (app) onSelectRef.current(app)
        else onSelectRef.current({
          id: props.id,
          status: props.status as PlanningApplicationSummary['status'],
          decidedAt: null, submittedAt: null, fkCouncilId: null, latitude: lat, longitude: lng,
        })
      })

      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'pins',     () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'pins',     () => { map.getCanvas().style.cursor = '' })

      const vis = visibleRef.current ? 'visible' : 'none'
      for (const id of ['clusters', 'cluster-count', 'pins']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
      }

      ready.current = true
    }

    if (map.isStyleLoaded()) setup()
    else map.once('load', setup)

    return () => {
      ['cluster-count', 'clusters', 'pins'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id)
      })
      if (map.getSource('pins')) map.removeSource('pins')
      ready.current = false
    }
  }, [map])

  // Update source data when applications change
  useEffect(() => {
    if (!map || !ready.current) return
    const src = map.getSource('pins') as maplibregl.GeoJSONSource | undefined
    src?.setData(toGeoJSON(applications) as unknown as Parameters<typeof src.setData>[0])
  }, [map, applications])

  // Highlight selected pin
  useEffect(() => {
    if (!map || !ready.current) return
    if (map.getLayer('pins')) {
      map.setPaintProperty('pins', 'circle-radius', [
        'case', ['==', ['get', 'id'], selectedId ?? ''], 9, 6,
      ])
      map.setPaintProperty('pins', 'circle-stroke-width', [
        'case', ['==', ['get', 'id'], selectedId ?? ''], 3, 2,
      ])
    }
  }, [map, selectedId])

  // Show/hide all cluster layers
  useEffect(() => {
    if (!map || !ready.current) return
    const vis = visible ? 'visible' : 'none'
    for (const id of ['clusters', 'cluster-count', 'pins']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [map, visible])

  return null
}
