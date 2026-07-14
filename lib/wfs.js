'use strict'

const { XMLParser } = require('fast-xml-parser')

const WFS_BASE = 'https://geo.vliz.be/geoserver/MarineRegions/wfs'
const PAGE_SIZE = 1000

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true // Fold away wfs:/ows: prefixes so we can address elements uniformly
})

/**
 * Fetch and parse GetCapabilities, returning a flat list of
 * { typeName, title, abstract, keywords } for every feature type
 * the service exposes. We deliberately don't hardcode typeNames
 * anywhere in this codebase -- layer selection happens by matching
 * against title/abstract text, since exact typeName strings can
 * shift between Maritime Boundaries Geodatabase versions.
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
 * Fetch every feature for a given typeName as GeoJSON, paginating
 * via startIndex/count so we don't hit server-side response limits
 * on larger layers.
 */
async function getAllFeatures(typeName, { onPage } = {}) {
  const allFeatures = []
  let startIndex = 0

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
    allFeatures.push(...features)
    if (onPage) onPage(features.length, allFeatures.length)

    if (features.length < PAGE_SIZE) break
    startIndex += PAGE_SIZE
  }

  return allFeatures
}

module.exports = { getCapabilities, getAllFeatures, WFS_BASE }
