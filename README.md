# Luma

A local media viewer for Windows by [Sanz2610](https://github.com/Sanz2610).

[Installer](https://github.com/Sanz2610/luma/releases/latest/download/Luma-1.10.0-Setup.exe) · [Portable](https://github.com/Sanz2610/luma/releases/latest/download/Luma-1.10.0-Windows.exe) · [Source](source/1.11.0) · [Issues](https://github.com/Sanz2610/luma/issues)

**1.11 source preview:** JXL, MP4/MOV and filters are available in the source below. Downloadable binaries are still **1.10.0** until the next release.

- Folder tabs, nested folders and a full-width thumbnail grid.
- Filter by minimum width/height, file type and words in filenames. Filters can be remembered.
- Separate viewer with zoom, fullscreen, metadata and MP4/MOV playback.
- Select files with a click or selection rectangle. Deletion uses Windows Recycle Bin; confirmation is optional.
- Mouse wheel can zoom or switch files. Ctrl + wheel always zooms.

## Formats

JPG/JPEG, PNG, WebP, AVIF and BMP. GIF, TIFF, HEIC/HEIF, JPEG XL and camera RAW use static previews. RAW requires an embedded JPEG preview. MP4/MOV playback depends on the file's codecs; H.264/AAC is tested.

JXL previews are limited to 32 MP and 64 MB input. Other image previews are limited to 64 MP; HEIC input is limited to 128 MB. Converted image previews are up to 4096 px. Originals stay in their folders.

## Install

Windows 10/11 x64. Setup installs to Program Files and may request Administrator access. Installer builds can update through Settings > Updates. Portable builds require a new download. The app is not publisher-signed.

Browsing is local. Google Lens uploads a preview only when you choose Search with Google Lens. The updater contacts GitHub. Settings and thumbnails are stored in your Windows profile; the thumbnail cache is limited to about 1 GB.

## Build

See [source/1.11.0](source/1.11.0). Earlier versions remain under source/ and in Git tags.

[MIT License](LICENSE) · [Credits](CREDITS.md) · [Codec sources](CODEC_SOURCES.md) · [Donate](DONATE.md)
