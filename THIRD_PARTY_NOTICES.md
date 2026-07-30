# Third-Party Notices

## Lensfun camera database

`src/data/lensfunCameras.json` is an adapted subset of the Lensfun database. It contains camera maker/model names, localized aliases, and crop factors transformed from Lensfun's XML camera entries.

- Source: <https://github.com/lensfun/lensfun/tree/master/data/db> (the exact source revision is recorded in the generated JSON)
- Upstream project: <https://github.com/lensfun/lensfun>
- Changes: lens and calibration records were omitted; camera records were reduced to maker/model aliases and crop factor, sorted, and serialized as JSON for local browser lookup.
- License: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)
- License text: [`third_party/lensfun/COPYING.CC_BY-SA_3.0`](third_party/lensfun/COPYING.CC_BY-SA_3.0)

The adapted Lensfun-derived database remains available under CC BY-SA 3.0. This notice does not change the MIT license that applies to IFEX source code outside that database.

## IPTC Digital Source Type vocabulary

`src/data/iptcDigitalSourceTypes.json` is an attributed transform of the IPTC Digital Source Type NewsCodes vocabulary.

- Creator and upstream project: IPTC, <https://iptc.org/>
- Source: <https://cv.iptc.org/newscodes/digitalsourcetype/?lang=en-GB&format=json>
- Source revision: `2024-10-23T12:00:00+00:00`
- Source SHA-256: `1caaa5bb729d5b40fdfef599bc650bf1288e7cca4fe52b9bb4d65701da4fb1d6`
- Changes: concepts were reduced to stable English identifiers, URIs, labels, definitions, modification dates, and retirement dates; output was sorted and serialized as JSON for local C2PA interpretation.
- License: Creative Commons Attribution 4.0 International (CC BY 4.0), <https://creativecommons.org/licenses/by/4.0/>
- Attribution copy: [`third_party/iptc/NOTICE.md`](third_party/iptc/NOTICE.md)

No upstream endorsement is implied. The transformed vocabulary remains available under CC BY 4.0; IFEX source code around it remains MIT-licensed.

## Runtime analysis libraries

The following direct runtime libraries are bundled into the browser application:

| Package | Version | Purpose | License | Upstream |
| --- | ---: | --- | --- | --- |
| `@contentauth/c2pa-web` | 0.13.1 | Local C2PA manifest validation | MIT | <https://github.com/contentauth/c2pa-js> |
| `exifr` | 7.1.3 | Local EXIF/IPTC/XMP/ICC parsing | MIT | <https://github.com/MikeKovarik/exifr> |
| `file-type` | 21.3.4 | Bounded, allowlisted file-signature cross-check | MIT | <https://github.com/sindresorhus/file-type> |

These packages and their production dependency graph are covered by the generated [`third_party/runtime/DEPENDENCY-LICENSES.txt`](third_party/runtime/DEPENDENCY-LICENSES.txt) manifest and the deployed `/third-party/dependency-licenses.txt` copy. It preserves top-level license and notice texts for the non-optional production packages pinned in `package-lock.json`.

When a published package tarball omits a top-level license file, generation fails unless an exact package-version fallback is recorded in [`third_party/runtime/license-fallbacks.json`](third_party/runtime/license-fallbacks.json). Those tracked fallback texts preserve the package's declared license and author attribution, record their provenance, and are copied into the generated deployment bundle; they are not inferred silently from an SPDX identifier.

Regenerate it with `npm run generate:licenses` after dependency changes. CI and `npm run verify` run `npm run check:licenses` and reject stale copies.

## Development-only EXIF test oracle

`ExifReader` 4.41.3 is used only by tests as an independent metadata oracle. It is not imported by production source or included in the production browser bundle.

- Upstream: <https://github.com/mattiasw/ExifReader>
- License: Mozilla Public License 2.0 (MPL-2.0), <https://www.mozilla.org/MPL/2.0/>
- Package license text: `node_modules/exifreader/LICENSE` after `npm install`
