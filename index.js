'use strict'

const path = require('node:path')
const { openDb } = require('./lib/db')

module.exports = function (app) {
  const plugin = {}

  plugin.id = 'signalk-marineregions-provider'
  plugin.name = 'Marine Regions provider'
  plugin.description =
    'Serves the Maritime Boundaries Geodatabase (EEZ, territorial seas, contiguous zones, internal waters, archipelagic waters, high seas, extended continental shelves) from marineregions.org as a SignalK resource provider'

  plugin.schema = {
    type: 'object',
    properties: {
      resourceType: {
        type: 'string',
        title: 'Resource type name to register under',
        default: 'marineregions',
        description:
          'Exposed at /signalk/v1/api/resources/<this>. Data is read-only reference data -- run the ingest script separately (npm run ingest -- --confirm) to populate/update it.'
      }
    }
  }

  let db = null

  plugin.start = function (options) {
    const dataDir = path.join(app.getDataDirPath ? app.getDataDirPath() : path.join(__dirname, 'data'))
    db = openDb(dataDir)

    const resourceType = options.resourceType || 'marineregions'

    // NOTE: verify this against the @signalk/server-api version actually
    // installed -- the resources-provider registration shape has moved
    // around across server versions and this hasn't been checked against
    // a live server yet. Likely candidates are app.resourcesApi.register(...)
    // or app.registerResourceProvider(...); confirm before relying on this.
    if (app.resourcesApi && typeof app.resourcesApi.register === 'function') {
      app.resourcesApi.register(plugin.id, {
        types: [resourceType],
        methods: {
          listResources: (type, query) => listResources(db, query),
          getResource: (type, id) => getResource(db, id),
          setResource: () => {
            throw new Error('marineregions resources are read-only reference data')
          },
          deleteResource: () => {
            throw new Error('marineregions resources are read-only reference data')
          }
        }
      })
      app.debug(`Registered marineregions resource provider under type "${resourceType}"`)
    } else {
      app.error(
        'app.resourcesApi.register was not found -- this plugin needs its resource-provider registration call updated to match the installed SignalK server-api version.'
      )
    }
  }

  plugin.stop = function () {
    if (db) {
      db.close()
      db = null
    }
  }

  return plugin
}

function listResources(db, query = {}) {
  const clauses = []
  const params = []

  if (query.layer) {
    clauses.push('layer_key = ?')
    params.push(query.layer)
  }

  // bbox as "west,south,east,north" per SignalK resources API convention
  if (query.bbox) {
    const [west, south, east, north] = String(query.bbox).split(',').map(Number)
    clauses.push('bbox_minx <= ? AND bbox_maxx >= ? AND bbox_miny <= ? AND bbox_maxy >= ?')
    params.push(east, west, north, south)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM features ${where}`).all(...params)

  return Object.fromEntries(rows.map((row) => [row.id, rowToFeature(row)]))
}

function getResource(db, id) {
  const row = db.prepare('SELECT * FROM features WHERE id = ?').get(id)
  if (!row) return null
  return rowToFeature(row)
}

function rowToFeature(row) {
  return {
    type: 'Feature',
    geometry: JSON.parse(row.geometry),
    properties: {
      ...JSON.parse(row.properties),
      layer: row.layer_key,
      mrgid: row.mrgid,
      name: row.name
    }
  }
}
