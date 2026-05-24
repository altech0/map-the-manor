'use client'

import MapGL, { NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlanningApplicationSummary, PlanningApplication, MapViewState, MapBounds } from '@/lib/types'
import type { LayerEnabled } from '@/lib/layers'
import LayerApplicator from './LayerApplicator'
import HeatmapLayer from './HeatmapLayer'
import CoverageLayer from './CoverageLayer'
import ClusterLayer from './ClusterLayer'

interface MapProps {
  applications: PlanningApplicationSummary[]
  heatmapApplications: PlanningApplicationSummary[]
  selected: PlanningApplication | null
  onSelect: (app: PlanningApplicationSummary) => void
  viewState: MapViewState
  onViewStateChange: (vs: MapViewState) => void
  onBoundsChange: (bounds: MapBounds, zoom: number) => void
  layerEnabled: LayerEnabled
  heatmapEnabled: boolean
  coverage: GeoJSON.FeatureCollection | null
}

function emitBounds(
  map: { getBounds(): { getSouth(): number; getNorth(): number; getWest(): number; getEast(): number } },
  zoom: number,
  cb: (b: MapBounds, z: number) => void,
) {
  const b = map.getBounds()
  cb({ minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() }, zoom)
}

export default function Map({ applications, heatmapApplications, selected, onSelect, viewState, onViewStateChange, onBoundsChange, layerEnabled, heatmapEnabled, coverage }: MapProps) {
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
      <HeatmapLayer applications={heatmapApplications} enabled={heatmapEnabled} />
      <ClusterLayer
        applications={applications}
        onSelect={onSelect}
        selectedId={selected?.id ?? null}
        visible={!heatmapEnabled}
      />
    </MapGL>
  )
}
