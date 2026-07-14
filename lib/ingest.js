'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { openDb, upsertLayer, replaceLayerFeatures } = require('./db')

const SOURCES_DIR = path.join(__dirname, '..', 'sources')

// Builds the runtime SQLite database from the committed sources/*.geojson
// files -- no network access needed. To refresh the source data itself
// from marineregions.org, run lib/fetch-raw.js instead (that's the one
// piece that talks to the live WFS).
async function run({ dataDir }) {
  const manifestPath = path.join(SOURCES_DIR, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `${manifestPath} not found -- run "node lib/fetch-raw.js" first to populate sources/ from the live WFS`
    )
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  const db = openDb(dataDir)

  for (const layer of manifest.layers) {
    const filePath = path.join(SOURCES_DIR, layer.file)
    console.log(`Loading ${layer.layerKey} from ${filePath} ...`)
    const featureCollection = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const features = featureCollection.features || []

    replaceLayerFeatures(db, layer.layerKey, features)
    upsertLayer(db, {
      layerKey: layer.layerKey,
      typeName: layer.typeName,
      title: layer.title,
      abstract: layer.abstract,
      citation: layer.citation,
      license: layer.license,
      featureCount: features.length
    })
    console.log(`  Loaded ${features.length} features into SQLite.`)
  }

  console.log('\nDone.')
}

if (require.main === module) {
  const dataDir = path.join(__dirname, '..', 'data')
  run({ dataDir }).catch((err) => {
    console.error('Ingest failed:', err)
    process.exit(1)
  })
}

module.exports = { run }
