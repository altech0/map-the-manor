'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/Sidebar'
import AppBubble from '@/components/AppBubble'
import { fetchTile, fetchApplication, fetchCoverage, fetchCouncils } from '@/lib/api'
import type { CouncilSummary, PlanningApplicationSummary, PlanningApplication, MapViewState, MapBounds } from '@/lib/types'
import { DEFAULT_LAYER_ENABLED, type LayerEnabled } from '@/lib/layers'

const MapView = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_VIEW: MapViewState = { longitude: -0.1276, latitude: 51.5074, zoom: 12 }
const MIN_ZOOM       = 10   // below this zoom level, don't attempt to load
const DEBOUNCE_MS    = 600
const TILE_DEG       = 0.1  // ~11 km grid; one fetch per cell, cached forever
const TILE_BATCH     = 6    // concurrent tile fetches per round
const ANIM_TICKS     = 150  // total steps in play animation
const ANIM_MS        = 80   // ms per tick

function dateToDays(iso: string) {
  return Math.floor(new Date(iso + 'T00:00:00Z').getTime() / 86400000)
}
function daysToISO(days: number) {
  return new Date(days * 86400000).toISOString().split('T')[0]
}

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
  const [days, setDays]                       = useState(365)
  const [heatmapEnabled, setHeatmapEnabled]   = useState(false)
  const [sliderDate, setSliderDate]           = useState<string | null>(null)
  const [playing, setPlaying]                 = useState(false)
  const [coverage, setCoverage]               = useState<GeoJSON.FeatureCollection | null>(null)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [councils, setCouncils]               = useState<CouncilSummary[]>([])
  const [selectedCouncilIds, setSelectedCouncilIds] = useState<Set<string>>(new Set())

  const applications = useMemo(() => {
    const cutoff = cutoffDate(days)
    return rawApplications.filter(a => {
      const date = a.decidedAt ?? a.submittedAt
      const dateOk = !date || date >= cutoff
      const councilOk = selectedCouncilIds.size > 0 && a.fkCouncilId !== null && selectedCouncilIds.has(a.fkCouncilId)
      return dateOk && councilOk
    })
  }, [rawApplications, days, selectedCouncilIds])

  // Bounds of dates actually present in the filtered dataset
  const sliderBounds = useMemo(() => {
    let min = '', max = ''
    for (const a of applications) {
      const d = a.decidedAt ?? a.submittedAt
      if (!d) continue
      if (!min || d < min) min = d
      if (!max || d > max) max = d
    }
    if (!min) return null
    return { min: dateToDays(min), max: dateToDays(max) }
  }, [applications])

  // Applications visible on the heatmap given the current slider position
  const heatmapApplications = useMemo(() => {
    if (!heatmapEnabled || !sliderDate) return applications
    return applications.filter(a => {
      const d = a.decidedAt ?? a.submittedAt
      return !d || d <= sliderDate
    })
  }, [heatmapEnabled, applications, sliderDate])

  // Tile cache — loaded tiles stay forever; globalApps accumulates across pans
  const loadedTiles = useRef(new Set<string>())
  const globalApps  = useRef(new Map<string, PlanningApplicationSummary>())
  const fetchingTiles = useRef(new Set<string>()) // in-flight guard
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestBounds = useRef<MapBounds | null>(null)

  useEffect(() => { fetchCoverage().then(setCoverage).catch(() => {}) }, [])

  useEffect(() => {
    fetchCouncils().then(list => {
      setCouncils(list)
      const camden = list.find(c => c.entity_id === '90')
      if (camden) setSelectedCouncilIds(new Set([camden.pk_council_id]))
    }).catch(() => {})
  }, [])

  // Initialise / clear sliderDate when heatmap or slider bounds change
  useEffect(() => {
    if (!heatmapEnabled) { setSliderDate(null); setPlaying(false); return }
    if (sliderBounds) setSliderDate(prev => prev ?? daysToISO(sliderBounds.max))
  }, [heatmapEnabled, sliderBounds])

  // Drive the play animation
  useEffect(() => {
    if (!playing || !sliderBounds) return
    const { min, max } = sliderBounds
    const daysPerTick = Math.max(1, Math.ceil((max - min) / ANIM_TICKS))
    const id = setInterval(() => {
      setSliderDate(prev => {
        const cur = prev ? dateToDays(prev) : min
        return daysToISO(Math.min(cur + daysPerTick, max))
      })
    }, ANIM_MS)
    return () => clearInterval(id)
  }, [playing, sliderBounds])

  // Auto-stop when slider reaches the end
  useEffect(() => {
    if (playing && sliderBounds && sliderDate && dateToDays(sliderDate) >= sliderBounds.max) {
      setPlaying(false)
    }
  }, [playing, sliderDate, sliderBounds])

  const handlePlayPause = useCallback(() => {
    if (playing) { setPlaying(false); return }
    // Restart from beginning if already at the end
    if (sliderBounds && sliderDate && dateToDays(sliderDate) >= sliderBounds.max) {
      setSliderDate(daysToISO(sliderBounds.min))
    }
    setPlaying(true)
  }, [playing, sliderBounds, sliderDate])

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
      <div className="flex flex-1 overflow-hidden relative">

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          w-72 shrink-0 bg-white border-r border-gray-100 overflow-y-auto
          absolute inset-y-0 left-0 z-30 transition-transform duration-200
          md:relative md:translate-x-0 md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <Sidebar
            count={applications.length}
            rawCount={rawApplications.length}
            loading={loading}
            loadingMore={loadingMore}
            onLocationSelect={(lat, lng) => { handleLocationSelect(lat, lng); setSidebarOpen(false) }}
            layerEnabled={layerEnabled}
            onToggleLayer={toggleLayer}
            onSetAllLayers={setAllLayers}
            days={days}
            onDaysChange={setDays}
            heatmapEnabled={heatmapEnabled}
            onToggleHeatmap={() => setHeatmapEnabled(h => !h)}
            sliderDate={sliderDate}
            sliderMin={sliderBounds?.min ?? null}
            sliderMax={sliderBounds?.max ?? null}
            heatmapCount={heatmapApplications.length}
            playing={playing}
            onSliderDateChange={setSliderDate}
            onPlayPause={handlePlayPause}
            councils={councils}
            selectedCouncilIds={selectedCouncilIds}
            onToggleCouncil={id => setSelectedCouncilIds(prev =>
              prev.has(id) ? new Set() : new Set([id])
            )}
          />
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <AppBubble
            app={selected}
            loading={detailLoading}
            onClose={() => { setSelected(null); setDetailLoading(false) }}
          />
          {/* Mobile sidebar toggle */}
          <button
            className="md:hidden absolute top-2 left-2 z-10 bg-white rounded-lg shadow-md p-2 text-gray-700"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen
              ? <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l12 12M16 4L4 16"/></svg>
              : <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14"/></svg>
            }
          </button>
          <MapView
            applications={applications}
            heatmapApplications={heatmapApplications}
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
