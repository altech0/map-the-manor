#!/usr/bin/env node
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
/**
 * Sheffield Idox ingest script
 *
 * Fetches planning applications month-by-month from Sheffield's Idox portal,
 * geocodes addresses via postcodes.io, and upserts into Cloudflare D1.
 *
 * Usage: node scripts/sheffield-ingest.mjs
 *
 * Walks backwards from the oldest Sheffield record in the DB (or today if none),
 * one month at a time, prompting to continue after each commit.
 */

import { createInterface } from 'node:readline'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const IDOX_BASE    = 'https://planningapps.sheffield.gov.uk/online-applications'
const POSTCODES_IO = 'https://api.postcodes.io/postcodes'
const DB_ID        = '6e25dd35-6bfc-4f99-9151-307a06f5238b'
const UA           = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// Sheffield council UUID — must exist in councils table before running
// Run the migration in 0004_sheffield.sql first
const SHEFFIELD_COUNCIL_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

// ─── Idox session ─────────────────────────────────────────────────────────────

async function initSession(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (attempt > 1) {
        const wait = attempt <= 2 ? 30000 : 90000
        console.log(`  Waiting ${wait / 1000}s before session init retry…`)
        await new Promise(r => setTimeout(r, wait))
      }
      const res    = await fetch(`${IDOX_BASE}/search.do?action=advanced&searchType=Application`, {
        headers: { 'User-Agent': UA },
      })
      if (res.status === 429) throw new Error(`Rate limited (429)`)
      const cookie = res.headers.get('set-cookie')?.match(/JSESSIONID=([^;]+)/)?.[1]
      const html   = await res.text()
      const csrf   = html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1]
      if (!cookie) throw new Error(`No JSESSIONID in response (status ${res.status})`)
      if (!csrf)   throw new Error('No CSRF token in page HTML')
      return { cookie, csrf }
    } catch (err) {
      console.log(`  Session init attempt ${attempt}/${retries} failed: ${err.message}`)
      if (attempt === retries) throw err
    }
  }
}

// ─── Fetch one page of results ─────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0') }
function fmtIdox(date) { return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` }

async function fetchPage(session, dateFrom, dateTo, page = 1) {
  const { cookie, csrf } = session

  const form = new URLSearchParams({
    '_csrf':                              csrf,
    'searchType':                         'Application',
    'searchCriteria.reference':           '',
    'searchCriteria.description':         '',
    'searchCriteria.caseStatus':          '',
    'searchCriteria.caseDecision':        '',
    'caseAddressType':                    'Application',
    'searchCriteria.address':             '',
    'date(applicationReceivedStart)':      fmtIdox(dateFrom),
    'date(applicationReceivedEnd)':        fmtIdox(dateTo),
    'searchCriteria.page':                String(page),
  })

  // Always use firstPage so the server re-executes the search from our criteria.
  // action=page is session-dependent and fails after ~13 pages; firstPage is self-contained.
  const endpoint = `${IDOX_BASE}/advancedSearchResults.do?action=firstPage`

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: {
      'User-Agent':    UA,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Cookie':        `JSESSIONID=${cookie}`,
      'Referer':       `${IDOX_BASE}/search.do?action=advanced&searchType=Application`,
    },
    body: form.toString(),
    redirect: 'follow',
  })

  return res.text()
}

// ─── Parse HTML results ────────────────────────────────────────────────────────

const POSTCODE_RE = /[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i

function parseResults(html) {
  const items = [...html.matchAll(/<li class="searchresult">([\s\S]*?)<\/li>/g)]

  return items.map(m => {
    const block = m[1]

    const status      = block.match(/<div class="value">\s*([\w\s]+?)\s*<\/div>/)?.[1]?.trim() ?? 'pending'
    const description = block.match(/class="summaryLinkTextClamp"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.trim() ?? ''
    const address     = block.match(/class="address"[^>]*>\s*([\s\S]*?)\s*<\/p>/)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
    const reference   = block.match(/Ref\.\s*No:\s*([\w/]+)/)?.[1]?.trim() ?? ''
    const keyVal      = block.match(/keyVal=([^&"]+)/)?.[1] ?? ''

    const receivedRaw = block.match(/Received:\s*([\w\s]+\d{4})/)?.[1]?.trim()
    const receivedAt  = receivedRaw ? parseIdoxDate(receivedRaw) : null

    const postcode    = address.match(POSTCODE_RE)?.[0]?.replace(/\s+/, ' ').toUpperCase() ?? null

    // Derive application_type from reference suffix (e.g. 24/00321/TCA → TCA)
    const appType = reference.split('/').pop() ?? null

    return { keyVal, reference, address, description, status: normaliseStatus(status), receivedAt, postcode, appType }
  })
}

function parseIdoxDate(str) {
  // "Wed 31 Jan 2024" → "2024-01-31"
  const d = new Date(str)
  if (isNaN(d)) return null
  return d.toISOString().split('T')[0]
}

function normaliseStatus(raw) {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('approv') || s.includes('grant') || s.includes('permit')) return 'approved'
  if (s.includes('refus'))                                                   return 'refused'
  if (s.includes('withdraw'))                                                return 'withdrawn'
  return 'pending'
}

function parseTotalPages(html) {
  const m = html.match(/of\s+(\d+)<\/span>/)
  if (!m) return 1
  return Math.ceil(parseInt(m[1]) / 10)
}

function parseTotalCount(html) {
  const m = html.match(/of\s+(\d+)<\/span>/)
  return m ? parseInt(m[1]) : 0
}

function pageUrl(page) {
  return `${IDOX_BASE}/pagedSearchResults.do?action=page&searchCriteria.page=${page}`
}

// ─── Geocode via postcodes.io ──────────────────────────────────────────────────

async function geocodeBatch(postcodes) {
  const unique  = [...new Set(postcodes.filter(Boolean))]
  const results = {}
  if (unique.length === 0) return results

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100)
    const res   = await fetch(POSTCODES_IO, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ postcodes: batch }),
    })
    const data = await res.json()
    for (const item of data.result ?? []) {
      if (item.result) {
        results[item.query.replace(/\s+/, ' ').toUpperCase()] = {
          latitude:  item.result.latitude,
          longitude: item.result.longitude,
        }
      }
    }
  }

  return results
}

// ─── D1 via wrangler ──────────────────────────────────────────────────────────

function d1Query(sql) {
  const tmpFile = join(tmpdir(), `shf-ingest-${Date.now()}.sql`)
  try {
    writeFileSync(tmpFile, sql)
    const raw = execSync(
      `npx wrangler d1 execute map-the-manor-db --remote --json --file "${tmpFile}"`,
      { cwd: new URL('..', import.meta.url).pathname, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString()
    const jsonStart = raw.indexOf('[')
    if (jsonStart === -1) throw new Error(`No JSON in wrangler output:\n${raw}`)
    return JSON.parse(raw.slice(jsonStart))
  } finally {
    try { execSync(`rm -f "${tmpFile}"`) } catch {}
  }
}

function getOldestSheffieldDate() {
  try {
    const rows = d1Query(
      `SELECT MIN(submitted_at) as oldest FROM applications WHERE fk_council_id = '${SHEFFIELD_COUNCIL_ID}'`
    )
    return rows?.[0]?.results?.[0]?.oldest ?? null
  } catch {
    return null
  }
}

function upsertApplications(apps) {
  if (apps.length === 0) return

  // Batch into groups of 50 to avoid wrangler command-length limits
  for (let i = 0; i < apps.length; i += 50) {
    const batch = apps.slice(i, i + 50)
    const values = batch.map(a => {
      const esc = s => s ? `'${String(s).replace(/'/g, "''")}'` : 'NULL'
      return `(lower(hex(randomblob(16))), ${esc('SHF:' + a.reference)}, ${esc(a.reference)}, ${esc(a.address)}, ${esc(a.description)}, ${esc(a.status)}, NULL, ${esc(a.receivedAt)}, ${esc(a.appType)}, NULL, NULL, ${esc(a.rawStatus)}, '${SHEFFIELD_COUNCIL_ID}', ${a.latitude}, ${a.longitude}, 'idox', datetime('now'))`
    }).join(',\n')

    const sql = `
      INSERT OR IGNORE INTO applications
        (pk_application_id, id, reference, address, description, status, decided_at, submitted_at,
         application_type, organisation_entity, decision_type, raw_status, fk_council_id,
         latitude, longitude, source_type, synced_at)
      VALUES ${values}
    `
    d1Query(sql)
  }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Fetch all pages for a single date range.
// Returns { records, sessionDead } — sessionDead=true means pages went empty mid-way.
async function fetchDateRange(session, dateFrom, dateTo) {
  let html       = await fetchPage(session, dateFrom, dateTo, 1)
  const total    = parseTotalPages(html)
  const count    = parseTotalCount(html)
  let allRecords = parseResults(html)
  let sessionDead = false

  console.log(`    ${fmtIdox(dateFrom)}→${fmtIdox(dateTo)}: ${count} total, page 1/${total}`)

  for (let page = 2; page <= total; page++) {
    await new Promise(r => setTimeout(r, 2500))
    html = await fetchPage(session, dateFrom, dateTo, page)
    const more = parseResults(html)
    if (more.length === 0) {
      console.log(`    page ${page} empty — session budget exhausted`)
      sessionDead = true
      break
    }
    allRecords.push(...more)
    console.log(`    page ${page}/${total} — ${allRecords.length} so far`)
  }

  return { records: allRecords, sessionDead }
}

async function fetchMonth(session, year, month) {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd   = new Date(year, month, 0)
  const label      = `${monthStart.toLocaleString('en-GB', { month: 'long' })} ${year}`

  console.log(`\n── ${label} ──────────────────────`)

  // 2-day chunks. Retry the chunk with a fresh session if it exhausts mid-way.
  let allRecords = []
  let cursor = new Date(monthStart)
  while (cursor <= monthEnd) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + 1 * 86400000, monthEnd.getTime()))
    let { records, sessionDead } = await fetchDateRange(session, cursor, chunkEnd)

    if (sessionDead) {
      console.log(`  Session exhausted — waiting 30s then retrying chunk with fresh session…`)
      await new Promise(r => setTimeout(r, 30000))
      session = await initSession()
      const retry = await fetchDateRange(session, cursor, chunkEnd)
      records = retry.records
      // if still dead after retry, accept partial results and carry on
    }

    allRecords.push(...records)
    await new Promise(r => setTimeout(r, 2000))
    cursor = new Date(chunkEnd.getTime() + 86400000)
  }

  // Filter out records with no reference
  const valid   = allRecords.filter(r => r.reference)
  const skipped = allRecords.length - valid.length
  if (skipped > 0) console.log(`  Skipped ${skipped} records with no reference`)

  // Geocode via postcodes.io
  const SHEFFIELD_LAT = 53.3811
  const SHEFFIELD_LNG = -1.4701
  console.log(`  Geocoding ${valid.filter(r => r.postcode).length} postcodes…`)
  const geoMap = await geocodeBatch(valid.map(r => r.postcode))

  const toInsert = valid.map(r => {
    const geo = r.postcode ? geoMap[r.postcode] : null
    return {
      ...r,
      rawStatus: r.status,
      latitude:  geo?.latitude  ?? SHEFFIELD_LAT,
      longitude: geo?.longitude ?? SHEFFIELD_LNG,
    }
  })

  // Save to local backup before committing (so data isn't lost if D1 write fails)
  const backupDir = new URL('../data/sheffield-backups', import.meta.url).pathname
  mkdirSync(backupDir, { recursive: true })
  const backupFile = join(backupDir, `${year}-${String(month).padStart(2, '0')}.json`)
  writeFileSync(backupFile, JSON.stringify(toInsert, null, 2))
  console.log(`  Saved backup → ${backupFile}`)

  // Commit in batches of 50
  console.log(`  Committing ${toInsert.length} records to D1…`)
  upsertApplications(toInsert)
  console.log(`  ✓ Done — ${toInsert.length} records committed for ${label}`)

  return { count: toInsert.length, session }
}

async function main() {
  console.log('Sheffield Idox ingest')
  console.log('─────────────────────')

  // Find starting point
  const oldest = getOldestSheffieldDate()
  let year, month

  if (oldest) {
    console.log(`Oldest Sheffield record in DB: ${oldest}`)
    const d = new Date(oldest)
    // Start one month before the oldest record
    month = d.getMonth() + 1 // getMonth is 0-indexed, so this gives the month before
    year  = d.getFullYear()
    if (month === 0) { month = 12; year-- }
    console.log(`Starting from: ${month}/${year} (one month before oldest)`)
  } else {
    console.log('No Sheffield records in DB — starting from current month')
    const now = new Date()
    year  = now.getFullYear()
    month = now.getMonth() + 1
  }

  // Init Idox session
  console.log('\nInitialising Idox session…')
  let session = await initSession()
  console.log('Session ready')

  let total = 0
  let monthsProcessed = 0

  while (true) {
    const { count, session: updatedSession } = await fetchMonth(session, year, month)
    session = updatedSession
    total += count
    monthsProcessed++

    console.log(`\nTotal committed so far: ${total}`)

    const ans = await prompt('Continue to previous month? (y/n): ')
    if (ans.toLowerCase() !== 'y') break

    // Go back one month
    month--
    if (month === 0) { month = 12; year-- }

    // Refresh session every 10 months to avoid expiry
    if (monthsProcessed % 10 === 0) {
      console.log('Refreshing Idox session…')
      session = await initSession()
    }
  }

  console.log(`\nDone. ${total} total records committed.`)
}

main().catch(err => { console.error(err); process.exit(1) })
