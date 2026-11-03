# Luma

A local media viewer for Windows by [Sanz2610](https://github.com/Sanz2610).

[Installer](https://github.com/Sanz2610/luma/releases/latest/download/Luma-1.11.1-Setup.exe) · [Portable](https://github.com/Sanz2610/luma/releases/latest/download/Luma-1.11.1-Windows.exe) · [Source](source/1.11.1) · [Issues](https://github.com/Sanz2610/luma/issues)

- Folder tabs, nested folders and adjustable thumbnail grids.
- Size, Type and Keyword filters, with one Clear filters button.
- Independent viewer with zoom, fullscreen, metadata and MP4/MOV playback.
- Bulk selection and deletion to Windows Recycle Bin.
- Mouse wheel can zoom or switch files; Ctrl + wheel always zooms.

**Formats:** JPG/JPEG, PNG, WebP, AVIF, BMP; static previews for GIF, TIFF, HEIC/HEIF, JXL and camera RAW. RAW requires an embedded preview. MP4/MOV playback depends on codecs; H.264/AAC is tested.

**Install:** Windows 10/11 x64. Setup defaults to Program Files and may request Administrator access. Update through Settings > Updates; portable users download a new copy. The app is not publisher-signed.

Browsing is local. Google Lens uploads a preview only when selected; updates use GitHub. Originals stay in their folders. Codec limits and licenses are in [CODEC_SOURCES.md](CODEC_SOURCES.md).

**Build:** open [source/1.11.1](source/1.11.1), run `npm ci`, `npm run build`, then `npm start`.

[MIT License](LICENSE) · [Credits](CREDITS.md) · [Donate](DONATE.md)
