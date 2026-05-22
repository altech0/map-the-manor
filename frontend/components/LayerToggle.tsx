'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type maplibregl from 'maplibre-gl'

const POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20'] as const

interface Group {
  id: string
  label: string
  section: 'transit' | 'poi'
  classes: string[]
}

const GROUPS: Group[] = [
  { id: 'bus',      label: 'Bus stops',          section: 'transit', classes: ['bus'] },
  { id: 'rail',     label: 'Rail & Tube',         section: 'transit', classes: ['rail'] },
  { id: 'airport',  label: 'Airports',            section: 'transit', classes: ['airport'] },
  { id: 'education',label: 'Schools & Colleges',  section: 'poi',     classes: ['school', 'college', 'university', 'kindergarten'] },
  { id: 'health',   label: 'Healthcare',          section: 'poi',     classes: ['hospital', 'pharmacy', 'dentist', 'clinic', 'doctors'] },
  { id: 'food',     label: 'Food & Drink',        section: 'poi',     classes: ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'biergarten', 'ice_cream'] },
  { id: 'shopping', label: 'Shopping',            section: 'poi',     classes: ['shop', 'supermarket', 'convenience', 'department_store', 'clothes', 'mall'] },
  { id: 'worship',  label: 'Places of Worship',   section: 'poi',     classes: ['place_of_worship'] },
]

const TRANSIT_GROUPS = GROUPS.filter(g => g.section === 'transit')
const POI_GROUPS     = GROUPS.filter(g => g.section === 'poi')

export default function LayerToggle() {
  const { current: mapRef } = useMap()
  // react-map-gl's MapRef doesn't expose setter types; use the underlying maplibre instance
  const map = mapRef?.getMap() as maplibregl.Map | undefined
  const [open, setOpen]       = useState(false)
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(GROUPS.map(g => [g.id, true]))
  )
  // Store the unmodified rank filters from the style so we can restore them
  const baseFilters = useRef<Record<string, unknown>>({})

  useEffect(() => {
    if (!map) return
    const capture = () => {
      POI_LAYERS.forEach(id => {
        baseFilters.current[id] = map.getFilter(id)
      })
    }
    if (map.isStyleLoaded()) capture()
    else map.once('load', capture)
  }, [map])

  const applyFilters = useCallback((next: Record<string, boolean>) => {
    if (!map) return

    // Transit: rebuild the match filter for poi_transit
    const activeTransit = TRANSIT_GROUPS.filter(g => next[g.id]).flatMap(g => g.classes)
    if (activeTransit.length === 0) {
      map.setLayoutProperty('poi_transit', 'visibility', 'none')
    } else {
      map.setLayoutProperty('poi_transit', 'visibility', 'visible')
      map.setFilter('poi_transit', ['match', ['get', 'class'], activeTransit, true, false])
    }

    // General POIs: wrap base rank filter with a class exclusion
    const hiddenClasses = POI_GROUPS.filter(g => !next[g.id]).flatMap(g => g.classes)
    POI_LAYERS.forEach(layerId => {
      const base = baseFilters.current[layerId]
      if (!base) return
      if (hiddenClasses.length === 0) {
        map.setFilter(layerId, base as unknown as maplibregl.FilterSpecification)
      } else {
        map.setFilter(layerId, ['all', base, ['match', ['get', 'class'], hiddenClasses, false, true]] as unknown as maplibregl.FilterSpecification)
      }
    })
  }, [map])

  const toggle = useCallback((id: string) => {
    setEnabled(prev => {
      const next = { ...prev, [id]: !prev[id] }
      applyFilters(next)
      return next
    })
  }, [applyFilters])

  const hiddenCount = Object.values(enabled).filter(v => !v).length

  return (
    <div className="absolute top-2 left-2 z-10 select-none">
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
      >
        <IconLayers />
        Layers
        {hiddenCount > 0 && (
          <span className="bg-gray-900 text-white rounded-full px-1.5 py-px text-[10px] leading-none">
            {hiddenCount} off
          </span>
        )}
        <span className="text-gray-400 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-48 flex flex-col gap-3">
          <GroupSection label="Transport" groups={TRANSIT_GROUPS} enabled={enabled} onToggle={toggle} />
          <div className="border-t border-gray-100" />
          <GroupSection label="Places"    groups={POI_GROUPS}     enabled={enabled} onToggle={toggle} />
        </div>
      )}
    </div>
  )
}

function GroupSection({ label, groups, enabled, onToggle }: {
  label: string
  groups: Group[]
  enabled: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="flex flex-col gap-1.5">
        {groups.map(g => (
          <label key={g.id} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={enabled[g.id]}
              onChange={() => onToggle(g.id)}
              className="w-3 h-3 rounded accent-gray-900 cursor-pointer"
            />
            <span className={`text-xs transition-colors ${enabled[g.id] ? 'text-gray-700' : 'text-gray-400'}`}>
              {g.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function IconLayers() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 5.5L8 2L14.5 5.5L8 9L1.5 5.5Z" />
      <path d="M1.5 9.5L8 13L14.5 9.5" />
    </svg>
  )
}
