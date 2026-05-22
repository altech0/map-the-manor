'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'

interface Props {
  coverage: GeoJSON.FeatureCollection | null
}

const WORLD_RING: GeoJSON.Position[] = [
  [-180, -85.051129], [180, -85.051129], [180, 85.051129], [-180, 85.051129], [-180, -85.051129],
]

// World-covering polygon with council areas punched out as holes
function buildMask(coverage: GeoJSON.FeatureCollection): GeoJSON.Feature {
  const holes: GeoJSON.Position[][] = []
  for (const feature of coverage.features) {
    const geom = (feature as GeoJSON.Feature).geometry
    if (!geom) continue
    if (geom.type === 'Polygon') {
      // Reverse exterior ring to make it a hole (CW winding)
      holes.push([...geom.coordinates[0]].reverse())
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        holes.push([...poly[0]].reverse())
      }
    }
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [WORLD_RING, ...holes] },
  }
}

// Full grey world before coverage loads
const FULL_MASK: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [WORLD_RING] },
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function CoverageLayer({ coverage }: Props) {
  const { current: mapRef } = useMap()
  const map = mapRef?.getMap() as maplibregl.Map | undefined
  const ready = useRef(false)
  const coverageRef = useRef(coverage)
  coverageRef.current = coverage

  useEffect(() => {
    if (!map) return

    const setup = () => {
      if (!map.getSource('coverage-mask')) {
        map.addSource('coverage-mask', {
          type: 'geojson',
          data: coverageRef.current ? buildMask(coverageRef.current) : FULL_MASK,
        })
      }
      if (!map.getLayer('coverage-mask-fill')) {
        map.addLayer({
          id: 'coverage-mask-fill',
          type: 'fill',
          source: 'coverage-mask',
          paint: {
            'fill-color': '#555555',
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 12, 0.2, 15, 0.08],
          },
        })
      }

      if (!map.getSource('coverage')) {
        map.addSource('coverage', {
          type: 'geojson',
          data: coverageRef.current ?? EMPTY,
        })
      }
      if (!map.getLayer('coverage-outline')) {
        map.addLayer({
          id: 'coverage-outline',
          type: 'line',
          source: 'coverage',
          paint: {
            'line-color': '#c9a84c',
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 1.5],
            'line-opacity': 0.8,
          },
        })
      }
      if (!map.getLayer('coverage-label')) {
        map.addLayer({
          id: 'coverage-label',
          type: 'symbol',
          source: 'coverage',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 13],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#c9a84c',
            'text-halo-color': '#1a2e1a',
            'text-halo-width': 1.5,
          },
        })
      }

      ready.current = true
    }

    if (map.isStyleLoaded()) setup()
    else map.once('load', setup)

    return () => {
      ['coverage-label', 'coverage-outline', 'coverage-mask-fill'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id)
      })
      if (map.getSource('coverage')) map.removeSource('coverage')
      if (map.getSource('coverage-mask')) map.removeSource('coverage-mask')
      ready.current = false
    }
  }, [map])

  useEffect(() => {
    if (!map || !ready.current || !coverage) return
    const maskSrc = map.getSource('coverage-mask') as maplibregl.GeoJSONSource | undefined
    maskSrc?.setData(buildMask(coverage) as unknown as Parameters<typeof maskSrc.setData>[0])
    const src = map.getSource('coverage') as maplibregl.GeoJSONSource | undefined
    src?.setData(coverage as unknown as Parameters<typeof src.setData>[0])
  }, [map, coverage])

  return null
}
