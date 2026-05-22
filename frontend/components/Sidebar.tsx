'use client'

import { useState, useRef } from 'react'
import type { PlanningApplication } from '@/lib/types'
import { LAYER_GROUPS, type LayerEnabled } from '@/lib/layers'
import { geocodeQuery, type GeoResult } from '@/lib/api'

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  approved:  { label: 'Approved',  dot: 'bg-green-500',  badge: 'bg-green-50  text-green-800  border-green-200' },
  refused:   { label: 'Refused',   dot: 'bg-red-500',    badge: 'bg-red-50    text-red-800    border-red-200' },
  pending:   { label: 'Pending',   dot: 'bg-amber-400',  badge: 'bg-amber-50  text-amber-800  border-amber-200' },
  withdrawn: { label: 'Withdrawn', dot: 'bg-gray-400',   badge: 'bg-gray-50   text-gray-600   border-gray-200' },
}

const TRANSIT_GROUPS = LAYER_GROUPS.filter(g => g.section === 'transit')
const POI_GROUPS     = LAYER_GROUPS.filter(g => g.section === 'poi')
const DAY_OPTIONS    = [30, 60, 90] as const

interface SidebarProps {
  application: PlanningApplication | null
  detailLoading: boolean
  count: number
  rawCount: number
  loading: boolean
  loadingMore: boolean
  onLocationSelect: (lat: number, lng: number) => void
  layerEnabled: LayerEnabled
  onToggleLayer: (id: string) => void
  onSetAllLayers: (enabled: boolean) => void
  days: number
  onDaysChange: (d: number) => void
  heatmapEnabled: boolean
  onToggleHeatmap: () => void
}

export default function Sidebar({
  application, detailLoading, count, rawCount, loading, loadingMore, onLocationSelect,
  layerEnabled, onToggleLayer, onSetAllLayers,
  days, onDaysChange,
  heatmapEnabled, onToggleHeatmap,
}: SidebarProps) {
  const [layersOpen, setLayersOpen]     = useState(false)
  const [searching, setSearching]       = useState(false)
  const [results, setResults]           = useState<GeoResult[]>([])
  const [searchError, setSearchError]   = useState(false)
  const inputRef                        = useRef<HTMLInputElement>(null)
  const allOn = Object.values(layerEnabled).every(Boolean)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = inputRef.current?.value.trim()
    if (!q) return
    setSearching(true)
    setResults([])
    setSearchError(false)
    try {
      const res = await geocodeQuery(q)
      if (res.length === 0) { setSearchError(true); return }
      if (res.length === 1) { onLocationSelect(res[0].lat, res[0].lng); return }
      setResults(res)
    } catch {
      setSearchError(true)
    } finally {
      setSearching(false)
    }
  }

  const pickResult = (r: GeoResult) => {
    setResults([])
    if (inputRef.current) inputRef.current.value = r.label.split(',')[0]
    onLocationSelect(r.lat, r.lng)
  }

  return (
    <div className="flex flex-col h-full text-sm">

      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Search</p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Postcode, address or place…"
            className="flex-1 min-w-0 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-gray-400 focus:bg-white transition-colors"
            onChange={() => { setResults([]); setSearchError(false) }}
          />
          <button
            type="submit"
            disabled={loading || searching}
            className="px-3 py-2 text-xs font-medium bg-[#1e3a2a] text-white rounded-lg disabled:opacity-40 hover:bg-[#2a4f3a] transition-colors shrink-0"
          >
            {searching ? '…' : 'Go'}
          </button>
        </form>
        {searchError && (
          <p className="text-[11px] text-red-500 mt-1.5">No results found</p>
        )}
        {results.length > 1 && (
          <ul className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden text-xs">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => pickResult(r)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 leading-snug"
                >
                  <span className="font-medium text-gray-800">{r.label.split(',')[0]}</span>
                  <span className="text-gray-400 ml-1">{r.label.split(',').slice(1, 3).join(',')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Time range */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Time Range</p>
        <div className="flex gap-1.5">
          {DAY_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                days === d
                  ? 'bg-[#1e3a2a] text-white border-[#1e3a2a]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Visualisation */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Visualisation</p>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div
            onClick={onToggleHeatmap}
            className={`w-8 h-4 rounded-full transition-colors relative shrink-0 cursor-pointer ${heatmapEnabled ? 'bg-[#1e3a2a]' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${heatmapEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className={`text-xs transition-colors ${heatmapEnabled ? 'text-gray-700' : 'text-gray-400'}`}>
            Decision heatmap
          </span>
        </label>
        {heatmapEnabled && (
          <div className="mt-2.5 flex gap-3">
            {Object.entries({ approved: '#22c55e', refused: '#ef4444', pending: '#f59e0b' }).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-gray-400">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Map Layers — collapsible */}
      <div className="border-b border-gray-100">
        <div className="px-4 py-3 flex items-center gap-2">
          <button
            onClick={() => setLayersOpen(o => !o)}
            className="flex items-center gap-2 flex-1 text-left min-w-0"
          >
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Map Layers</p>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${layersOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
            >
              <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div
            onClick={() => onSetAllLayers(!allOn)}
            className={`w-8 h-4 rounded-full transition-colors relative shrink-0 cursor-pointer ${allOn ? 'bg-[#1e3a2a]' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${allOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </div>

        {layersOpen && (
          <div className="px-4 pb-4 flex flex-col gap-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Transport</p>
              <div className="flex flex-col gap-2">
                {TRANSIT_GROUPS.map(g => (
                  <LayerRow key={g.id} group={g} enabled={layerEnabled[g.id]} onToggle={onToggleLayer} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Places</p>
              <div className="flex flex-col gap-2">
                {POI_GROUPS.map(g => (
                  <LayerRow key={g.id} group={g} enabled={layerEnabled[g.id]} onToggle={onToggleLayer} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Application details */}
      <div className="flex-1 overflow-y-auto">
        {detailLoading
          ? <div className="p-4 flex flex-col items-center gap-3 pt-8">
              <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-[#1e3a2a] animate-spin" />
            </div>
          : application
            ? <AppDetail app={application} />
            : <AppEmpty count={count} rawCount={rawCount} loading={loading} loadingMore={loadingMore} days={days} />
        }
      </div>

    </div>
  )
}

function LayerRow({ group, enabled, onToggle }: { group: typeof LAYER_GROUPS[number]; enabled: boolean; onToggle: (id: string) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={() => onToggle(group.id)}
        className={`w-8 h-4 rounded-full transition-colors relative shrink-0 cursor-pointer ${enabled ? 'bg-[#1e3a2a]' : 'bg-gray-200'}`}
      >
        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className={`text-xs transition-colors ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
        {group.label}
      </span>
    </label>
  )
}

function AppEmpty({ count, rawCount, loading, loadingMore, days }: {
  count: number; rawCount: number; loading: boolean; loadingMore: boolean; days: number
}) {
  const busy = loading || loadingMore

  if (loading && rawCount === 0) {
    return (
      <div className="p-4 flex flex-col items-center gap-3 pt-8">
        <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-[#1e3a2a] animate-spin" />
        <p className="text-xs text-gray-400">Loading…</p>
      </div>
    )
  }

  if (rawCount === 0 && !busy) {
    return (
      <div className="p-4">
        <p className="text-xs text-gray-500 font-medium">No data in this area</p>
        <p className="text-xs text-gray-400 mt-0.5">Try Camden, Doncaster or Worthing</p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <p className="font-medium text-gray-800">
          {count.toLocaleString()} result{count !== 1 ? 's' : ''} · last {days}d
        </p>
        {busy && <div className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-[#1e3a2a] animate-spin shrink-0" />}
      </div>

      {!busy && count === 0 && rawCount > 0 && (
        <p className="text-[11px] text-amber-600">No decisions in this period — try 60d or 90d</p>
      )}

      {!busy && count > 0 && (
        <p className="text-[11px] text-gray-400">
          {rawCount.toLocaleString()} loaded · click a pin for details
        </p>
      )}
    </div>
  )
}

function AppDetail({ app }: { app: PlanningApplication }) {
  const s = STATUS[app.status] ?? STATUS.pending
  return (
    <div className="p-4 flex flex-col gap-3">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border w-fit ${s.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
      <div>
        <h2 className="font-semibold text-gray-900 leading-snug">{app.address}</h2>
        <p className="text-[11px] text-gray-400 mt-0.5 font-mono">Ref: {app.reference}</p>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{app.description}</p>
      {app.objectionCount !== undefined && (
        <p className="text-xs font-medium text-amber-700">⚠ {app.objectionCount} objections filed</p>
      )}
      <p className="text-[11px] text-gray-400">Submitted {app.submittedAt}</p>
    </div>
  )
}
