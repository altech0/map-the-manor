#!/usr/bin/env node
/**
 * Fetches all planning application records from planning.data.gov.uk
 * and writes them into D1 via wrangler.
 *
 * Usage:
 *   node scripts/sync.mjs           # local D1
 *   node scripts/sync.mjs --remote  # production D1
 */

import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const UPSTREAM  = 'https://www.planning.data.gov.uk/entity.json'
const PAGE_SIZE = 500
const BATCH     = 10   // concurrent page fetches
const DB_NAME   = 'map-the-manor-db'
const remote    = process.argv.includes('--remote')

const FIELDS = [
  'entity', 'reference', 'address-text', 'description',
  'planning-decision-type', 'planning-application-status',
  'decision-date', 'start-date', 'entry-date',
  'point', 'planning-application-type',
]

function buildUrl(offset) {
  const p = new URLSearchParams({
    dataset: 'planning-application',
    limit:   String(PAGE_SIZE),
    offset:  String(offset),
  })
  FIELDS.forEach(f => p.append('field', f))
  return `${UPSTREAM}?${p}`
}

function parseWktPoint(wkt) {
  if (!wkt) return null
  const m = wkt.match(/POINT \(([+-]?\d+\.?\d*) ([+-]?\d+\.?\d*)\)/)
  if (!m) return null
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) }
}

function toStatus(decisionType = '', appStatus = '') {
  const dt = decisionType.toLowerCase()
  const as = appStatus.toLowerCase()
  if (dt.includes('grant') || dt.includes('approv') || dt.includes('permit')) return 'approved'
  if (dt.includes('refus') || dt.includes('reject'))  return 'refused'
  if (dt.includes('withdraw') || as.includes('withdraw')) return 'withdrawn'
  return 'pending'
}

function escape(v) {
  if (v == null) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

async function fetchPage(offset) {
  const res = await fetch(buildUrl(offset))
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`)
  return res.json()
}

async function main() {
  console.log('Fetching total count…')
  const first = await fetchPage(0)
  const total = first.count ?? 0
  console.log(`Total records: ${total}`)

  const pages = Math.ceil(total / PAGE_SIZE)
  const offsets = Array.from({ length: pages }, (_, i) => i * PAGE_SIZE)
  // First page already fetched
  let allEntities = [...(first.entities ?? [])]

  console.log(`Fetching ${pages} pages in batches of ${BATCH}…`)
  for (let i = 1; i < offsets.length; i += BATCH) {
    const slice = offsets.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(fetchPage))
    for (const r of results) allEntities.push(...(r.entities ?? []))
    process.stdout.write(`\r  ${allEntities.length.toLocaleString()} / ${total.toLocaleString()}`)
  }
  console.log('\nAll pages fetched. Normalising…')

  const rows = []
  for (const e of allEntities) {
    const pt = parseWktPoint(e.point)
    if (!pt) continue
    rows.push({
      id:               String(e.entity),
      reference:        e.reference ?? null,
      address:          e['address-text'] ?? null,
      description:      e.description ?? null,
      status:           toStatus(e['planning-decision-type'], e['planning-application-status']),
      decided_at:       e['decision-date'] || null,
      submitted_at:     e['start-date'] || e['entry-date'] || null,
      application_type: e['planning-application-type'] ?? null,
      latitude:         pt.lat,
      longitude:        pt.lng,
    })
  }
  console.log(`${rows.length.toLocaleString()} rows with valid coordinates`)

  // One INSERT per row — wrangler handles large files fine, just not large statements
  const sqlFile = join(tmpdir(), `mtm-seed-${Date.now()}.sql`)
  const cols = '(id,reference,address,description,status,decided_at,submitted_at,application_type,latitude,longitude,synced_at)'
  const lines = rows.map(r =>
    `INSERT OR REPLACE INTO applications ${cols} VALUES ` +
    `(${escape(r.id)},${escape(r.reference)},${escape(r.address)},${escape(r.description)},` +
    `${escape(r.status)},${escape(r.decided_at)},${escape(r.submitted_at)},` +
    `${escape(r.application_type)},${r.latitude},${r.longitude},datetime('now'));`
  )
  writeFileSync(sqlFile, lines.join('\n'))
  console.log(`SQL written to ${sqlFile}`)

  const flags = remote ? '--remote' : '--local'
  console.log(`Executing into D1 (${remote ? 'remote' : 'local'})…`)
  execSync(
    `npx wrangler d1 execute ${DB_NAME} ${flags} --file=${sqlFile}`,
    { stdio: 'inherit' }
  )

  unlinkSync(sqlFile)
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
