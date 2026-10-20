<p align="center"><img src="images/icon.png" width="76" alt="Luma icon"></p>

# Luma

### Your photos, in focus.

A focused photo browser for Windows. Open a folder, browse big photo grids, switch between folder tabs, and keep viewing in a separate window.

**[Download for Windows](https://github.com/Sanz2610/luma/releases/latest)** · **[Report a bug](https://github.com/Sanz2610/luma/issues/new?template=bug_report.yml)**

Free and open source · [MIT License](LICENSE) · Created by [Sanz2610](https://github.com/Sanz2610) · [Source snapshots](SOURCE.md)

![Luma photo library with folder tabs and compact controls](images/library.png)

## Download

Windows 10/11, 64-bit (x64). Luma is an early public release; feedback is welcome.

| Build | Best for | Updates |
| --- | --- | --- |
| **[Installer — Setup.exe](https://github.com/Sanz2610/luma/releases/latest/download/Luma-1.6.1-Setup.exe)** | Regular use. Installs to Program Files with Start/Desktop shortcuts. Administrator/UAC access is required. | Checks and downloads updates in the background. Choose **Restart to update** when ready. |
| **[Portable — Windows.exe](https://github.com/Sanz2610/luma/releases/latest/download/Luma-1.6.1-Windows.exe)** | Run without installing. Extracts on launch; settings are stored in your Windows profile. | Checks for new releases. Download the new portable file and replace the old one while Luma is closed. |

The current build has no publisher signing certificate, so Windows may show an unknown-publisher warning. Download from this repository's Releases and compare SHA-256 with `SHA256SUMS.txt` when needed. Versions before 1.6 require one manual update to gain the updater.

## Made for browsing

- **Photos first:** edge-to-edge grids with square corners, 1–12 full-width columns, square or 4:5 tiles, and crop/fit options.
- **Folders as tabs:** every immediate subfolder becomes a tab. Drag to reorder, sort by name or date created, and add custom display names without renaming directories.
- **Find folders fast:** searchable folder browser in 1–4 columns, keyboard navigation and a Manage mode for sorting, renaming and hiding tabs.
- **An independent viewer:** keep browsing the library while viewing a photo in its own window. Fit, actual size, wheel zoom, pan, fullscreen, and clickable navigation edges.
- **Remember your workspace:** library and viewer restore their own windowed, maximized or fullscreen state.
- **Organize:** select multiple photos and move them to Windows Recycle Bin after confirmation.
- **Folder shortcuts:** attach a website or search text to an individual tab.
- **Google Lens:** explicitly search the current image using a preview in your default browser.

![Luma independent photo viewer](images/viewer.png)

## Start in a minute

1. Install Luma or run the portable executable.
2. Choose the parent folder containing your photo folders.
3. Switch tabs and adjust **Columns** in the footer. Click an image to open the viewer.

Your photos stay in their source folders. Closing or renaming a tab does not move, rename or delete its directory. Closing **All photos** returns Home; select the root again to reopen it. Closed folders can be restored from **Folders → Hidden**.

## Shortcuts

| Library | Viewer |
| --- | --- |
| **Ctrl+F** — search photos | **← / →** — previous / next |
| **Ctrl+K** — find a folder | **Mouse wheel** — zoom |
| **F5** — refresh | **0 / 1** — fit / actual size |
| **F11** — fullscreen | **F / F11** — fullscreen |
| **Shift+click** — select a range | **Esc** — close viewer |

## Formats and large libraries

JPG/JPEG, PNG, WebP, GIF, AVIF and BMP. GIF thumbnails are static; the original GIF animates in the viewer. RAW, HEIC, TIFF and video are not supported.

The grid and tabs are virtualized, and thumbnail decoding runs in a separate process. Regression checks include 240 folders and 4,800 synthetic photos. Very large originals, malformed files and slow/network drives can still affect speed and memory. Some compressed BMP variants and images above the 64 MP preview limit may lack thumbnails.

## Updates, storage and privacy

**Settings → Updates** shows your version and update status. Automatic checking can be turned off. Installer updates download in the background and require an explicit **Restart to update**; Luma does not silently restart while you browse. Program Files updates can trigger UAC. Portable builds offer a new download instead of replacing themselves.

Browsing and thumbnail generation happen locally. Settings and cached previews live under `%APPDATA%\Luma`; the thumbnail cache is pruned toward 512 MB. The updater checks GitHub Releases and uses a separate update-download cache. Luma has no analytics or automatic diagnostic uploads.

**Google Lens is an explicit online action:** clicking its icon sends a bounded preview of the current photo to Google in your browser. Google may require login or CAPTCHA. Opening a configured folder link uses your browser too. Ordinary photo browsing does not upload photos.

## Feedback

Use **[Issues](https://github.com/Sanz2610/luma/issues)** for bugs and suggestions. Include your Luma version, Windows version, installer/portable build, steps to reproduce and the affected file type. Do not attach private photos or unredacted logs.

This repository contains the introduction, released source snapshots and Windows downloads. Development history is maintained in a separate private repository. Open-source component notices accompany each release; Electron and Chromium licenses are included in the application payload. See [Credits](CREDITS.md) for attribution. In Luma, the sidebar's **About Luma** button links to the project, developer, source and license.

Enjoying Luma? **[Buy me a coffee](DONATE.md)** — optional support for its continued development.

Screenshots use generated sample artwork.
