'use client'

import MapGL, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlanningApplicationSummary, PlanningApplication, MapViewState, MapBounds } from '@/lib/types'
import type { LayerEnabled } from '@/lib/layers'
import LayerApplicator from './LayerApplicator'
import HeatmapLayer from './HeatmapLayer'
import CoverageLayer from './CoverageLayer'

const STATUS_COLOURS: Record<string, string> = {
  approved:  '#22c55e',
  refused:   '#ef4444',
  pending:   '#f59e0b',
  withdrawn: '#6b7280',
}

interface MapProps {
  applications: PlanningApplicationSummary[]
  selected: PlanningApplication | null
  onSelect: (app: PlanningApplicationSummary) => void
  viewState: MapViewState
  onViewStateChange: (vs: MapViewState) => void
  onBoundsChange: (bounds: MapBounds, zoom: number) => void
  layerEnabled: LayerEnabled
  heatmapEnabled: boolean
  coverage: GeoJSON.FeatureCollection | null
}

function emitBounds(map: { getBounds(): { getSouth(): number; getNorth(): number; getWest(): number; getEast(): number } }, zoom: number, cb: (b: MapBounds, z: number) => void) {
  const b = map.getBounds()
  cb({ minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() }, zoom)
}

export default function Map({ applications, selected, onSelect, viewState, onViewStateChange, onBoundsChange, layerEnabled, heatmapEnabled, coverage }: MapProps) {
  return (
    <MapGL
      {...viewState}
      onMove={e => { onViewStateChange(e.viewState); emitBounds(e.target, e.viewState.zoom, onBoundsChange) }}
      onLoad={e => emitBounds(e.target, viewState.zoom, onBoundsChange)}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://tiles.openfreemap.org/styles/liberty"
    >
      <NavigationControl position="top-right" />
      <CoverageLayer coverage={coverage} />
      <LayerApplicator enabled={layerEnabled} />
      <HeatmapLayer applications={applications} enabled={heatmapEnabled} />

      {applications.map(app => (
        <Marker
          key={app.id}
          longitude={app.longitude}
          latitude={app.latitude}
          anchor="center"
          onClick={e => { e.originalEvent.stopPropagation(); onSelect(app) }}
        >
          <div style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: STATUS_COLOURS[app.status] ?? STATUS_COLOURS.pending,
            border: '2px solid white',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            transform: selected?.id === app.id ? 'scale(1.8)' : 'scale(1)',
            transition: 'transform 0.15s ease',
          }} />
        </Marker>
      ))}
    </MapGL>
  )
}
