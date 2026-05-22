import type { PlanningApplication } from './types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number }> {
  const res = await fetch(`${API}/geocode/${encodeURIComponent(postcode)}`)
  if (!res.ok) throw new Error('Invalid postcode')
  return res.json()
}

export async function fetchApplications(
  lat: number,
  lng: number,
  radius = 1000
): Promise<PlanningApplication[]> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius) })
  const res = await fetch(`${API}/applications?${params}`)
  if (!res.ok) throw new Error('Failed to fetch applications')
  const data = await res.json() as { applications: PlanningApplication[] }
  return data.applications
}
