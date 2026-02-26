#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_LATEST_LOG_COUNT = 10;
const TEXT_VIEW_LOG = "\u67e5\u770b\u65e5\u5fd7";
const TEXT_SPACE_CONTENT = "\u7a7a\u95f4\u5185\u5bb9";
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+5iAAAAAASUVORK5CYII=";

function kebabToCamel(input) {
  return input.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

export function parseHealthcheckArgs(argv) {
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

    if (token.startsWith("--no-")) {
      args[kebabToCamel(token.slice(5))] = false;
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

export function extractLatestLogLines(dialogText, latestCount = DEFAULT_LATEST_LOG_COUNT) {
  const lines = String(dialogText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]/.test(line));
  if (latestCount <= 0) {
    return [];
  }
  return lines.slice(-latestCount);
}

export function validateHealthcheckOptions(raw) {
  if (!raw.studioUrl) {
    throw new Error("Missing required option: --studio-url");
  }

  const studioUrl = String(raw.studioUrl);
  if (!/^https?:\/\//i.test(studioUrl)) {
    throw new Error("Invalid --studio-url. Expected a full http(s) URL.");
  }

  const timeoutMs = Number.parseInt(String(raw.timeoutMs ?? DEFAULT_TIMEOUT_MS), 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid --timeout-ms. Use a positive integer.");
  }

  const latestLogCount = Number.parseInt(
    String(raw.latestLogCount ?? DEFAULT_LATEST_LOG_COUNT),
    10,
  );
  if (!Number.isFinite(latestLogCount) || latestLogCount < 1) {
    throw new Error("Invalid --latest-log-count. Use a positive integer.");
  }

  const rawBrowserChannel = String(raw.browserChannel ?? "chrome").toLowerCase();
  const browserChannel = rawBrowserChannel === "edge" ? "msedge" : rawBrowserChannel;
  if (!["chrome", "msedge", "chromium"].includes(browserChannel)) {
    throw new Error("Invalid --browser-channel. Use chrome, msedge, or chromium.");
  }

  const userDataDir = path.resolve(
    String(raw.userDataDir ?? "output/playwright/modelscope-profile"),
  );

  const checkFrontend = raw.checkFrontend === true;
  const headed = raw.headed === true;
  const bboxJson = String(raw.bboxJson ?? '[{"label":"cat","bbox":[0,0,1,1]}]');
  const outputJson = raw.outputJson ? path.resolve(String(raw.outputJson)) : null;

  return {
    studioUrl,
    timeoutMs,
    latestLogCount,
    browserChannel,
    userDataDir,
    checkFrontend,
    headed,
    bboxJson,
    outputJson,
  };
}

function printHelp() {
  const lines = [
    "Usage:",
    "  node scripts/modelscope-studio-healthcheck.mjs --studio-url <url> [options]",
    "",
    "Required:",
    "  --studio-url <url>              Studio detail page URL",
    "",
    "Options:",
    "  --latest-log-count <num>        Default: 10",
    "  --check-frontend                Also run image + bbox upload smoke test",
    "  --bbox-json <json>              Default: [{\"label\":\"cat\",\"bbox\":[0,0,1,1]}]",
    "  --browser-channel <name>        chrome|msedge|chromium, default: chrome",
    "  --user-data-dir <dir>           Default: output/playwright/modelscope-profile",
    "  --timeout-ms <num>              Default: 30000",
    "  --headed                        Show browser window (default headless)",
    "  --output-json <file>            Save result JSON to file",
    "  --help                          Show this help",
  ];
  console.log(lines.join("\n"));
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
}

function writeSmallTestImage() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-studio-check-"));
  const imagePath = path.join(tmpDir, "bbox-test-1x1.png");
  fs.writeFileSync(imagePath, Buffer.from(TEST_PNG_BASE64, "base64"));
  return imagePath;
}

async function openLogDialog(page) {
  const logButton = page.locator(`text=${TEXT_VIEW_LOG}`).first();
  const count = await page.locator(`text=${TEXT_VIEW_LOG}`).count();
  if (count === 0) {
    throw new Error(`Cannot find log button text: ${TEXT_VIEW_LOG}`);
  }
  await logButton.click({ timeout: 15000 });
  await page.waitForTimeout(2000);

  const dialog = page.locator('[role="dialog"]').first();
  if ((await dialog.count()) === 0) {
    throw new Error("Log dialog did not appear");
  }
  return dialog.innerText();
}

async function runFrontendSmoke(page, bboxJson) {
  const result = {
    ok: false,
    appFrameUrl: null,
    legendText: null,
    hasCat: false,
    canvasVisible: false,
    errorVisible: false,
    errorText: "",
  };

  const spaceTab = page.locator(`text=${TEXT_SPACE_CONTENT}`).first();
  if ((await spaceTab.count()) > 0) {
    await spaceTab.click({ timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);

  const frameHandle = await page.locator('iframe[src*=".ms.show"]').first().elementHandle();
  if (!frameHandle) {
    throw new Error("Cannot find app iframe");
  }
  const frame = await frameHandle.contentFrame();
  if (!frame) {
    throw new Error("Cannot access app iframe");
  }
  result.appFrameUrl = frame.url();

  const imagePath = writeSmallTestImage();
  const imageInput = frame.locator("#imageInput, #imageInputMobile").first();
  if ((await imageInput.count()) === 0) {
    throw new Error("Cannot find image input in app frame");
  }
  await imageInput.setInputFiles(imagePath);
  await frame.waitForTimeout(800);

  const jsonInput = frame.locator("#jsonInput, #jsonInputMobile").first();
  if ((await jsonInput.count()) === 0) {
    throw new Error("Cannot find bbox json input in app frame");
  }
  await jsonInput.fill(bboxJson);
  await frame.waitForTimeout(1200);

  const legend = frame.locator("#legendList, #legendListMobile").first();
  if ((await legend.count()) > 0) {
    result.legendText = (await legend.innerText()).trim();
  } else {
    result.legendText = "";
  }

  result.hasCat = /cat/i.test(result.legendText);
  result.canvasVisible = await frame.locator("#mainCanvas").isVisible().catch(() => false);
  result.errorVisible = await frame.locator("#errorMsg").isVisible().catch(() => false);
  result.errorText = (await frame.locator("#errorMsg").innerText().catch(() => "")).trim();
  result.ok =
    result.hasCat &&
    result.canvasVisible &&
    (!result.errorVisible || !result.errorText);

  return result;
}

export async function runStudioHealthcheck(options) {
  const { chromium } = await import("playwright");

  const context = await chromium.launchPersistentContext(options.userDataDir, {
    channel: options.browserChannel,
    headless: !options.headed,
    viewport: { width: 1600, height: 1200 },
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(options.timeoutMs);
  await page.goto(options.studioUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const dialogText = await openLogDialog(page);
  const latestLogs = extractLatestLogLines(dialogText, options.latestLogCount);

  const result = {
    studioUrl: options.studioUrl,
    checkedAt: new Date().toISOString(),
    latestLogs,
  };

  if (options.checkFrontend) {
    result.frontend = await runFrontendSmoke(page, options.bboxJson);
  }

  await context.close();
  return result;
}

async function main() {
  const raw = parseHealthcheckArgs(process.argv.slice(2));
  if (raw.help) {
    printHelp();
    return;
  }

  const options = validateHealthcheckOptions(raw);
  const result = await runStudioHealthcheck(options);
  const serialized = JSON.stringify(result, null, 2);

  if (options.outputJson) {
    ensureParentDir(options.outputJson);
    fs.writeFileSync(options.outputJson, serialized, "utf8");
  }

  console.log(serialized);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(`[modelscope-studio-healthcheck] ${error.message}`);
    process.exit(1);
  });
}
