import { Command } from "commander";
import { version as currentVersion } from "../../package.json";

const REPO = "context-labs/lsp-tkn-grep";

interface GitHubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

function getBinaryName(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `lsptkns-${os}-${arch}`;
}

export const updateCommand = new Command("update")
  .description("Check for a newer version and install it")
  .option("--check", "Only check for updates, don't install", false)
  .addHelpText(
    "after",
    `
Examples:
  $ lsptkns update
  $ lsptkns update --check`
  )
  .action(async (opts) => {
    console.log(`Current version: ${currentVersion}`);

    console.log("Checking for updates...");
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`
    );

    if (!res.ok) {
      console.error(`Failed to check for updates: ${res.statusText}`);
      process.exit(1);
    }

    const release = (await res.json()) as GitHubRelease;
    const latestVersion = release.tag_name.replace(/^v/, "");

    if (latestVersion === currentVersion) {
      console.log("Already up to date.");
      return;
    }

    console.log(`New version available: ${latestVersion}`);

    if (opts.check) {
      return;
    }

    const binaryName = getBinaryName();
    const asset = release.assets.find((a) => a.name === binaryName);

    if (!asset) {
      console.error(
        `No binary found for your platform (${binaryName}). ` +
          `Available: ${release.assets.map((a) => a.name).join(", ")}`
      );
      process.exit(1);
    }

    // Find where the current binary lives
    const execPath = process.execPath;
    console.log(`Downloading ${binaryName}...`);

    const downloadRes = await fetch(asset.browser_download_url, {
      redirect: "follow",
    });

    if (!downloadRes.ok) {
      console.error(`Download failed: ${downloadRes.statusText}`);
      process.exit(1);
    }

    const buffer = await downloadRes.arrayBuffer();
    await Bun.write(execPath, buffer);

    // Ensure executable permission
    const { chmod } = await import("node:fs/promises");
    await chmod(execPath, 0o755);

    console.log(`Updated to ${latestVersion}`);
  });
