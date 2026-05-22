export interface PlanningApplication {
  id: string
  reference: string
  address: string
  description: string
  status: 'approved' | 'refused' | 'pending' | 'withdrawn'
  decidedAt?: string
  submittedAt: string
  latitude: number
  longitude: number
  applicationType: string
  objectionCount?: number
}

export interface MapViewState {
  longitude: number
  latitude: number
  zoom: number
}
