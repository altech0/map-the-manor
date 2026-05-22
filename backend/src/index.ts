import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({ origin: '*' }))

app.get('/health', c => c.json({ ok: true }))

app.get('/applications', async c => {
  const lat = c.req.query('lat')
  const lng = c.req.query('lng')
  const radius = c.req.query('radius') ?? '1000'

  if (!lat || !lng) return c.json({ error: 'lat and lng are required' }, 400)

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    dataset: 'planning-application',
    limit: '100',
    radius: radius,
  })

  const res = await fetch(`https://www.planning.data.gov.uk/api/v1/entities.json?${params}`)
  if (!res.ok) return c.json({ error: 'Failed to fetch planning data' }, 502)

  const data = await res.json() as { entities?: unknown[] }
  return c.json({ applications: data.entities ?? [] })
})

app.get('/geocode/:postcode', async c => {
  const postcode = c.req.param('postcode')
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)
  if (!res.ok) return c.json({ error: 'Invalid postcode' }, 400)
  const data = await res.json() as { result: { latitude: number; longitude: number } }
  return c.json({ lat: data.result.latitude, lng: data.result.longitude })
})

export default app
