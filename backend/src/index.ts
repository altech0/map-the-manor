import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({ origin: '*' }))

app.get('/health', c => c.json({ ok: true }))

// ─── helpers shared with sync ────────────────────────────────────────────────

function buildWktPolygon(lat: number, lng: number, radiusM: number): string {
  const dLat = radiusM / 111_000
  const dLng = radiusM / (111_000 * Math.cos(lat * Math.PI / 180))
  const n = lat + dLat, s = lat - dLat
  const e = lng + dLng, w = lng - dLng
  return `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`
}

function parseWktPoint(wkt: string | undefined): { lat: number; lng: number } | null {
  if (!wkt) return null
  const m = wkt.match(/POINT \(([+-]?\d+\.?\d*) ([+-]?\d+\.?\d*)\)/)
  if (!m) return null
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) }
}

type PlanningStatus = 'approved' | 'refused' | 'pending' | 'withdrawn'

function toStatus(decisionType?: string, appStatus?: string): PlanningStatus {
  const dt = (decisionType ?? '').toLowerCase()
  const as_ = (appStatus ?? '').toLowerCase()
  if (dt.includes('grant') || dt.includes('approv') || dt.includes('permit')) return 'approved'
  if (dt.includes('refus') || dt.includes('reject')) return 'refused'
  if (dt.includes('withdraw') || as_.includes('withdraw')) return 'withdrawn'
  return 'pending'
}

interface RawEntity {
  entity: number
  reference?: string
  'address-text'?: string
  description?: string
  'planning-decision-type'?: string
  'planning-application-status'?: string
  'decision-date'?: string
  'start-date'?: string
  'entry-date'?: string
  point?: string
  'planning-application-type'?: string
}

interface DbRow {
  id: string
  reference: string | null
  address: string | null
  description: string | null
  status: PlanningStatus
  decided_at: string | null
  submitted_at: string | null
  application_type: string | null
  latitude: number
  longitude: number
}

// ─── List endpoint — bbox query, compact array payload ───────────────────────

app.get('/applications', async c => {
  const minLat = parseFloat(c.req.query('minLat') ?? '')
  const maxLat = parseFloat(c.req.query('maxLat') ?? '')
  const minLng = parseFloat(c.req.query('minLng') ?? '')
  const maxLng = parseFloat(c.req.query('maxLng') ?? '')

  if ([minLat, maxLat, minLng, maxLng].some(isNaN))
    return c.json({ error: 'minLat, maxLat, minLng, maxLng are required' }, 400)

  const { results } = await c.env.DB.prepare(
    `SELECT id, status, decided_at, latitude, longitude
     FROM applications
     WHERE latitude  BETWEEN ? AND ?
       AND longitude BETWEEN ? AND ?
     ORDER BY decided_at DESC NULLS LAST`
  ).bind(minLat, maxLat, minLng, maxLng).all<DbRow>()

  // Compact wire format: [id, lat, lng, status, decidedAt]
  const rows = results.map(r => [
    r.id,
    Math.round(r.latitude  * 1e5) / 1e5,
    Math.round(r.longitude * 1e5) / 1e5,
    r.status,
    r.decided_at,
  ])

  return c.json({ rows })
})

// ─── Detail endpoint ──────────────────────────────────────────────────────────

app.get('/applications/:id', async c => {
  const id = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM applications WHERE id = ?`
  ).bind(id).all<DbRow>()

  if (!results.length) return c.json({ error: 'Not found' }, 404)
  const r = results[0]

  return c.json({
    id:              r.id,
    reference:       r.reference ?? r.id,
    address:         r.address ?? '',
    description:     r.description ?? '',
    status:          r.status,
    decidedAt:       r.decided_at,
    submittedAt:     r.submitted_at ?? '',
    applicationType: r.application_type ?? '',
    latitude:        r.latitude,
    longitude:       r.longitude,
  })
})

// ─── Coverage areas ───────────────────────────────────────────────────────────

const COVERAGE_ENTITY_IDS = [8600290, 8600264, 8600234]

app.get('/coverage', async c => {
  const features = await Promise.all(
    COVERAGE_ENTITY_IDS.map(id =>
      fetch(`https://www.planning.data.gov.uk/entity/${id}.geojson`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  )
  return c.json({ type: 'FeatureCollection', features: features.filter(Boolean) })
})

// ─── Geocoding ────────────────────────────────────────────────────────────────

const UK_POSTCODE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i

app.get('/geocode', async c => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: 'q is required' }, 400)

  if (UK_POSTCODE.test(q)) {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q)}`)
    if (res.ok) {
      const data = await res.json() as { result: { latitude: number; longitude: number; postcode: string } }
      return c.json({ results: [{ lat: data.result.latitude, lng: data.result.longitude, label: data.result.postcode }] })
    }
  }

  const params = new URLSearchParams({ q, format: 'json', limit: '5', countrycodes: 'gb', addressdetails: '0' })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'map-the-manor/1.0 (planning-data-explorer)' },
  })
  if (!res.ok) return c.json({ error: 'Search failed' }, 502)

  const raw = await res.json() as Array<{ lat: string; lon: string; display_name: string }>
  return c.json({
    results: raw.map(r => ({
      lat:   parseFloat(r.lat),
      lng:   parseFloat(r.lon),
      label: r.display_name.replace(/, United Kingdom$/, '').replace(/, England$/, ''),
    })),
  })
})

// ─── Sync (scheduled + manual) ───────────────────────────────────────────────

const UPSTREAM   = 'https://www.planning.data.gov.uk/entity.json'
const SYNC_FIELDS = [
  'entity', 'reference', 'address-text', 'description',
  'planning-decision-type', 'planning-application-status',
  'decision-date', 'start-date', 'entry-date',
  'point', 'planning-application-type',
]

function buildUpstreamParams(offset: number): URLSearchParams {
  const p = new URLSearchParams({ dataset: 'planning-application', limit: '500', offset: String(offset) })
  SYNC_FIELDS.forEach(f => p.append('field', f))
  return p
}

async function syncAll(db: D1Database): Promise<{ inserted: number; skipped: number }> {
  const first = await fetch(`${UPSTREAM}?${buildUpstreamParams(0)}`).then(r => r.json()) as { entities?: RawEntity[]; count?: number }
  const total  = first.count ?? 0
  const pages  = Math.ceil(total / 500)

  const allEntities: RawEntity[] = [...(first.entities ?? [])]

  // Fetch remaining pages in batches of 10
  for (let i = 1; i < pages; i += 10) {
    const batch = Array.from({ length: Math.min(10, pages - i) }, (_, j) => i + j)
    const results = await Promise.all(
      batch.map(page =>
        fetch(`${UPSTREAM}?${buildUpstreamParams(page * 500)}`).then(r => r.json()) as Promise<{ entities?: RawEntity[] }>
      )
    )
    for (const r of results) allEntities.push(...(r.entities ?? []))
  }

  let inserted = 0, skipped = 0

  // Upsert in batches of 100 rows (D1 batch limit is generous but keep chunks small)
  const CHUNK = 100
  for (let i = 0; i < allEntities.length; i += CHUNK) {
    const chunk = allEntities.slice(i, i + CHUNK)
    const stmts: D1PreparedStatement[] = []

    for (const e of chunk) {
      const pt = parseWktPoint(e.point)
      if (!pt) { skipped++; continue }

      stmts.push(
        db.prepare(
          `INSERT OR REPLACE INTO applications
           (id,reference,address,description,status,decided_at,submitted_at,application_type,latitude,longitude,synced_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`
        ).bind(
          String(e.entity),
          e.reference ?? null,
          e['address-text'] ?? null,
          e.description ?? null,
          toStatus(e['planning-decision-type'], e['planning-application-status']),
          e['decision-date'] || null,
          e['start-date'] || e['entry-date'] || null,
          e['planning-application-type'] ?? null,
          pt.lat,
          pt.lng,
        )
      )
      inserted++
    }

    if (stmts.length) await db.batch(stmts)
  }

  return { inserted, skipped }
}

// Cron trigger (runs at 03:00 UTC daily)
export default {
  ...app,
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(syncAll(env.DB).then(r => console.log('Sync complete', r)))
  },
  fetch: app.fetch,
}
