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
  let streamError = null
  // Registered once, not per-page -- attaching a fresh 'error' listener on
  // every writeFeatures() call (once per page) triggered Node's
  // MaxListenersExceededWarning on any layer needing more than ~10 pages.
  stream.on('error', (err) => {
    streamError = err
  })
  stream.write('{"type":"FeatureCollection","features":[')

  return {
    writeFeatures: (features) =>
      new Promise((resolve, reject) => {
        if (streamError) return reject(streamError)
        for (const feature of features) {
          const chunk = (first ? '' : ',') + JSON.stringify(feature)
          first = false
          stream.write(chunk)
        }
        if (streamError) return reject(streamError)
        // Respect backpressure before returning, so we don't outrun the
        // filesystem on a fast connection.
        if (stream.writableNeedDrain) {
          stream.once('drain', resolve)
        } else {
          resolve()
        }
      }),
    close: () =>
      new Promise((resolve, reject) => {
        if (streamError) return reject(streamError)
        stream.write(']}')
        stream.end()
        stream.once('finish', resolve)
      })
  }
}

function validateFeatureCollection(filePath, expectedCount) {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    throw new Error(
      `${filePath} is not valid JSON -- likely a truncated write from a killed/crashed process (e.g. OOM). Delete it and re-run rather than committing it. (${err.message})`
    )
  }
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error(`${filePath} does not look like a valid GeoJSON FeatureCollection`)
  }
  if (parsed.features.length !== expectedCount) {
    throw new Error(
      `${filePath} has ${parsed.features.length} features on disk but ${expectedCount} were fetched -- mismatch suggests a corrupted write`
    )
  }
  if (parsed.features.length === 0) {
    throw new Error(`${filePath} has zero features -- refusing to treat this as a successful fetch`)
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

    // Guard against exactly the failure mode that got us here once already:
    // a SIGKILL (OOM) mid-write can't be caught, so writer.close() never
    // runs and the file is left as a truncated, invalid JSON stub. Verify
    // before it's ever handed to the shell script for staging/committing.
    validateFeatureCollection(outPath, total)

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
