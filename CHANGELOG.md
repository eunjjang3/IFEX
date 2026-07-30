# Changelog

All notable IFEX changes are recorded here. The project follows semantic versioning once a version is tagged and released.

## 0.1.1 - 2026-07-30

### Added

- Version-gated GitHub release automation for unsigned macOS and Windows archives, multi-platform GHCR images, checksums, and provenance attestations.
- Repository screenshots and a product-focused README overview generated from the bundled local sample.

### Changed

- Normal CI now validates the sandboxed Electron entry points alongside the browser application.

## 0.1.0 - 2026-07-30

### Added

- Local file-origin, metadata-leakage, camera, GPS, raw-tag, C2PA, and Pixel Lab analysis views.
- Magic-byte validation for supported web and camera image formats.
- Disposable Worker analysis with pixel, metadata, timeout, file-count, and memory limits.
- Size-limited PNG previews and metadata-free reverse-search copies.
- Docker runtime configuration, hardened Nginx headers, community templates, and container verification.
- Lensfun-derived camera crop-factor data with CC BY-SA 3.0 attribution.
- Sensor-size and crop-factor interpretation that requires explicit EXIF or Lensfun evidence.
- Official IPTC Digital Source Type vocabulary for C2PA generative-AI provenance semantics.
- Independent EXIF sample verification with a development-only parser oracle.
- Version-pinned fallback license texts for production packages whose published tarballs omit a top-level license file.
- English, Korean, and Japanese inspection UI with persisted instant language switching and locally bundled locale-specific typography.
- CFA phase, Cb/Cr chroma, multi-pass JPEG Ghost, and decoded-luminance 8×8 DCT Pixel Lab views.
- Sandboxed Electron clients and unpacked application bundle targets for macOS arm64/x64 and Windows x64.

### Security

- Original image Blob URLs are excluded from the normal UI path.
- External map and geocoding requests require explicit user action.
- Runtime limits fall back to hardened defaults when configuration is invalid.
- Safe analysis fails closed when required Worker and canvas APIs are unavailable.
- File signatures receive a bounded, allowlisted independent cross-check without expanding supported formats.
- JPEG marker and quantization parsing share one bounded implementation with conservative malformed-data handling.
- OpenStreetMap tiles use the policy-required endpoint and visible attribution; Nominatim requests are globally serialized to one start per second and send a standard browser Referer.
- Encoded JPEG, PNG, and WebP dimensions are checked before decode when available, JPEG/C2PA Worker output is bounded, and temporary export/search object URLs are reclaimed.
- Docker excludes local environment files, Vite build configuration uses an exact allowlist, and CI proves an arbitrary `VITE_*` canary cannot enter the production bundle.
- Electron renderers keep Node.js integration disabled, expose only a read-only platform bridge, deny permission requests and webviews, and send only explicitly allowlisted HTTPS links to the system browser.

### Changed

- Firmware reporting now requires an explicit firmware EXIF field instead of inferring it from generic software metadata.
- Production dependency license notices are generated from the pinned lockfile and verified by CI.
- Type-only Leaflet and canvas-confetti packages are classified as development dependencies rather than production runtime packages.
- Header and footer typography remains fixed across languages while the inspection workspace follows the selected locale.
- The development runtime now requires Node.js 22.12 or newer for the current Electron and packaging toolchain.
