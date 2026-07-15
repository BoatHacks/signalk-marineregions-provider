'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { openDb, upsertLayer, replaceLayerFeatures, removeLayer, listLayerKeys } = require('./db')
const { allLayerKeys } = require('./layers')

const SOURCES_DIR = path.join(__dirname, '..', 'sources')

// Builds the runtime SQLite database from the locally fetched
// sources/*.geojson files -- no network access needed. To (re)fetch the
// source data itself from marineregions.org, run lib/fetch-raw.js instead
// (that's the one piece that talks to the live WFS).
async function run({ dataDir, layerKeys } = {}) {
  const manifestPath = path.join(SOURCES_DIR, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `${manifestPath} not found -- run "node lib/fetch-raw.js" first to populate sources/ from the live WFS`
    )
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const wantedKeys = layerKeys && layerKeys.length > 0 ? layerKeys : allLayerKeys()

  const db = openDb(dataDir)

  const layersToLoad = manifest.layers.filter((l) => wantedKeys.includes(l.layerKey))
  const missing = wantedKeys.filter((k) => !manifest.layers.some((l) => l.layerKey === k))
  if (missing.length > 0) {
    console.log(
      `Note: ${missing.join(', ')} requested but not present in sources/manifest.json -- run fetch-raw.js for those first. Skipping for now.`
    )
  }

  for (const layer of layersToLoad) {
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

  // Remove anything in the db that's no longer wanted (e.g. deselected in
  // the admin UI since the last build) so stale layers don't keep getting
  // served just because they were loaded once before.
  const existingKeys = listLayerKeys(db)
  for (const key of existingKeys) {
    if (!wantedKeys.includes(key)) {
      removeLayer(db, key)
      console.log(`Removed ${key} from SQLite (no longer selected)`)
    }
  }

  console.log('\nDone.')
}

if (require.main === module) {
  const arg = process.argv.find((a) => a.startsWith('--layers='))
  const fromArg = arg ? arg.slice('--layers='.length) : null
  const fromEnv = process.env.MARINEREGIONS_LAYERS || null
  const raw = fromArg || fromEnv
  const layerKeys = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : null

  const dataDir = path.join(__dirname, '..', 'data')
  run({ dataDir, layerKeys }).catch((err) => {
    console.error('Ingest failed:', err)
    process.exit(1)
  })
}

module.exports = { run }
