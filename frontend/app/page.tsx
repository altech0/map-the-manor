'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/Sidebar'
import { geocodePostcode, fetchApplications } from '@/lib/api'
import type { PlanningApplication, MapViewState } from '@/lib/types'
import { DEFAULT_LAYER_ENABLED, type LayerEnabled } from '@/lib/layers'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_VIEW: MapViewState = { longitude: -0.1276, latitude: 51.5074, zoom: 12 }

export default function Home() {
  const [applications, setApplications]   = useState<PlanningApplication[]>([])
  const [selected, setSelected]           = useState<PlanningApplication | null>(null)
  const [viewState, setViewState]         = useState<MapViewState>(DEFAULT_VIEW)
  const [loading, setLoading]             = useState(false)
  const [layerEnabled, setLayerEnabled]   = useState<LayerEnabled>(DEFAULT_LAYER_ENABLED)

  const handleSearch = useCallback(async (postcode: string) => {
    setLoading(true)
    try {
      const { lat, lng } = await geocodePostcode(postcode)
      setViewState({ latitude: lat, longitude: lng, zoom: 14 })
      const apps = await fetchApplications(lat, lng)
      setApplications(apps)
      setSelected(null)
    } catch {
      // errors shown inline in Sidebar
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleLayer = useCallback((id: string) => {
    setLayerEnabled(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  return (
    <div className="flex flex-col h-screen">

      {/* Header */}
      <header className="shrink-0 bg-[#1a2e1a] flex items-center justify-center relative" style={{ height: 56 }}>
        {/* decorative side lines */}
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
            count={applications.length}
            onSearch={handleSearch}
            loading={loading}
            layerEnabled={layerEnabled}
            onToggleLayer={toggleLayer}
          />
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <Map
            applications={applications}
            selected={selected}
            onSelect={setSelected}
            viewState={viewState}
            onViewStateChange={setViewState}
            layerEnabled={layerEnabled}
          />
        </main>

      </div>
    </div>
  )
}
