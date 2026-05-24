import type { CouncilSummary, PlanningApplicationSummary, PlanningApplication, MapBounds } from './types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export interface GeoResult { lat: number; lng: number; label: string }

export async function geocodeQuery(q: string): Promise<GeoResult[]> {
  const res = await fetch(`${API}/geocode?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error('Geocoding failed')
  const data = await res.json() as { results: GeoResult[] }
  return data.results
}

// Compact wire format: [id, latitude, longitude, status, decidedAt, submittedAt, fkCouncilId]
type TileRow = [string, number, number, string, string | null, string | null, string | null]

export async function fetchTile(bounds: MapBounds): Promise<PlanningApplicationSummary[]> {
  const params = new URLSearchParams({
    minLat: String(bounds.minLat), maxLat: String(bounds.maxLat),
    minLng: String(bounds.minLng), maxLng: String(bounds.maxLng),
  })
  const res = await fetch(`${API}/applications?${params}`)
  if (!res.ok) throw new Error('Failed to fetch tile')
  const { rows } = await res.json() as { rows: TileRow[] }
  return rows.map(([id, latitude, longitude, status, decidedAt, submittedAt, fkCouncilId]) => ({
    id, latitude, longitude,
    status: status as PlanningApplicationSummary['status'],
    decidedAt,
    submittedAt,
    fkCouncilId,
  }))
}

export async function fetchCouncils(): Promise<CouncilSummary[]> {
  const res = await fetch(`${API}/councils`)
  if (!res.ok) throw new Error('Failed to fetch councils')
  const { councils } = await res.json() as { councils: CouncilSummary[] }
  return councils
}

export async function fetchCoverage(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${API}/coverage`)
  if (!res.ok) throw new Error('Failed to fetch coverage')
  return res.json()
}

export async function fetchApplication(id: string): Promise<PlanningApplication> {
  const res = await fetch(`${API}/applications/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('Failed to fetch application')
  return res.json()
}
