'use strict'

// Scope: Maritime Boundaries Geodatabase family only. We match by title
// keyword rather than hardcoded typeName, since exact WFS type names
// weren't independently verified against a live GetCapabilities response
// at the time this was written -- always check the printed matches
// before trusting an import.
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

module.exports = { LAYER_MATCHERS, matchLayers }
