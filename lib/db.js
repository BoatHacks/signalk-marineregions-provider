'use strict'

const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')
const fs = require('node:fs')

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(path.join(dataDir, 'marineregions.sqlite'))

  db.exec(`
    CREATE TABLE IF NOT EXISTS layers (
      layer_key     TEXT PRIMARY KEY,
      type_name     TEXT NOT NULL,
      title         TEXT,
      abstract      TEXT,
      citation      TEXT,
      license       TEXT,
      feature_count INTEGER,
      last_synced   TEXT
    );

    CREATE TABLE IF NOT EXISTS features (
      id           TEXT PRIMARY KEY,
      layer_key    TEXT NOT NULL,
      mrgid        INTEGER,
      name         TEXT,
      geometry     TEXT NOT NULL,
      properties   TEXT NOT NULL,
      bbox_minx    REAL,
      bbox_miny    REAL,
      bbox_maxx    REAL,
      bbox_maxy    REAL
    );

    CREATE INDEX IF NOT EXISTS idx_features_layer ON features(layer_key);
    CREATE INDEX IF NOT EXISTS idx_features_bbox
      ON features(bbox_minx, bbox_maxx, bbox_miny, bbox_maxy);
  `)

  return db
}

function upsertLayer(db, layer) {
  const stmt = db.prepare(`
    INSERT INTO layers (layer_key, type_name, title, abstract, citation, license, feature_count, last_synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(layer_key) DO UPDATE SET
      type_name = excluded.type_name,
      title = excluded.title,
      abstract = excluded.abstract,
      citation = excluded.citation,
      license = excluded.license,
      feature_count = excluded.feature_count,
      last_synced = excluded.last_synced
  `)
  stmt.run(
    layer.layerKey,
    layer.typeName,
    layer.title ?? null,
    layer.abstract ?? null,
    layer.citation ?? null,
    layer.license ?? null,
    layer.featureCount ?? null,
    new Date().toISOString()
  )
}

function replaceLayerFeatures(db, layerKey, features) {
  const deleteStmt = db.prepare('DELETE FROM features WHERE layer_key = ?')
  const insertStmt = db.prepare(`
    INSERT INTO features (id, layer_key, mrgid, name, geometry, properties, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  db.exec('BEGIN')
  try {
    deleteStmt.run(layerKey)
    for (const f of features) {
      const bbox = computeBbox(f.geometry)
      const mrgid = f.properties?.mrgid ?? null
      const name = f.properties?.geoname ?? f.properties?.name ?? null
      const id = `${layerKey}:${mrgid ?? f.id ?? cryptoRandomId()}`
      insertStmt.run(
        id,
        layerKey,
        mrgid,
        name,
        JSON.stringify(f.geometry),
        JSON.stringify(f.properties ?? {}),
        bbox.minx,
        bbox.miny,
        bbox.maxx,
        bbox.maxy
      )
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function computeBbox(geometry) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords
      if (x < minx) minx = x
      if (y < miny) miny = y
      if (x > maxx) maxx = x
      if (y > maxy) maxy = y
    } else {
      coords.forEach(visit)
    }
  }
  if (geometry?.coordinates) visit(geometry.coordinates)
  return { minx, miny, maxx, maxy }
}

function removeLayer(db, layerKey) {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM features WHERE layer_key = ?').run(layerKey)
    db.prepare('DELETE FROM layers WHERE layer_key = ?').run(layerKey)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function listLayerKeys(db) {
  return db.prepare('SELECT layer_key FROM layers').all().map((row) => row.layer_key)
}

function cryptoRandomId() {
  return require('node:crypto').randomUUID()
}

module.exports = { openDb, upsertLayer, replaceLayerFeatures, removeLayer, listLayerKeys }
