'use strict'

// Scope: Maritime Boundaries Geodatabase family only.
//
// We match by *title* keyword rather than hardcoded typeName, since exact
// WFS type names weren't independently verified ahead of time. Title-only
// matching matters: abstracts cross-reference other datasets by name
// (e.g. the Extended Continental Shelves abstract mentions the EEZ), so
// matching against abstract text produces massive false positives.
//
// titleIncludesAll: every substring must appear in the title (AND)
// titleExcludesAny: if any of these appear in the title, it's excluded
// label: human-readable name, used in the admin UI config form and CLI output
//
// Each matcher is expected to resolve to exactly one typeName -- fetch-raw.js
// warns loudly if a matcher resolves to zero or more than one.
const LAYER_MATCHERS = [
  {
    layerKey: 'eez',
    label: 'Exclusive Economic Zones (200NM)',
    titleIncludesAll: ['exclusive economic zone'],
    titleExcludesAny: ['intersect', 'union']
  },
  {
    layerKey: 'eez_12nm',
    label: 'Territorial Seas (12NM)',
    titleIncludesAll: ['territorial sea']
  },
  {
    layerKey: 'eez_24nm',
    label: 'Contiguous Zones (24NM)',
    titleIncludesAll: ['contiguous zone']
  },
  {
    layerKey: 'eez_internal_waters',
    label: 'Internal Waters',
    titleIncludesAll: ['internal water']
  },
  {
    layerKey: 'eez_archipelagic_waters',
    label: 'Archipelagic Waters',
    titleIncludesAll: ['archipelagic water']
  },
  {
    layerKey: 'high_seas',
    label: 'High Seas',
    titleIncludesAll: ['high sea']
  },
  {
    layerKey: 'ecs',
    label: 'Extended Continental Shelves',
    titleIncludesAll: ['continental shelves'],
    titleExcludesAny: ['boundaries']
  },
  {
    layerKey: 'ecs_boundaries',
    label: 'Extended Continental Shelves (boundaries)',
    titleIncludesAll: ['continental shelves', 'boundaries']
  }
]

function matchLayers(featureTypes) {
  const results = []
  for (const matcher of LAYER_MATCHERS) {
    const candidates = featureTypes.filter((ft) => {
      const title = (ft.title || '').toLowerCase()
      const includesAll = matcher.titleIncludesAll.every((needle) => title.includes(needle))
      const excludesAny = (matcher.titleExcludesAny || []).some((needle) => title.includes(needle))
      return includesAll && !excludesAny
    })

    if (candidates.length === 0) {
      results.push({ layerKey: matcher.layerKey, label: matcher.label, warning: 'no typeName matched', typeName: null })
    } else if (candidates.length > 1) {
      results.push({
        layerKey: matcher.layerKey,
        label: matcher.label,
        warning: `${candidates.length} typeNames matched, expected exactly 1: ${candidates.map((c) => c.typeName).join(', ')}`,
        typeName: null
      })
    } else {
      results.push({ layerKey: matcher.layerKey, label: matcher.label, ...candidates[0] })
    }
  }
  return results
}

function allLayerKeys() {
  return LAYER_MATCHERS.map((m) => m.layerKey)
}

module.exports = { LAYER_MATCHERS, matchLayers, allLayerKeys }
