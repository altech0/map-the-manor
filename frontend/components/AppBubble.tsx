'use client'

import type { PlanningApplication } from '@/lib/types'

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  approved:  { label: 'Approved',  dot: 'bg-green-500',  badge: 'bg-green-50  text-green-800  border-green-200' },
  refused:   { label: 'Refused',   dot: 'bg-red-500',    badge: 'bg-red-50    text-red-800    border-red-200' },
  pending:   { label: 'Pending',   dot: 'bg-amber-400',  badge: 'bg-amber-50  text-amber-800  border-amber-200' },
  withdrawn: { label: 'Withdrawn', dot: 'bg-gray-400',   badge: 'bg-gray-50   text-gray-600   border-gray-200' },
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function formatDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  return `${ordinal(d.getUTCDate())} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
}

interface Props {
  app: PlanningApplication | null
  loading: boolean
  onClose: () => void
}

export default function AppBubble({ app, loading, onClose }: Props) {
  if (!loading && !app) return null

  const s = app ? (STATUS[app.status] ?? STATUS.pending) : null

  return (
    <div className="absolute bottom-6 right-4 z-20 w-72 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        aria-label="Close"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l10 10M12 2L2 12" />
        </svg>
      </button>

      {loading ? (
        <div className="p-6 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-[#1e3a2a] animate-spin" />
        </div>
      ) : app && s ? (
        <div className="p-4 flex flex-col gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border w-fit ${s.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
          <div>
            <h2 className="font-semibold text-gray-900 leading-snug pr-6">{app.address}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 font-mono">Ref: {app.reference}</p>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{app.description}</p>
          {app.objectionCount !== undefined && (
            <p className="text-xs font-medium text-amber-700">⚠ {app.objectionCount} objections filed</p>
          )}
          {formatDate(app.submittedAt) && (
            <p className="text-[11px] text-gray-400">Submitted {formatDate(app.submittedAt)}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
