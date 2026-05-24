const BASE = 'https://planningapps.sheffield.gov.uk/online-applications'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// 1. Load advanced search page — get session + CSRF
const init = await fetch(`${BASE}/search.do?action=advanced&searchType=Application`, {
  headers: { 'User-Agent': UA },
})
const cookie = init.headers.get('set-cookie')?.match(/JSESSIONID=([^;]+)/)?.[1]
const html0  = await init.text()
const csrf   = html0.match(/name="_csrf"\s+value="([^"]+)"/)?.[1]
console.log('session:', cookie?.slice(0, 20) + '...')
console.log('csrf:', csrf)

// 2. POST advanced search with date range
const form = new URLSearchParams({
  '_csrf': csrf,
  'searchType': 'Application',
  'searchCriteria.reference': '',
  'searchCriteria.description': '',
  'searchCriteria.caseStatus': '',
  'searchCriteria.caseDecision': '',
  'caseAddressType': 'Application',
  'searchCriteria.address': '',
  'date(applicationValidatedStart)': '01/01/2024',
  'date(applicationValidatedEnd)': '31/01/2024',
})

const search = await fetch(`${BASE}/advancedSearchResults.do?action=firstPage`, {
  method: 'POST',
  headers: {
    'User-Agent': UA,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': `JSESSIONID=${cookie}`,
    'Referer': `${BASE}/search.do?action=advanced&searchType=Application`,
  },
  body: form.toString(),
  redirect: 'follow',
})

const html = await search.text()
console.log('results status:', search.status)

// 3. Parse results
const results = [...html.matchAll(/<li class="searchresult">([\s\S]*?)<\/li>/g)]
console.log(`\nFound ${results.length} results on page`)

if (results.length > 0) {
  const raw = results[0][1]
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('\nFirst result (text):\n', text)
  console.log('\nFirst result (raw HTML):\n', raw.trim())
} else {
  // Show snippet to debug
  const idx = html.indexOf('<ul id="searchresults"')
  console.log('\nSnippet:\n', html.slice(idx, idx + 800))
}
