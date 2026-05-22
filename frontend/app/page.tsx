'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import SearchBar from '@/components/SearchBar'
import Sidebar from '@/components/Sidebar'
import { geocodePostcode, fetchApplications } from '@/lib/api'
import type { PlanningApplication, MapViewState } from '@/lib/types'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_VIEW: MapViewState = { longitude: -0.1276, latitude: 51.5074, zoom: 12 }

export default function Home() {
  const [applications, setApplications] = useState<PlanningApplication[]>([])
  const [selected, setSelected] = useState<PlanningApplication | null>(null)
  const [viewState, setViewState] = useState<MapViewState>(DEFAULT_VIEW)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = useCallback(async (postcode: string) => {
    setLoading(true)
    setError(null)
    try {
      const { lat, lng } = await geocodePostcode(postcode)
      setViewState({ latitude: lat, longitude: lng, zoom: 14 })
      const apps = await fetchApplications(lat, lng)
      setApplications(apps)
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-100 z-10 shrink-0">
        <span className="text-base font-semibold tracking-tight">Map the Manor</span>
        <SearchBar onSearch={handleSearch} loading={loading} />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
          <Sidebar application={selected} count={applications.length} />
        </aside>

        <main className="flex-1 relative">
          <Map
            applications={applications}
            selected={selected}
            onSelect={setSelected}
            viewState={viewState}
            onViewStateChange={setViewState}
          />
        </main>
      </div>
    </div>
  )
}
