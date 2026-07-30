# Contributing to IFEX

Thank you for helping improve IFEX. Changes should preserve its local-first design, evidence-focused language, and defensive handling of untrusted image files.

## Before opening an issue

- Use GitHub issues for reproducible bugs and focused feature requests.
- Follow [SECURITY.md](SECURITY.md) for suspected vulnerabilities. Never post exploit details or malicious samples publicly.
- Remove personal images, EXIF data, file paths, tokens, and other sensitive information from logs and reproductions.

## Development setup

Use Node.js 22.12 or newer.

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm test
npm run lint
npm run build
```

## Security and privacy invariants

Contributions must keep these properties intact:

- Untrusted image parsing and decoding stays in disposable Workers unless the explicitly unsafe fallback is enabled.
- The main UI displays re-encoded previews and does not create an original-file Blob URL.
- Hashing, C2PA, metadata, and Pixel Lab calculations continue to use the original local `File` where required.
- New resource limits use hardened defaults and bounded configuration parsing.
- New third-party network access requires a deliberate user action, an accurate privacy disclosure, and matching CSP and README updates.
- Electron renderer code must keep Node.js integration disabled, context isolation and sandboxing enabled, IPC surfaces minimal, and external navigation restricted to reviewed HTTPS origins.
- Test fixtures must be synthetic, redistributable, or stripped of unrelated personal data and metadata.

Changes to signatures, parsers, Workers, preview generation, CSP, runtime configuration, or container startup should include focused regression tests or an explanation of why automated coverage is impractical.

## Lensfun camera data

`src/data/lensfunCameras.json` is generated from Lensfun and remains under CC BY-SA 3.0. Regenerate it with:

```bash
npm run update:lensfun -- <lensfun-commit-or-ref>
```

When updating it, retain the source revision, transformation notice, third-party notice, and bundled license text.

## IPTC vocabulary and dependency licenses

`src/data/iptcDigitalSourceTypes.json` is an attributed transform of the official IPTC vocabulary under CC BY 4.0. Regenerate it with `npm run update:iptc-source-types`, review the source revision and data diff, and retain the attribution in `THIRD_PARTY_NOTICES.md`.

After changing production dependencies, regenerate and verify the deployed license bundle:

```bash
npm run generate:licenses
npm run check:licenses
```

Commit both generated copies with the dependency and lockfile change. `npm run verify` rejects stale license output.

If a production package tarball has no top-level license or notice file, add an exact version entry with provenance to `third_party/runtime/license-fallbacks.json` and place the reviewed text under `third_party/runtime/license-fallbacks/`. The generator rejects metadata-only packages without this explicit fallback.

## Pull requests

Keep each pull request focused. Describe the behavior change, security or privacy impact, verification commands, and any user-facing limitations. Do not mix generated artifacts or unrelated formatting changes into the patch.

The `main` branch does not accept direct pushes, including from administrators. Work from a topic branch or fork and open a pull request. The `verify` GitHub Actions check must pass, the branch must be current with `main`, and all review conversations must be resolved before merge. Changes are squash-merged so each pull request remains one focused commit, and merged branches are deleted automatically.

`CODEOWNERS` requests review from the repository owner. While IFEX has only one maintainer, an approving review is not mandatory because GitHub does not allow a pull request author to approve their own change. If another maintainer is granted write access, the branch rule should be raised to require at least one approval.

## Release policy

Only the repository owner creates version tags and publishes releases. Release tags use semantic versions such as `v0.1.0`; repository rules prevent other collaborators from creating, changing, or deleting tags. Published releases are immutable, so create them as drafts, attach and verify every asset and checksum, and publish only after the draft is complete.

Desktop artifacts must be produced on their target operating system. Release notes must identify the target platform and architecture, checksum, signing and notarization status, and the verification performed. Do not publish a cross-built or unsigned artifact as if it were a production-signed installer.
