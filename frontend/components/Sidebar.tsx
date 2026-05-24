'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { CouncilSummary } from '@/lib/types'
import { LAYER_GROUPS, type LayerEnabled } from '@/lib/layers'
import { geocodeQuery, type GeoResult } from '@/lib/api'

function dateToDays(iso: string) {
  return Math.floor(new Date(iso + 'T00:00:00Z').getTime() / 86400000)
}
function daysToISO(days: number) {
  return new Date(days * 86400000).toISOString().split('T')[0]
}
function fmtMonth(iso: string) {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function fmtShort(iso: string) {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

const TRANSIT_GROUPS = LAYER_GROUPS.filter(g => g.section === 'transit')
const POI_GROUPS     = LAYER_GROUPS.filter(g => g.section === 'poi')
const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 365,  label: '1y'  },
  { value: 730,  label: '2y'  },
  { value: 9999, label: 'All' },
]

interface SidebarProps {
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
  sliderDate: string | null
  sliderMin: number | null
  sliderMax: number | null
  heatmapCount: number
  playing: boolean
  onSliderDateChange: (d: string) => void
  onPlayPause: () => void
  councils: CouncilSummary[]
  selectedCouncilIds: Set<string>
  onToggleCouncil: (id: string) => void
}

export default function Sidebar({
  count, rawCount, loading, loadingMore, onLocationSelect,
  layerEnabled, onToggleLayer, onSetAllLayers,
  days, onDaysChange,
  heatmapEnabled, onToggleHeatmap,
  sliderDate, sliderMin, sliderMax, heatmapCount, playing, onSliderDateChange, onPlayPause,
  councils, selectedCouncilIds, onToggleCouncil,
}: SidebarProps) {
  const [layersOpen, setLayersOpen]     = useState(false)
  const [councilsOpen, setCouncilsOpen] = useState(false)
  const [councilSearch, setCouncilSearch] = useState('')
  const councilDropdownRef = useRef<HTMLDivElement>(null)
  const [searching, setSearching]       = useState(false)
  const [results, setResults]           = useState<GeoResult[]>([])
  const [searchError, setSearchError]   = useState(false)
  const inputRef                        = useRef<HTMLInputElement>(null)
  const allOn = Object.values(layerEnabled).every(Boolean)
  const filteredCouncils = councils.filter(c =>
    c.name.toLowerCase().includes(councilSearch.toLowerCase()) ||
    c.reference.toLowerCase().includes(councilSearch.toLowerCase())
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (councilDropdownRef.current && !councilDropdownRef.current.contains(e.target as Node))
        setCouncilsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
          {DAY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onDaysChange(value)}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                days === value
                  ? 'bg-[#1e3a2a] text-white border-[#1e3a2a]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Councils */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Councils</p>
        <div className="relative" ref={councilDropdownRef}>
          <button
            onClick={() => setCouncilsOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 hover:border-gray-400 transition-colors"
          >
            <span className="text-gray-700 truncate">
              {selectedCouncilIds.size === 0
                ? 'Select a council'
                : selectedCouncilIds.size === councils.length
                ? 'All councils'
                : councils.filter(c => selectedCouncilIds.has(c.pk_council_id)).map(c => c.reference).join(', ')
              }
            </span>
            <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${councilsOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {councilsOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search councils…"
                  value={councilSearch}
                  onChange={e => setCouncilSearch(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50 outline-none focus:border-gray-400 focus:bg-white"
                />
              </div>
              <ul className="max-h-48 overflow-y-auto">
                {filteredCouncils.length === 0
                  ? <li className="px-3 py-2 text-xs text-gray-400">No results</li>
                  : filteredCouncils.map(c => (
                    <li key={c.pk_council_id}>
                      <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCouncilIds.has(c.pk_council_id)}
                          onChange={() => onToggleCouncil(c.pk_council_id)}
                          className="w-3.5 h-3.5 accent-[#1e3a2a]"
                        />
                        <span className="text-xs text-gray-700 leading-snug">{c.name}</span>
                        <span className="text-[10px] text-gray-400 ml-auto shrink-0">{c.reference}</span>
                      </label>
                    </li>
                  ))
                }
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Visualisation */}
      <div className={`border-b border-gray-100 ${heatmapEnabled ? '' : 'p-4'}`}>
        <div className={heatmapEnabled ? 'p-4 pb-3' : ''}>
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

        {/* Time scrubber */}
        {heatmapEnabled && sliderDate && sliderMin !== null && sliderMax !== null && (
          <HeatmapScrubber
            sliderDate={sliderDate}
            sliderMin={sliderMin}
            sliderMax={sliderMax}
            heatmapCount={heatmapCount}
            playing={playing}
            onSliderDateChange={onSliderDateChange}
            onPlayPause={onPlayPause}
          />
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

      {/* Status */}
      <div className="flex-1 overflow-y-auto">
        <AppEmpty count={count} rawCount={rawCount} loading={loading} loadingMore={loadingMore} days={days} />
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
        <SlotValue
          value={`${count.toLocaleString()} result${count !== 1 ? 's' : ''} · ${DAY_OPTIONS.find(o => o.value === days)?.label ?? `${days}d`}`}
          className="font-medium text-gray-800"
        />
        {busy && <div className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-[#1e3a2a] animate-spin shrink-0" />}
      </div>

      {!busy && count === 0 && rawCount > 0 && (
        <p className="text-[11px] text-amber-600">No decisions in this period — try 2y or All</p>
      )}

      {!busy && count > 0 && (
        <p className="text-[11px] text-gray-400">
          {rawCount.toLocaleString()} loaded · click a pin for details
        </p>
      )}
    </div>
  )
}

function SlotValue({ value, className }: { value: string; className?: string }) {
  const wrapRef  = useRef<HTMLDivElement>(null)
  const prevRef  = useRef(value)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = value
    if (prev === value || !wrapRef.current) return

    const wrap = wrapRef.current

    // Ghost of the old value — slides out upward
    const ghost = document.createElement('span')
    ghost.textContent = prev
    ghost.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;'
    wrap.appendChild(ghost)
    ghost.animate(
      [{ transform: 'translateY(0)', opacity: '1' },
       { transform: 'translateY(-110%)', opacity: '0' }],
      { duration: 280, easing: 'ease-in', fill: 'forwards' }
    ).onfinish = () => ghost.remove()

    // Current value — springs in from below
    const live = wrap.querySelector('.slot-live') as HTMLElement | null
    live?.animate(
      [{ transform: 'translateY(110%)', opacity: '0.3' },
       { transform: 'translateY(0)',    opacity: '1'   }],
      { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' }
    )
  }, [value])

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className ?? ''}`}>
      <span className="slot-live">{value}</span>
    </div>
  )
}

interface ScrubberProps {
  sliderDate: string
  sliderMin: number
  sliderMax: number
  heatmapCount: number
  playing: boolean
  onSliderDateChange: (d: string) => void
  onPlayPause: () => void
}

function HeatmapScrubber({ sliderDate, sliderMin, sliderMax, heatmapCount, playing, onSliderDateChange, onPlayPause }: ScrubberProps) {
  const currentDays = dateToDays(sliderDate)
  const pct = Math.round(((currentDays - sliderMin) / (sliderMax - sliderMin)) * 100)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSliderDateChange(daysToISO(Number(e.target.value)))
  }, [onSliderDateChange])

  return (
    <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-4">

      {/* Date display */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[9px] text-gray-400 uppercase tracking-widest leading-none mb-1.5">Showing up to</p>
          <SlotValue value={fmtMonth(sliderDate)} className="text-base font-bold text-[#1e3a2a] leading-none" />
        </div>
        <p className="text-[10px] text-gray-400 tabular-nums">{heatmapCount.toLocaleString()} applications</p>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          value={currentDays}
          step={1}
          onChange={handleChange}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer outline-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[#1e3a2a]
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-white
            [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-[#1e3a2a]
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-white
            [&::-moz-range-thumb]:cursor-pointer"
          style={{
            background: `linear-gradient(to right, #1e3a2a 0%, #1e3a2a ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`,
          }}
        />
      </div>

      {/* Range labels */}
      <div className="flex justify-between text-[9px] text-gray-400 -mt-1">
        <span>{fmtShort(daysToISO(sliderMin))}</span>
        <span>{fmtShort(daysToISO(sliderMax))}</span>
      </div>

      {/* Play / Pause */}
      <button
        onClick={onPlayPause}
        className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#1e3a2a] text-[#c9a84c] text-xs font-semibold tracking-wide hover:bg-[#2a4f3a] transition-colors active:scale-95"
      >
        {playing ? (
          <>
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
            Pause
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
            </svg>
            {currentDays >= sliderMax ? 'Replay' : 'Play'}
          </>
        )}
      </button>
    </div>
  )
}

