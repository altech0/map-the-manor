'use client'

import type { PlanningApplication } from '@/lib/types'

const STATUS: Record<string, { label: string; className: string }> = {
  approved:  { label: 'Approved',  className: 'bg-green-100 text-green-800' },
  refused:   { label: 'Refused',   className: 'bg-red-100 text-red-800' },
  pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800' },
  withdrawn: { label: 'Withdrawn', className: 'bg-gray-100 text-gray-600' },
}

interface SidebarProps {
  application: PlanningApplication | null
  count: number
}

export default function Sidebar({ application, count }: SidebarProps) {
  if (!application) {
    return (
      <div className="p-5 flex flex-col gap-1">
        <p className="text-sm font-semibold">{count} applications in view</p>
        <p className="text-xs text-gray-400">Click a pin to see details</p>
      </div>
    )
  }

  const status = STATUS[application.status] ?? STATUS.pending

  return (
    <div className="p-5 flex flex-col gap-3">
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${status.className}`}>
        {status.label}
      </span>
      <h2 className="text-sm font-semibold leading-snug">{application.address}</h2>
      <p className="text-xs text-gray-400 font-mono">Ref: {application.reference}</p>
      <p className="text-xs text-gray-500 leading-relaxed">{application.description}</p>
      {application.objectionCount !== undefined && (
        <p className="text-xs font-medium text-amber-700">⚠ {application.objectionCount} objections</p>
      )}
      <p className="text-xs text-gray-400">Submitted {application.submittedAt}</p>
    </div>
  )
}
