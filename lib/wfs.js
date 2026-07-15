'use strict'

const { XMLParser } = require('fast-xml-parser')

const WFS_BASE = 'https://geo.vliz.be/geoserver/MarineRegions/wfs'
// Deliberately small: some of these layers have well under 100 total
// features (e.g. eez has ~280), so a page size anywhere near that count
// means the *entire* dataset comes back in a single HTTP response and
// gets parsed via response.json() in one shot regardless of pagination
// logic. Individual feature geometries in this dataset (a country's EEZ
// polygon, including outlying territories) can be very large on their
// own, so keeping page size small bounds peak memory per request even
// when the total feature count is small. Override via
// MARINEREGIONS_PAGE_SIZE if needed (e.g. smaller still on very
// constrained devices, or larger for faster fetches on a beefier machine).
const PAGE_SIZE = Number(process.env.MARINEREGIONS_PAGE_SIZE) || 25

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true // Fold away wfs:/ows: prefixes so we can address elements uniformly
})

/**
 * Fetch and parse GetCapabilities, returning a flat list of
 * { typeName, title, abstract, keywords } for every feature type
 * the service exposes.
 */
async function getCapabilities() {
  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetCapabilities`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`GetCapabilities failed: ${res.status} ${res.statusText}`)
  }
  const xml = await res.text()
  const parsed = xmlParser.parse(xml)

  const capabilities = parsed.WFS_Capabilities || parsed.Capabilities
  if (!capabilities) {
    throw new Error('Unexpected GetCapabilities response shape -- check parser against actual output')
  }

  const rawTypes = capabilities.FeatureTypeList?.FeatureType
  const featureTypes = Array.isArray(rawTypes) ? rawTypes : [rawTypes]

  return featureTypes.filter(Boolean).map((ft) => ({
    typeName: typeof ft.Name === 'string' ? ft.Name : ft.Name?.['#text'],
    title: ft.Title,
    abstract: ft.Abstract,
    keywords: flattenKeywords(ft.Keywords)
  }))
}

function flattenKeywords(keywordsNode) {
  if (!keywordsNode) return []
  const list = Array.isArray(keywordsNode) ? keywordsNode : [keywordsNode]
  return list.flatMap((k) => {
    const kw = k?.Keyword
    if (!kw) return []
    return Array.isArray(kw) ? kw : [kw]
  })
}

/**
 * Fetch every feature for a given typeName as GeoJSON, paginating via
 * startIndex/count. Deliberately does NOT accumulate features across
 * pages in memory -- each page is handed to onPage() and then dropped,
 * so the caller (fetch-raw.js) can stream it straight to disk instead of
 * holding an entire world-scale dataset in memory twice over (once as
 * parsed objects, once as a re-serialized JSON string).
 *
 * Returns the total feature count.
 */
async function fetchFeatures(typeName, { onPage } = {}) {
  let startIndex = 0
  let total = 0

  while (true) {
    const url = new URL(WFS_BASE)
    url.searchParams.set('service', 'WFS')
    url.searchParams.set('version', '2.0.0')
    url.searchParams.set('request', 'GetFeature')
    url.searchParams.set('typeNames', typeName)
    url.searchParams.set('outputFormat', 'application/json')
    url.searchParams.set('srsName', 'EPSG:4326')
    url.searchParams.set('count', String(PAGE_SIZE))
    url.searchParams.set('startIndex', String(startIndex))

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`GetFeature failed for ${typeName}: ${res.status} ${res.statusText}`)
    }
    const geojson = await res.json()
    const features = geojson.features || []

    if (onPage) await onPage(features)
    total += features.length

    if (features.length < PAGE_SIZE) break
    startIndex += PAGE_SIZE
  }

  return total
}

module.exports = { getCapabilities, fetchFeatures, WFS_BASE }
