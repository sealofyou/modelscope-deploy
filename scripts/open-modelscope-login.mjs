#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_CREATE_URL = "https://modelscope.cn/studios/create?template=quick";

function kebabToCamel(input) {
  return input.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    const key = kebabToCamel(token.slice(2));
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
      continue;
    }
    args[key] = true;
  }
  return args;
}

export function resolveBrowserExecutable(browserChannel) {
  const channel = String(browserChannel ?? "chrome").toLowerCase();
  const candidates = {
    chrome: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    msedge: [
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
  };

  const list = candidates[channel];
  if (!list) {
    throw new Error("Unsupported --browser-channel. Use chrome or msedge.");
  }

  for (const exe of list) {
    if (fs.existsSync(exe)) {
      return exe;
    }
  }

  throw new Error(`Cannot find executable for channel '${channel}'.`);
}

export function validateOptions(raw) {
  const browserChannelRaw = String(raw.browserChannel ?? "chrome").toLowerCase();
  const browserChannel = browserChannelRaw === "edge" ? "msedge" : browserChannelRaw;
  const createUrl = String(raw.createUrl ?? DEFAULT_CREATE_URL);
  const userDataDir = path.resolve(
    String(raw.userDataDir ?? "output/playwright/modelscope-profile"),
  );

  const executable = resolveBrowserExecutable(browserChannel);

  return {
    browserChannel,
    createUrl,
    userDataDir,
    executable,
  };
}

function printHelp() {
  console.log(
    [
      "Open ModelScope login/create page with a dedicated browser profile",
      "",
      "Usage:",
      "  node scripts/open-modelscope-login.mjs [options]",
      "",
      "Options:",
      "  --browser-channel <chrome|msedge>   Default: chrome",
      "  --user-data-dir <dir>               Default: output/playwright/modelscope-profile",
      "  --create-url <url>                  Default: https://modelscope.cn/studios/create?template=quick",
      "",
      "Example:",
      "  node scripts/open-modelscope-login.mjs --browser-channel chrome",
    ].join("\n"),
  );
}

export function openLoginWindow(options) {
  fs.mkdirSync(options.userDataDir, { recursive: true });

  const child = spawn(
    options.executable,
    [`--user-data-dir=${options.userDataDir}`, options.createUrl],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    },
  );
  child.unref();

  return {
    url: options.createUrl,
    profileDir: options.userDataDir,
    executable: options.executable,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const options = validateOptions(parsed);
  const result = openLoginWindow(options);

  console.log(`Opened browser: ${result.executable}`);
  console.log(`URL: ${result.url}`);
  console.log(`Profile dir: ${result.profileDir}`);
  console.log("Login in that window, then run modelscope-auto-submit with the same --browser-channel and --user-data-dir.");
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(currentFile).toLowerCase()
) {
  main().catch((error) => {
    console.error(`[open-modelscope-login] ${error.message}`);
    process.exitCode = 1;
  });
}
