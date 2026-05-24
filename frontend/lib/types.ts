export interface CouncilSummary {
  pk_council_id: string
  entity_id: string
  name: string
  reference: string
}

export interface PlanningApplicationSummary {
  id: string
  status: 'approved' | 'refused' | 'pending' | 'withdrawn'
  decidedAt: string | null
  submittedAt: string | null
  fkCouncilId: string | null
  latitude: number
  longitude: number
}

export interface PlanningApplication extends PlanningApplicationSummary {
  reference: string
  address: string
  description: string
  submittedAt: string
  applicationType: string
  objectionCount?: number
}

export interface MapViewState {
  longitude: number
  latitude: number
  zoom: number
}

export interface MapBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}
