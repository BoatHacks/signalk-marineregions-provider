'use strict'

const path = require('node:path')
const { getCapabilities, getAllFeatures } = require('./wfs')
const { openDb, upsertLayer, replaceLayerFeatures } = require('./db')

// Scope: Maritime Boundaries Geodatabase family only. We match by title
// keyword rather than hardcoded typeName, since exact WFS type names
// weren't independently verified against a live GetCapabilities response
// at the time this was written -- run with no flags first (dry run) and
// check the matched layers before doing a real import.
const LAYER_MATCHERS = [
  { layerKey: 'eez', titleIncludes: ['exclusive economic zone'] },
  { layerKey: 'eez_12nm', titleIncludes: ['territorial sea', '12 nautical mile', '12nm'] },
  { layerKey: 'eez_24nm', titleIncludes: ['contiguous zone', '24 nautical mile', '24nm'] },
  { layerKey: 'eez_internal_waters', titleIncludes: ['internal water'] },
  { layerKey: 'eez_archipelagic_waters', titleIncludes: ['archipelagic water'] },
  { layerKey: 'high_seas', titleIncludes: ['high sea'] },
  { layerKey: 'ecs', titleIncludes: ['extended continental shelf', 'continental shelves'] }
]

function matchLayers(featureTypes) {
  const matches = []
  for (const matcher of LAYER_MATCHERS) {
    const found = featureTypes.filter((ft) => {
      const haystack = `${ft.title || ''} ${ft.abstract || ''}`.toLowerCase()
      return matcher.titleIncludes.some((needle) => haystack.includes(needle))
    })
    for (const ft of found) {
      matches.push({ layerKey: matcher.layerKey, ...ft })
    }
  }
  return matches
}

async function run({ confirm, dataDir }) {
  console.log(`Fetching GetCapabilities from marineregions.org WFS...`)
  const featureTypes = await getCapabilities()
  console.log(`Service exposes ${featureTypes.length} feature types total.`)

  const matches = matchLayers(featureTypes)

  console.log(`\nMatched ${matches.length} layer(s) for the Maritime Boundaries Geodatabase family:`)
  for (const m of matches) {
    console.log(`  [${m.layerKey}] typeName=${m.typeName}  title="${m.title}"`)
  }

  if (matches.length === 0) {
    console.log('\nNo matches found -- the title-matching keywords in LAYER_MATCHERS probably need adjusting to whatever GetCapabilities actually returned. Nothing was written.')
    return
  }

  if (!confirm) {
    console.log('\nDry run only (no data fetched or written). Review the matches above, then re-run with --confirm to actually import.')
    return
  }

  const db = openDb(dataDir)

  for (const m of matches) {
    console.log(`\nFetching all features for ${m.layerKey} (${m.typeName})...`)
    const features = await getAllFeatures(m.typeName, {
      onPage: (pageCount, total) => console.log(`  +${pageCount} features (${total} so far)`)
    })
    console.log(`  Total: ${features.length} features. Writing to SQLite...`)
    replaceLayerFeatures(db, m.layerKey, features)
    upsertLayer(db, {
      layerKey: m.layerKey,
      typeName: m.typeName,
      title: m.title,
      abstract: m.abstract,
      citation: null, // TODO: populate from marineregions.org/sources.php -- not reliably present in capabilities abstracts
      license: 'CC-BY 4.0', // confirmed for the Maritime Boundaries Geodatabase family specifically
      featureCount: features.length
    })
  }

  console.log('\nDone.')
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const confirm = args.includes('--confirm')
  const dataDir = path.join(__dirname, '..', 'data')
  run({ confirm, dataDir }).catch((err) => {
    console.error('Ingest failed:', err)
    process.exit(1)
  })
}

module.exports = { run, matchLayers }
