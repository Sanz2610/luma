import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { load } from "js-yaml";
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const directory = path.resolve(pkg.build.directories.output);
const latest = load(
  await fs.readFile(path.join(directory, "latest.yml"), "utf8"),
);
if (latest.version !== pkg.version)
  throw new Error("Update feed version differs from package.json.");
const setup = `Luma-${pkg.version}-Setup.exe`;
const portable = `Luma-${pkg.version}-Windows.exe`;
const entry = latest.files.find((file) => file.url === setup);
if (
  latest.files.length !== 1 ||
  latest.path !== setup ||
  latest.sha512 !== entry?.sha512
)
  throw new Error("Unexpected update manifest target.");
const setupBytes = await fs.readFile(path.join(directory, setup));
if (
  !entry ||
  entry.sha512 !==
    crypto.createHash("sha512").update(setupBytes).digest("base64") ||
  entry.size !== setupBytes.length
)
  throw new Error("Installer does not match latest.yml.");
const files = [
  setup,
  portable,
  setup + ".blockmap",
  "latest.yml",
  "THIRD_PARTY_NOTICES.txt",
  "LICENSE.txt",
  "CREDITS.md",
  `Luma-${pkg.version}-source.zip`,
  `Luma-${pkg.version}-source-manifest.json`,
];
for (const [from, to] of [
  ["LICENSE.luma.txt", "LICENSE.txt"],
  ["CREDITS.md", "CREDITS.md"],
])
  await fs.copyFile(
    path.join(directory, "win-unpacked/resources", from),
    path.join(directory, to),
  );
const sourceManifest = JSON.parse(
  await fs.readFile(
    path.join(directory, `Luma-${pkg.version}-source-manifest.json`),
    "utf8",
  ),
);
if (
  sourceManifest.version !== pkg.version ||
  sourceManifest.license !== "MIT" ||
  !sourceManifest.files.every(
    (file) =>
      !/^(src|electron)\//.test(file.path) || file.matchesDevelopmentCommit,
  )
)
  throw new Error("Source snapshot does not match the release.");
await fs.copyFile(
  path.join(directory, "win-unpacked/resources/THIRD_PARTY_NOTICES.txt"),
  path.join(directory, "THIRD_PARTY_NOTICES.txt"),
);
const manifest = [];
for (const file of files) {
  const bytes = await fs.readFile(path.join(directory, file));
  manifest.push({
    name: file,
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  });
}
await fs.writeFile(
  path.join(directory, "SHA256SUMS.txt"),
  manifest.map((file) => `${file.sha256}  ${file.name}`).join("\n") + "\n",
);
manifest.push({
  name: "SHA256SUMS.txt",
  size: (await fs.stat(path.join(directory, "SHA256SUMS.txt"))).size,
  sha256: crypto
    .createHash("sha256")
    .update(await fs.readFile(path.join(directory, "SHA256SUMS.txt")))
    .digest("hex"),
});
await fs.writeFile(
  path.join(directory, "release-manifest.json"),
  JSON.stringify(
    { version: pkg.version, repository: "Sanz2610/luma", files: manifest },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      version: pkg.version,
      directory,
      files: manifest.map((file) => file.name),
    },
    null,
    2,
  ),
);
