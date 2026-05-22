'use client'

import type { PlanningApplication } from '@/lib/types'
import { LAYER_GROUPS, type LayerEnabled } from '@/lib/layers'

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  approved:  { label: 'Approved',  dot: 'bg-green-500',  badge: 'bg-green-50  text-green-800  border-green-200' },
  refused:   { label: 'Refused',   dot: 'bg-red-500',    badge: 'bg-red-50    text-red-800    border-red-200' },
  pending:   { label: 'Pending',   dot: 'bg-amber-400',  badge: 'bg-amber-50  text-amber-800  border-amber-200' },
  withdrawn: { label: 'Withdrawn', dot: 'bg-gray-400',   badge: 'bg-gray-50   text-gray-600   border-gray-200' },
}

const TRANSIT_GROUPS = LAYER_GROUPS.filter(g => g.section === 'transit')
const POI_GROUPS     = LAYER_GROUPS.filter(g => g.section === 'poi')

interface SidebarProps {
  application: PlanningApplication | null
  count: number
  onSearch: (postcode: string) => void
  loading: boolean
  layerEnabled: LayerEnabled
  onToggleLayer: (id: string) => void
}

export default function Sidebar({ application, count, onSearch, loading, layerEnabled, onToggleLayer }: SidebarProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const val = (e.currentTarget.elements.namedItem('postcode') as HTMLInputElement).value.trim()
    if (val) onSearch(val)
  }

  return (
    <div className="flex flex-col h-full text-sm">

      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Search</p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            name="postcode"
            type="text"
            placeholder="Enter postcode…"
            className="flex-1 min-w-0 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-gray-400 focus:bg-white transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-3 py-2 text-xs font-medium bg-[#1e3a2a] text-white rounded-lg disabled:opacity-40 hover:bg-[#2a4f3a] transition-colors shrink-0"
          >
            {loading ? '…' : 'Go'}
          </button>
        </form>
      </div>

      {/* Layers */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Map Layers</p>

        <div className="mb-3">
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

      {/* Application details */}
      <div className="flex-1 overflow-y-auto">
        {application ? <AppDetail app={application} /> : <AppEmpty count={count} />}
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

function AppEmpty({ count }: { count: number }) {
  return (
    <div className="p-4">
      {count > 0 ? (
        <>
          <p className="font-medium text-gray-800">{count} applications</p>
          <p className="text-xs text-gray-400 mt-0.5">Click a pin to see details</p>
        </>
      ) : (
        <p className="text-xs text-gray-400">Search a postcode to load planning applications</p>
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
