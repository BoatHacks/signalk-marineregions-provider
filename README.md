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

- [ ] `lib/ingest.js` matches layers by title keyword against a live
      `GetCapabilities` response rather than hardcoded `typeName`s --
      run `npm run ingest` (no `--confirm`) first and check the printed
      matches look right before doing a real import.
- [ ] `index.js`'s resource-provider registration call
      (`app.resourcesApi.register(...)`) needs verifying against the
      actual `@signalk/server-api` version in use -- the shape of this
      API has changed across server versions.
- [ ] Per-layer `citation` text isn't populated yet (see TODO in
      `lib/ingest.js`) -- currently only `license` is set. Pull the exact
      citation strings from https://marineregions.org/sources.php per
      layer, since these are the required attribution text, not just the
      license name.

## Usage

```bash
npm install

# Dry run -- discovers layers and prints matches, writes nothing
npm run ingest

# Real import -- fetches all features and loads them into SQLite
npm run ingest -- --confirm
```

Data is stored in `data/marineregions.sqlite` (or the SignalK plugin data
directory when run as part of the plugin, via `app.getDataDirPath()`).

## Resource API

Once running as a SignalK plugin, resources are exposed at
`/signalk/v1/api/resources/marineregions` (configurable). Supported query
params on list:

- `layer` -- filter to one layer key (`eez`, `eez_12nm`, `eez_24nm`,
  `eez_internal_waters`, `eez_archipelagic_waters`, `high_seas`, `ecs`)
- `bbox` -- `west,south,east,north`

This is reference data -- `setResource`/`deleteResource` are intentionally
unimplemented.
