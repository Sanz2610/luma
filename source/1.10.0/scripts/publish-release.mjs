import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { githubClient } from "./github.mjs";

const request = githubClient();
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const directory = path.resolve(pkg.build.directories.output);
const manifest = JSON.parse(
  await fs.readFile(path.join(directory, "release-manifest.json"), "utf8"),
);
if (manifest.version !== pkg.version || manifest.repository !== "Sanz2610/luma")
  throw new Error("Release manifest is not for this version/repository.");
const expected = [
  `Luma-${pkg.version}-Setup.exe`,
  `Luma-${pkg.version}-Windows.exe`,
  `Luma-${pkg.version}-Setup.exe.blockmap`,
  "latest.yml",
  "THIRD_PARTY_NOTICES.txt",
  "LICENSE.txt",
  "CREDITS.md",
  "CODEC_SOURCES.md",
  `Luma-${pkg.version}-codec-sources.zip`,
  `Luma-${pkg.version}-source.zip`,
  `Luma-${pkg.version}-source-manifest.json`,
  "SHA256SUMS.txt",
];
if (
  JSON.stringify(manifest.files.map((file) => file.name).sort()) !==
  JSON.stringify(expected.sort())
)
  throw new Error("Unexpected release assets.");
for (const file of manifest.files) {
  const bytes = await fs.readFile(path.join(directory, file.name));
  if (
    bytes.length !== file.size ||
    (file.sha256 &&
      crypto.createHash("sha256").update(bytes).digest("hex") !== file.sha256)
  )
    throw new Error("Release artifact changed: " + file.name);
}
const endpoint = "/repos/Sanz2610/luma";
const repoResponse = await request(endpoint);
const repo = await repoResponse.json();
if (!repoResponse.ok || repo.private !== false)
  throw new Error("Expected public release repository is unavailable.");
const sourceResponse = await request("/repos/Sanz2610/luma-viewer");
const source = await sourceResponse.json();
if (!sourceResponse.ok || !source.private)
  throw new Error("Development repository must remain private.");
const tag = "v" + pkg.version;
let response = await request(endpoint + "/releases/tags/" + tag);
let release;
if (response.status === 404) {
  response = await request(endpoint + "/releases?per_page=100");
  const releases = await response.json();
  if (!response.ok) throw new Error("Cannot inspect draft releases.");
  const matches = releases.filter((item) => item.tag_name === tag);
  if (matches.length > 1)
    throw new Error(
      "Multiple releases use this tag; inspect before proceeding.",
    );
  release = matches[0];
} else release = await response.json();
if (!release) {
  const body = await fs.readFile("distribution/RELEASE_NOTES.md", "utf8");
  response = await request(endpoint + "/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: "Luma " + pkg.version,
      body,
      draft: true,
      prerelease: false,
    }),
  });
  release = await response.json();
}
if (!response.ok)
  throw new Error("Cannot prepare draft release: " + response.status);
if (!release.draft)
  throw new Error(
    "This release is already published; artifacts will not be replaced.",
  );
if (release.assets.some((asset) => !expected.includes(asset.name)))
  throw new Error("Draft contains unexpected assets.");
for (const file of manifest.files) {
  const existing = release.assets.find((asset) => asset.name === file.name);
  if (existing) {
    if (
      existing.size !== file.size ||
      (file.sha256 && existing.digest !== "sha256:" + file.sha256)
    )
      throw new Error("Existing draft asset differs: " + file.name);
    continue;
  }
  const url = new URL(release.upload_url.split("{")[0]);
  url.searchParams.set("name", file.name);
  response = await request(url.href, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: await fs.readFile(path.join(directory, file.name)),
  });
  const asset = await response.json();
  if (
    !response.ok ||
    asset.size !== file.size ||
    (file.sha256 && asset.digest !== "sha256:" + file.sha256)
  )
    throw new Error(
      "Draft asset upload failed verification: " +
        file.name +
        " (" +
        response.status +
        ")",
    );
  console.log("Uploaded " + file.name);
}
if (process.argv.includes("--publish")) {
  const verifiedResponse = await request(endpoint + "/releases/" + release.id);
  const verified = await verifiedResponse.json();
  if (
    !verifiedResponse.ok ||
    !verified.draft ||
    verified.assets.length !== manifest.files.length ||
    manifest.files.some(
      (file) =>
        !verified.assets.some(
          (asset) =>
            asset.name === file.name &&
            asset.size === file.size &&
            asset.digest === "sha256:" + file.sha256,
        ),
    )
  )
    throw new Error("Remote draft assets failed final verification.");
  response = await request(endpoint + "/releases/" + release.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false, make_latest: "true" }),
  });
  release = await response.json();
  if (!response.ok || release.draft)
    throw new Error("Release publication failed.");
}
console.log(
  JSON.stringify(
    { url: release.html_url, draft: release.draft, id: release.id },
    null,
    2,
  ),
);
