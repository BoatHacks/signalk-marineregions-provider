'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { getCapabilities, getAllFeatures, WFS_BASE } = require('./wfs')
const { matchLayers } = require('./layers')

const SOURCES_DIR = path.join(__dirname, '..', 'sources')

async function run() {
  fs.mkdirSync(SOURCES_DIR, { recursive: true })

  console.log(`Fetching GetCapabilities from ${WFS_BASE} ...`)
  const featureTypes = await getCapabilities()
  console.log(`Service exposes ${featureTypes.length} feature types total.`)

  const matches = matchLayers(featureTypes)
  console.log(`\nMatched ${matches.length} layer(s):`)
  for (const m of matches) {
    console.log(`  [${m.layerKey}] typeName=${m.typeName}  title="${m.title}"`)
  }

  if (matches.length === 0) {
    throw new Error('No layers matched -- check LAYER_MATCHERS in lib/layers.js against the titles above')
  }

  const manifest = {
    fetchedAt: new Date().toISOString(),
    wfsBase: WFS_BASE,
    layers: []
  }

  for (const m of matches) {
    console.log(`\nFetching all features for ${m.layerKey} (${m.typeName})...`)
    const features = await getAllFeatures(m.typeName, {
      onPage: (pageCount, total) => console.log(`  +${pageCount} features (${total} so far)`)
    })
    console.log(`  Total: ${features.length} features.`)

    const outPath = path.join(SOURCES_DIR, `${m.layerKey}.geojson`)
    const featureCollection = { type: 'FeatureCollection', features }
    fs.writeFileSync(outPath, JSON.stringify(featureCollection))
    console.log(`  Wrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`)

    manifest.layers.push({
      layerKey: m.layerKey,
      typeName: m.typeName,
      title: m.title,
      abstract: m.abstract,
      license: 'CC-BY 4.0', // confirmed for the Maritime Boundaries Geodatabase family
      citation: null, // TODO: fill in from https://marineregions.org/sources.php per layer
      featureCount: features.length,
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
