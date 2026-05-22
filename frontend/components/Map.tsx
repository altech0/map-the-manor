'use client'

import { useState } from 'react'
import MapGL, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlanningApplication, MapViewState } from '@/lib/types'
import LayerToggle from './LayerToggle'

const STATUS_COLOURS: Record<string, string> = {
  approved: '#22c55e',
  refused:  '#ef4444',
  pending:  '#f59e0b',
  withdrawn:'#6b7280',
}

interface MapProps {
  applications: PlanningApplication[]
  selected: PlanningApplication | null
  onSelect: (app: PlanningApplication) => void
  viewState: MapViewState
  onViewStateChange: (vs: MapViewState) => void
}

export default function Map({ applications, selected, onSelect, viewState, onViewStateChange }: MapProps) {
  return (
    <MapGL
      {...viewState}
      onMove={e => onViewStateChange(e.viewState)}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://tiles.openfreemap.org/styles/liberty"
    >
      <NavigationControl position="top-right" />
      <LayerToggle />
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
