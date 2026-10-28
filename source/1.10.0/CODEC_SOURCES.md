# Image codec sources

Luma's original code is MIT licensed. The image libraries retain their own licenses. HEIC decoding uses heic-decode (ISC) and the unmodified libheif-js WebAssembly build (LGPL-3.0), including libheif and libde265. ExifTool is distributed under its bundled Perl/Artistic terms, with its Windows packaging notices. Full license texts are in THIRD_PARTY_NOTICES.txt and the dependency packages.

The release asset Luma-VERSION-codec-sources.zip contains the matching upstream source archives and build scripts for the HEIC dependencies, plus download hashes and upstream locations. The Luma source snapshot includes the application code and package lockfile. No private source request is needed.

HEIC packages ship unpacked under resources/app.asar.unpacked/node_modules/libheif-js so they can be inspected or replaced with a compatible modified build. Luma makes no restriction against modifying or debugging these LGPL components. Rebuild Luma from the source snapshot with your modified dependency if required. ExifTool's Perl modules, patches and notices ship with exiftool-vendored.exe.

## Upstream sources used in 1.8

- heic-decode 2.1.0: https://github.com/catdad-experiments/heic-decode
- libheif-js 1.23.5: https://github.com/catdad-experiments/libheif-js/tree/d8ec4bc3bc5bf8055975577bccbbc7e1d7313c2d
- libheif Emscripten wrapper: https://github.com/catdad-experiments/libheif-emscripten/tree/v1.23.5
- libheif: https://github.com/strukturag/libheif/tree/413e2a87e6a70b3eccc3a3adc5801179dd2d9e00
- libde265 1.0.15: https://github.com/strukturag/libde265/tree/v1.0.15
- ExifTool Windows package: https://github.com/photostructure/exiftool-vendored.exe

The upstream Emscripten workflow uses SDK 3.1.61, the libheif build-emscripten.sh script, and the wrapper's dist-prep.sh. libheif-js scripts/install.js then transforms and bundles the result. These scripts and their license files are included in the source archives. Luma does not modify codec sources.
