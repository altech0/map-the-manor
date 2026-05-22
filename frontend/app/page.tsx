'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/Sidebar'
import { fetchTile, fetchApplication, fetchCoverage } from '@/lib/api'
import type { PlanningApplicationSummary, PlanningApplication, MapViewState, MapBounds } from '@/lib/types'
import { DEFAULT_LAYER_ENABLED, type LayerEnabled } from '@/lib/layers'

const MapView = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_VIEW: MapViewState = { longitude: -0.1276, latitude: 51.5074, zoom: 12 }
const MIN_ZOOM       = 10   // below this zoom level, don't attempt to load
const DEBOUNCE_MS    = 600
const TILE_DEG       = 0.1  // ~11 km grid; one fetch per cell, cached forever
const TILE_BATCH     = 6    // concurrent tile fetches per round

function tileKey(latIdx: number, lngIdx: number) {
  return `${latIdx}:${lngIdx}`
}

function boundsToTiles(b: MapBounds) {
  const tiles: { key: string; bounds: MapBounds }[] = []
  const r0 = Math.floor(b.minLat / TILE_DEG), r1 = Math.floor(b.maxLat / TILE_DEG)
  const c0 = Math.floor(b.minLng / TILE_DEG), c1 = Math.floor(b.maxLng / TILE_DEG)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      tiles.push({
        key: tileKey(r, c),
        bounds: {
          minLat: r * TILE_DEG, maxLat: (r + 1) * TILE_DEG,
          minLng: c * TILE_DEG, maxLng: (c + 1) * TILE_DEG,
        },
      })
    }
  }
  return tiles
}

function cutoffDate(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

export default function Home() {
  const [rawApplications, setRawApplications] = useState<PlanningApplicationSummary[]>([])
  const [loading, setLoading]                 = useState(false)
  const [loadingMore, setLoadingMore]         = useState(false)
  const [selected, setSelected]               = useState<PlanningApplication | null>(null)
  const [detailLoading, setDetailLoading]     = useState(false)
  const [viewState, setViewState]             = useState<MapViewState>(DEFAULT_VIEW)
  const [layerEnabled, setLayerEnabled]       = useState<LayerEnabled>(DEFAULT_LAYER_ENABLED)
  const [days, setDays]                       = useState(30)
  const [heatmapEnabled, setHeatmapEnabled]   = useState(false)
  const [coverage, setCoverage]               = useState<GeoJSON.FeatureCollection | null>(null)

  const applications = useMemo(() => {
    const cutoff = cutoffDate(days)
    return rawApplications.filter(a => {
      const date = a.decidedAt ?? a.submittedAt
      return !date || date >= cutoff
    })
  }, [rawApplications, days])

  // Tile cache — loaded tiles stay forever; globalApps accumulates across pans
  const loadedTiles = useRef(new Set<string>())
  const globalApps  = useRef(new Map<string, PlanningApplicationSummary>())
  const fetchingTiles = useRef(new Set<string>()) // in-flight guard
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestBounds = useRef<MapBounds | null>(null)

  useEffect(() => { fetchCoverage().then(setCoverage).catch(() => {}) }, [])

  const loadBounds = useCallback(async (bounds: MapBounds) => {
    const allTiles  = boundsToTiles(bounds)
    const newTiles  = allTiles.filter(t =>
      !loadedTiles.current.has(t.key) && !fetchingTiles.current.has(t.key)
    )
    if (newTiles.length === 0) return

    newTiles.forEach(t => fetchingTiles.current.add(t.key))

    const isEmpty = globalApps.current.size === 0
    if (isEmpty) setLoading(true)
    else         setLoadingMore(true)

    for (let i = 0; i < newTiles.length; i += TILE_BATCH) {
      // Stop if a newer bounds is queued (user panned further)
      if (latestBounds.current !== bounds) break

      const batch = newTiles.slice(i, i + TILE_BATCH)
      const results = await Promise.allSettled(batch.map(t => fetchTile(t.bounds)))

      for (let j = 0; j < batch.length; j++) {
        const { key } = batch[j]
        fetchingTiles.current.delete(key)
        const result = results[j]
        if (result.status === 'fulfilled') {
          loadedTiles.current.add(key)
          for (const app of result.value) globalApps.current.set(app.id, app)
        }
      }

      setRawApplications(Array.from(globalApps.current.values()))
    }

    setLoading(false)
    setLoadingMore(false)
  }, [])

  const handleBoundsChange = useCallback((bounds: MapBounds, zoom: number) => {
    latestBounds.current = bounds
    if (zoom < MIN_ZOOM) return
    if (boundsTimer.current) clearTimeout(boundsTimer.current)
    boundsTimer.current = setTimeout(() => loadBounds(bounds), DEBOUNCE_MS)
  }, [loadBounds])

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setViewState({ latitude: lat, longitude: lng, zoom: 14 })
  }, [])

  const handleViewStateChange = useCallback((vs: MapViewState) => {
    setViewState(vs)
  }, [])

  const handleSelect = useCallback(async (summary: PlanningApplicationSummary) => {
    setDetailLoading(true)
    setSelected(null)
    try {
      setSelected(await fetchApplication(summary.id))
    } catch {
      setSelected({ ...summary, reference: '', address: '', description: '', submittedAt: '', applicationType: '' })
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const toggleLayer = useCallback((id: string) => {
    setLayerEnabled(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const setAllLayers = useCallback((enabled: boolean) => {
    setLayerEnabled(prev => Object.fromEntries(Object.keys(prev).map(k => [k, enabled])))
  }, [])

  return (
    <div className="flex flex-col h-screen">

      {/* Header */}
      <header className="shrink-0 bg-[#1a2e1a] flex items-center justify-center relative" style={{ height: 56 }}>
        <div className="absolute inset-x-8 bottom-0 h-px bg-[#c9a84c]/30" />
        <div className="flex flex-col items-center gap-0.5 pb-1">
          <h1
            className="text-[#d4a84c] tracking-[0.25em] uppercase text-lg leading-none"
            style={{ fontFamily: 'var(--font-cinzel), Georgia, serif', fontWeight: 600 }}
          >
            Map the Manor
          </h1>
          <div className="flex items-center gap-2">
            <div className="h-px w-16 bg-[#c9a84c]/40" />
            <div className="w-1 h-1 rounded-full bg-[#c9a84c]/60" />
            <div className="h-px w-16 bg-[#c9a84c]/40" />
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-72 shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
          <Sidebar
            application={selected}
            detailLoading={detailLoading}
            count={applications.length}
            rawCount={rawApplications.length}
            loading={loading}
            loadingMore={loadingMore}
            onLocationSelect={handleLocationSelect}
            layerEnabled={layerEnabled}
            onToggleLayer={toggleLayer}
            onSetAllLayers={setAllLayers}
            days={days}
            onDaysChange={setDays}
            heatmapEnabled={heatmapEnabled}
            onToggleHeatmap={() => setHeatmapEnabled(h => !h)}
          />
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <MapView
            applications={applications}
            selected={selected}
            onSelect={handleSelect}
            viewState={viewState}
            onViewStateChange={handleViewStateChange}
            onBoundsChange={handleBoundsChange}
            layerEnabled={layerEnabled}
            heatmapEnabled={heatmapEnabled}
            coverage={coverage}
          />
        </main>

      </div>
    </div>
  )
}
