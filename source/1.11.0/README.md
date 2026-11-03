# Luma 1.11.0

A local media viewer for Windows by [Sanz2610](https://github.com/Sanz2610). [MIT License](LICENSE).

## Build

Windows x64, Node.js 22.12+ or 24+:

```powershell
npm ci
npm run build
npm start
```

Run npm run dist for installer and portable builds. Outputs are in ../work/release.

This folder contains the app and files required to build it. SOURCE_MANIFEST.json records file hashes. Dependency licenses and codec source details are in CREDITS.md and CODEC_SOURCES.md.
