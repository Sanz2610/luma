import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

let notices =
  "Luma third-party notices\n\nElectron and Chromium license texts are also retained in the Windows payload as LICENSE.electron.txt and LICENSES.chromium.html.\n\n";
notices += (await fs.readFile("CODEC_SOURCES.md", "utf8")) + "\n\n";
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script through npm.");
const listed = spawnSync(
  process.execPath,
  [npm, "ls", "--omit=dev", "--all", "--parseable"],
  { encoding: "utf8", windowsHide: true },
);
if (listed.status !== 0)
  throw new Error("Cannot enumerate runtime license notices.");
const roots = new Set(listed.stdout.trim().split(/\r?\n/).slice(1));
for (const name of [
  "react",
  "react-dom",
  "lucide-react",
  "@fontsource/be-vietnam-pro",
  "@img/sharp-win32-x64",
])
  roots.add(path.resolve("node_modules", name));
for (const root of [...roots].sort()) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      /^(licen[cs]e|copying|notice|ofl)([.\-_]|$)/i.test(entry.name)
    ) {
      const pkg = JSON.parse(
        await fs.readFile(path.join(root, "package.json"), "utf8"),
      );
      notices +=
        `\n===== ${pkg.name} ${pkg.version} — ${entry.name} =====\n\n` +
        (await fs.readFile(path.join(root, entry.name), "utf8")) +
        "\n";
    }
  }
}
notices +=
  "\n===== Electron =====\n\n" +
  (await fs.readFile("node_modules/electron/dist/LICENSE", "utf8"));
await fs.mkdir("build", { recursive: true });
await fs.writeFile("build/THIRD_PARTY_NOTICES.txt", notices);
console.log("Prepared bundled third-party notices");
