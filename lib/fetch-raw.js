'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { getCapabilities, fetchFeatures, WFS_BASE } = require('./wfs')
const { matchLayers } = require('./layers')

const SOURCES_DIR = path.join(__dirname, '..', 'sources')

/**
 * Writes a GeoJSON FeatureCollection to disk incrementally, one feature
 * at a time, so peak memory is roughly "one page of features" rather than
 * "the entire dataset, twice" (once parsed, once re-stringified).
 */
function createFeatureCollectionWriter(filePath) {
  const stream = fs.createWriteStream(filePath)
  let first = true
  stream.write('{"type":"FeatureCollection","features":[')

  return {
    writeFeatures: (features) =>
      new Promise((resolve, reject) => {
        for (const feature of features) {
          const chunk = (first ? '' : ',') + JSON.stringify(feature)
          first = false
          stream.write(chunk)
        }
        // Respect backpressure before returning, so we don't outrun the
        // filesystem on a fast connection.
        if (stream.writableNeedDrain) {
          stream.once('drain', resolve)
        } else {
          resolve()
        }
        stream.once('error', reject)
      }),
    close: () =>
      new Promise((resolve, reject) => {
        stream.write(']}')
        stream.end()
        stream.once('finish', resolve)
        stream.once('error', reject)
      })
  }
}

async function run() {
  fs.mkdirSync(SOURCES_DIR, { recursive: true })

  console.log(`Fetching GetCapabilities from ${WFS_BASE} ...`)
  const featureTypes = await getCapabilities()
  console.log(`Service exposes ${featureTypes.length} feature types total.`)

  const matches = matchLayers(featureTypes)

  console.log(`\nMatch results:`)
  for (const m of matches) {
    if (m.warning) {
      console.log(`  [${m.layerKey}] WARNING: ${m.warning}`)
    } else {
      console.log(`  [${m.layerKey}] typeName=${m.typeName}  title="${m.title}"`)
    }
  }

  const problems = matches.filter((m) => m.warning)
  if (problems.length > 0) {
    throw new Error(
      `${problems.length} layer(s) did not resolve to exactly one typeName -- fix LAYER_MATCHERS in lib/layers.js before proceeding. See warnings above.`
    )
  }

  const manifest = {
    fetchedAt: new Date().toISOString(),
    wfsBase: WFS_BASE,
    layers: []
  }

  for (const m of matches) {
    console.log(`\nFetching all features for ${m.layerKey} (${m.typeName})...`)
    const outPath = path.join(SOURCES_DIR, `${m.layerKey}.geojson`)
    const writer = createFeatureCollectionWriter(outPath)

    let total = 0
    try {
      total = await fetchFeatures(m.typeName, {
        onPage: async (features) => {
          await writer.writeFeatures(features)
          console.log(`  +${features.length} features so far`)
        }
      })
    } finally {
      await writer.close()
    }

    const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2)
    console.log(`  Wrote ${outPath} (${total} features, ${sizeMb} MB)`)

    manifest.layers.push({
      layerKey: m.layerKey,
      typeName: m.typeName,
      title: m.title,
      abstract: m.abstract,
      license: 'CC-BY 4.0', // confirmed for the Maritime Boundaries Geodatabase family
      citation: null, // TODO: fill in from https://marineregions.org/sources.php per layer
      featureCount: total,
      file: `${m.layerKey}.geojson`
    })
  }

  fs.writeFileSync(path.join(SOURCES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nWrote sources/manifest.json. Done.`)
}

if (require.main === module) {
  run().catch((err) => {
    console.error('fetch-raw failed:', err)
    process.exit(1)
  })
}

module.exports = { run }
