import { spawnSync } from "node:child_process";

export function githubClient() {
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    const result = spawnSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\n\n",
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    });
    if (result.status !== 0)
      throw new Error("GitHub authentication is unavailable.");
    token = result.stdout
      .split("\n")
      .find((line) => line.startsWith("password="))
      ?.slice(9)
      .trim();
  }
  if (!token) throw new Error("No GitHub credential is available.");
  return async (endpoint, options = {}) => {
    const url = new URL(endpoint, "https://api.github.com");
    if (
      !["api.github.com", "uploads.github.com"].includes(url.hostname) ||
      url.protocol !== "https:"
    )
      throw new Error("Unexpected GitHub API endpoint.");
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Luma-release-tools",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
      signal: AbortSignal.timeout(180000),
    });
    return response;
  };
}
