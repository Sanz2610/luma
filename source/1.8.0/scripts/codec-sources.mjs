import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yazl from "yazl";
import { pipeline } from "node:stream/promises";
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
for (const [name, version] of [
  ["libheif-js", "1.23.5"],
  ["heic-decode", "2.1.0"],
])
  if (
    JSON.parse(await fs.readFile(`node_modules/${name}/package.json`, "utf8"))
      .version !== version
  )
    throw new Error(
      "Codec version changed; review pinned source archives before releasing.",
    );
const root = path.resolve(pkg.build.directories.output);
await fs.mkdir(root, { recursive: true });
const inputs = [
  [
    "heic-decode.tar.gz",
    "https://codeload.github.com/catdad-experiments/heic-decode/tar.gz/47773f7b17acc22bfb8bb7869b6ef087d24c0ca9",
  ],
  [
    "libheif-js.tar.gz",
    "https://codeload.github.com/catdad-experiments/libheif-js/tar.gz/d8ec4bc3bc5bf8055975577bccbbc7e1d7313c2d",
  ],
  [
    "libheif-emscripten.tar.gz",
    "https://codeload.github.com/catdad-experiments/libheif-emscripten/tar.gz/refs/tags/v1.23.5",
  ],
  [
    "libheif.tar.gz",
    "https://codeload.github.com/strukturag/libheif/tar.gz/413e2a87e6a70b3eccc3a3adc5801179dd2d9e00",
  ],
  [
    "libde265.tar.gz",
    "https://github.com/strukturag/libde265/releases/download/v1.0.15/libde265-1.0.15.tar.gz",
  ],
];
const manifest = [],
  zip = new yazl.ZipFile();
for (const [name, url] of inputs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("Cannot obtain codec source: " + name);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes[0] !== 31 || bytes[1] !== 139)
    throw new Error("Unexpected source archive: " + name);
  zip.addBuffer(bytes, "upstream/" + name);
  manifest.push({
    name,
    url,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  });
}
zip.addBuffer(await fs.readFile("CODEC_SOURCES.md"), "README.md");
zip.addBuffer(
  Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
  "UPSTREAM_SOURCES.json",
);
const complete = pipeline(
  zip.outputStream,
  createWriteStream(path.join(root, `Luma-${pkg.version}-codec-sources.zip`)),
);
zip.end();
await complete;
await fs.copyFile("CODEC_SOURCES.md", path.join(root, "CODEC_SOURCES.md"));
console.log({ version: pkg.version, sourceArchives: manifest.length });
