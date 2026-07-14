# signalk-marineregions-provider

**Marine Regions provider** -- a SignalK resource provider serving the
[Maritime Boundaries Geodatabase](https://marineregions.org/sources.php)
from [marineregions.org](https://marineregions.org) (Flanders Marine
Institute / VLIZ): EEZ, territorial seas (12NM), contiguous zones (24NM),
internal waters, archipelagic waters, high seas, and extended continental
shelves.

Data is bulk-downloaded once via the Marine Regions WFS and stored locally
in SQLite -- read-only, offline-safe, no live dependency on their service
at runtime.

## License / attribution

The Maritime Boundaries Geodatabase family is licensed
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) by VLIZ.
Attribution is a license requirement, not optional -- every resource
returned by this plugin carries its source layer, and the citation should
be surfaced wherever the data is displayed. See
[marineregions.org/disclaimer.php](https://marineregions.org/disclaimer.php).

## Status / open items

This was scaffolded without a live connection to `geo.vliz.be` available
in the dev environment it was built in, so a few things are unverified
and **must be checked before relying on this**:

- [ ] `lib/layers.js` matches layers by title keyword against a live
      `GetCapabilities` response rather than hardcoded `typeName`s --
      run `scripts/fetch-and-commit-data.sh` and check the printed
      matches look right before letting it commit.
- [ ] `index.js`'s resource-provider registration call
      (`app.resourcesApi.register(...)`) needs verifying against the
      actual `@signalk/server-api` version in use -- the shape of this
      API has changed across server versions.
- [ ] Per-layer `citation` text isn't populated yet (see TODO in
      `lib/fetch-raw.js`) -- currently only `license` is set. Pull the
      exact citation strings from https://marineregions.org/sources.php
      per layer, since these are the required attribution text, not just
      the license name.

## Usage

There are two separate steps, deliberately split so only one of them ever
needs live internet access to marineregions.org:

**1. Fetch raw data from marineregions.org and commit it** (occasional --
only needed to pull in a new dataset version):

```bash
scripts/fetch-and-commit-data.sh          # fetch + commit locally
scripts/fetch-and-commit-data.sh --push   # fetch + commit + push to origin
```

This runs `lib/fetch-raw.js`, which calls `GetCapabilities`, matches
layers by title, downloads each one as GeoJSON, and writes it to
`sources/<layer_key>.geojson` plus `sources/manifest.json` (per-layer
typeName/title/license/feature count). Those files get committed to the
repo as the versioned source-of-truth snapshot.

**2. Build the local SQLite database from the committed sources** (runs
offline, no network needed -- this is what the plugin does on startup):

```bash
npm install
npm run ingest
```

This reads `sources/*.geojson` + `sources/manifest.json` and loads them
into `data/marineregions.sqlite` (or the SignalK plugin data directory
when run as part of the plugin, via `app.getDataDirPath()`). `data/` and
`*.sqlite` are gitignored -- only the raw sources are versioned.

## Resource API

Once running as a SignalK plugin, resources are exposed at
`/signalk/v1/api/resources/marineregions` (configurable). Supported query
params on list:

- `layer` -- filter to one layer key (`eez`, `eez_12nm`, `eez_24nm`,
  `eez_internal_waters`, `eez_archipelagic_waters`, `high_seas`, `ecs`)
- `bbox` -- `west,south,east,north`

This is reference data -- `setResource`/`deleteResource` are intentionally
unimplemented.
