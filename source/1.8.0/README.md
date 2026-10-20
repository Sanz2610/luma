# Luma 1.8.0 source

Created and maintained by [Sanz2610](https://github.com/Sanz2610). [MIT License](LICENSE); see [CREDITS.md](CREDITS.md).

This is a curated source snapshot for Luma 1.8.0, exported from development commit 73375a6d97003295e2c2a45980d9890f7a437d62. It includes application code, build configuration, dependency lockfile and tests; private development history and local data are excluded. SOURCE_MANIFEST.json records every exported file and its SHA-256. Runtime src/ and electron/ files match that development commit. Earlier snapshots may have additive author/license/resource metadata in package files, disclosed by the manifest.

## Build and test

Windows x64, Node.js 22.12+ or 24+, npm:

```powershell
cd source/1.8.0
npm ci
npm test
npm run build
npm start
```

From this directory, npm run dist creates installer and portable under ../work/release. npm run test:ui, test:windows and test:about exercise visible native windows (only scripts present in this snapshot apply). test:app uses synthetic fixtures and really recycles disposable fixture files. Do not put personal photos in test-results/. Release-publishing scripts require maintainer credentials and should not be used just to build or inspect Luma.

Normal photo browsing is local. electron/library.cjs owns indexing and Recycle Bin checks, electron/thumbnail-service.cjs isolates native decoding, electron/main.cjs restricts IPC and protocol access, electron/lens.cjs performs explicit Lens preview upload, and electron/updates.cjs handles GitHub update traffic.

## Verification limits

Compare source file SHA-256 against SOURCE_MANIFEST.json. Published binary SHA-256 is in the release's SHA256SUMS.txt. Matching source hashes preserves the reviewed snapshot; source visibility alone does not prove a binary was built from it. Bit-for-bit reproducible Windows executables and publisher signing are not currently promised. Dependencies retain their own licenses and notices.
