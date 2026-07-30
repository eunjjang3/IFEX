# IFEX

IFEX is a local-first image forensics viewer. It examines file identity, metadata leakage, JPEG encoding structure, editing traces, ICC profiles, embedded thumbnails, and C2PA Content Credentials without sending the analyzed file to the IFEX server.

Pixel Lab renders clipping, JPEG error-level analysis (ELA), high-frequency noise residuals, Sobel edge gradients, median-filter residuals, copy-move block matches, a Bayer CFA phase-residual approximation, separated Cb/Cr chroma channels, a multi-pass JPEG Ghost map, and decoded-luminance 8×8 DCT energy directly over the local preview. The copy-move view links repeated block regions only after neighboring blocks agree on a shared displacement. The CFA view compares green-channel prediction-error variance across local 2×2 phases; it is a lightweight heuristic rather than the full Popescu–Farid EM detector. JPEG Ghost scans eight browser-encoder qualities from Q50 to Q100, while the DCT view recomputes energy from decoded pixels rather than parsing original bitstream coefficients. Derived views are labeled as observed evidence or heuristics; none is presented as proof of manipulation.

The interface reports observed evidence and limitations. It does not assign a privacy score, claim that a file is safe, or treat missing metadata as proof of authenticity.

The inspection interface can switch between English, Korean, and Japanese without re-running analysis. Locale-specific UI fonts are bundled with the application; the header and footer retain a fixed brand typeface across languages.

## Usage

1. Open IFEX and select or drop one or more images.
2. Review file identity, metadata leakage, camera details, GPS, raw tags, and Pixel Lab views.
3. Treat observations and heuristics as investigative leads, not authenticity or malware verdicts.
4. Remove loaded files or close the tab or desktop app to release the local in-memory copies and previews.

Supported signatures include JPEG, PNG, WebP, AVIF, HEIC/HEIF, TIFF, DNG, NEF, and Canon CR2. Strict mode is enabled by default and rejects extension or MIME mismatches, unknown signatures, empty files, and generic `.raw` files without an identifiable supported format. A RAW file may have analysis results without a preview when no embedded image can be decoded safely.

### Browser requirements

Safe analysis requires Web Workers, `OffscreenCanvas.convertToBlob`, and `createImageBitmap`. IFEX rejects analysis when those APIs are unavailable unless an operator explicitly enables `IFEX_ALLOW_UNSAFE_PREVIEW`; the unsafe fallback directly decodes the original in the main browser context and is disabled by default.

Browser support is feature-based rather than user-agent-based. Test the production build in the browsers required by a deployment, especially for HEIC/HEIF and RAW preview support, because available decoders vary by browser and operating system.

## Development

Node.js 22.12 or newer is required.

```bash
npm install
npm run dev
```

### Desktop development

IFEX also runs as a sandboxed Electron application on macOS and Windows. The renderer reuses the browser application and its disposable analysis Workers; it does not receive Node.js integration or direct filesystem privileges. The preload bridge exposes only the desktop platform identifier, and external links are opened in the system browser only when their HTTPS origin is explicitly allowlisted.

Start Vite and Electron together:

```bash
npm run desktop:dev
```

Build an unpacked application bundle for the current host:

```bash
npm run desktop:package
```

Explicit cross-platform targets are also available:

```bash
npm run desktop:package:mac:arm64
npm run desktop:package:mac:x64
npm run desktop:package:win:x64
```

Bundles are written to `release/`. These development bundles are not distribution-signed, notarized, or wrapped in a DMG/MSI installer; macOS packaging applies only an ad-hoc local signature. Production distribution should build on the target operating system and add platform signing before publishing. The desktop renderer is built with relative asset paths so Workers, WASM, fonts, and bundled notices resolve from the packaged application without a server.

Verification:

```bash
npm run verify
```

### Analysis references and update commands

- File intake reads at most 4,100 bytes for signature detection. A small deterministic detector remains the fallback, while `file-type` provides an independent second opinion restricted to IFEX's existing supported-format allowlist. A matching signature is not a decoder-safety or antivirus verdict.
- EXIF is parsed at runtime with `exifr`. Representative metadata tests are independently checked with development-only `ExifReader` so one parser cannot silently define the expected result.
- JPEG marker traversal, quantization-table extraction, end-of-image handling, and subsampling detection share one bounded parser.
- C2PA Digital Source Type values are interpreted against a pinned, locally bundled transform of the official IPTC vocabulary. Only IPTC-defined generative-AI concepts produce an AI provenance signal.

Refresh the two attributed datasets explicitly, then review and commit the generated provenance fields and data diff:

```bash
npm run update:lensfun
npm run update:iptc-source-types
```

These commands use the network only during development. Normal image analysis uses the committed local datasets.

## Deployment

The production Docker image builds the Vite application and serves the static output through Nginx. It is suitable for OCI Ubuntu 24 deployments managed by Coolify.

Build and run it locally with:

```bash
docker compose up --build
```

The CI container check can also be run directly:

```bash
./scripts/verify-container.sh
```

The verification script publishes the test container on a Docker-assigned `127.0.0.1` port only, checks runtime configuration and security headers, and removes its uniquely named container and image when finished.

For Docker Compose, `IFEX_PORT` selects the host port (default `80`) and `IFEX_RESTART_POLICY` selects the Compose restart policy (default `unless-stopped`). These two container settings are not written to the browser runtime configuration. Copy [`.env.example`](.env.example) to `.env` when local overrides are needed; `.env` files are ignored by Git.

### Hardened image-analysis settings

IFEX verifies a bounded 4,100-byte prefix before parsing, analyzes originals in disposable workers, and displays only a size-limited PNG preview re-encoded in the browser. Encoded JPEG, PNG, and WebP dimensions are checked before browser decoding when their standard headers are available, and decoded dimensions are checked again afterward. JPEG structure output is capped at 4,096 segments and 16 quantization tables; C2PA report collections and text are bounded before crossing the Worker boundary. The preview is not byte-for-byte identical to the original; hashes, metadata, C2PA, file structure, and Pixel Lab calculations still use the original local file. A RAW file without a decodable embedded preview can be analyzed without displaying its original pixels.

Docker and Coolify deployments read `IFEX_*` variables when the container starts, so changing a limit does not require rebuilding the image. Static Vite deployments can set only the documented equivalent `VITE_IFEX_*` variables at build time; other `VITE_*` values are not passed into application configuration. Runtime values take precedence over build-time values, and invalid or out-of-range values fall back to the hardened defaults. Docker build contexts exclude `.env` and `.env.*` files so local settings are not sent to a builder.

| Runtime variable | Default | Allowed range |
| --- | ---: | ---: |
| `IFEX_STRICT_FILE_TYPES` | `true` | `true` / `false` |
| `IFEX_MAX_FILE_MIB` | `25` | 1–512 |
| `IFEX_MAX_ACTIVE_FILES` | `4` | 1–50 |
| `IFEX_MAX_ACTIVE_MIB` | `64` | 1–2048 |
| `IFEX_MAX_IMAGE_MEGAPIXELS` | `40` | 1–200 |
| `IFEX_MAX_PREVIEW_DIMENSION` | `2048` | 256–8192 |
| `IFEX_STATISTICS_SAMPLE_DIMENSION` | `400` | 64–1024 |
| `IFEX_MAX_EMBEDDED_THUMBNAIL_DIMENSION` | `1024` | 128–4096 |
| `IFEX_MAX_PIXEL_DIMENSION` | `2048` | 256–4096 |
| `IFEX_MAX_SEARCH_COPY_DIMENSION` | `1600` | 256–4096 |
| `IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT` | `90` | 50–100 |
| `IFEX_PARSE_CONCURRENCY` | `1` | 1–4 |
| `IFEX_PARSE_TIMEOUT_MS` | `15000` | 1000–120000 |
| `IFEX_PIXEL_TIMEOUT_MS` | `20000` | 1000–120000 |
| `IFEX_MAX_METADATA_TAGS` | `2000` | 100–10000 |
| `IFEX_MAX_METADATA_VALUE_CHARS` | `16384` | 256–1048576 |
| `IFEX_MAX_METADATA_TOTAL_CHARS` | `1048576` | 65536–16777216 |
| `IFEX_ALLOW_UNSAFE_PREVIEW` | `false` | `true` / `false` |

Strict file-type mode rejects unknown signatures, extension or declared-MIME mismatches, and generic `.raw` files whose format cannot be identified. DNG and NEF remain supported as TIFF-family files. `IFEX_ALLOW_UNSAFE_PREVIEW=true` explicitly permits direct main-thread decoding on browsers without the safe Worker APIs and should only be used in a trusted environment. See [`.env.example`](.env.example) for Docker and Coolify, or copy [`.env.local.example`](.env.local.example) to `.env.local` for local Vite development.

These controls reduce exposure to parser exploits and resource-exhaustion images; they are not an antivirus verdict and do not prove that a file is harmless. IFEX still does not upload analyzed files to its server.

## Privacy and external services

Opening IFEX and analyzing an image do not upload the image or its metadata to an IFEX server. The application bundles its UI fonts locally and does not contact a font provider.

Network access is limited to explicit user actions:

- **External map:** clicking **Load external map** requests OpenStreetMap tiles. The tile provider receives the browser IP address, the IFEX site origin through the standard browser Referer, and tile coordinates that approximate the embedded GPS location, but not the image file. The map displays the required OpenStreetMap attribution.
- **Reverse geocoding:** clicking **Fetch Address** sends the exact embedded coordinates and the IFEX site origin to the Nominatim service. IFEX serializes these requests globally with at least one second between request starts and displays OpenStreetMap attribution beside returned address data.
- **Map links:** opening Google Maps, Apple Maps, or OpenStreetMap sends the coordinates to the selected provider.
- **Reverse image search:** IFEX creates and downloads a metadata-free JPEG locally. Image pixels leave the browser only if the user then uploads that copy to the selected search service.

The privacy policy of each external provider applies after the user chooses to contact it.

## Security

Report suspected vulnerabilities privately by following the [security policy](SECURITY.md). Do not post exploit details, sensitive data, or malicious sample files in a public issue.

## License

IFEX source code is available under the [MIT License](LICENSE). Third-party dependencies and their assets remain subject to their respective licenses. Resolved versions are pinned by the lockfile; relevant license terms and attributions are recorded in package metadata and [Third-Party Notices](THIRD_PARTY_NOTICES.md).

The bundled camera crop-factor dataset is adapted from Lensfun under CC BY-SA 3.0. The bundled IPTC Digital Source Type vocabulary is an attributed transform under CC BY 4.0. A generated production-dependency license bundle and the development-only ExifReader notice are also recorded in [Third-Party Notices](THIRD_PARTY_NOTICES.md).

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [CHANGELOG.md](CHANGELOG.md) for project participation and release history.
