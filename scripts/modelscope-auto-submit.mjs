#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_CREATE_URL = "https://modelscope.cn/studios/create?template=quick";
const DEFAULT_DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_LOG_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_LOG_CHARS = 120000;
const DEFAULT_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RUN_TIMEOUT_MS = 20 * 60 * 1000;

const KNOWN_ISSUES = {
  "docker-entrypoint-not-found": {
    id: "docker-entrypoint-not-found",
    title: "docker-entrypoint.sh not found",
    pattern: /docker-entrypoint\.sh:\s*not found/i,
    autoFixable: true,
    hints: [
      "Use absolute ENTRYPOINT path, for example /usr/local/bin/docker-entrypoint.sh.",
      "Normalize line endings to LF in Docker build (sed -i 's/\\r$//' ...).",
    ],
    autoFix: fixDockerEntrypointNotFound,
  },
  "corepack-registry-timeout": {
    id: "corepack-registry-timeout",
    title: "Corepack/pnpm registry network issue",
    pattern:
      /(corepack is about to download|registry\.npmjs\.org|pnpm-\d+.*\.tgz|ERR_PNPM_FETCH|ECONNRESET|ETIMEDOUT)/i,
    autoFixable: true,
    hints: [
      "Set npm/corepack registry mirror in Dockerfile when build env cannot access npmjs reliably.",
      "Example mirror: https://registry.npmmirror.com",
    ],
    autoFix: fixCorepackRegistryMirror,
  },
  "vite-router-base-path": {
    id: "vite-router-base-path",
    title: "Vite/Router base path mismatch",
    pattern: /(Failed to load resource.*404|Cannot\s+GET\s+\/app\/|route.*not\s+matched)/i,
    autoFixable: false,
    hints: [
      "Set Vite base to './' for relative asset paths.",
      "If using BrowserRouter under sub-path, configure basename.",
    ],
  },
};

const ERROR_LINE_PATTERN =
  /(\b(error|failed|failure|exception|traceback)\b|not found|GL_HOOK_ERR|EACCES|ENOENT|denied|invalid)/i;
const SUCCESS_PATTERN =
  /(deploy(ment)?\s+success|部署成功|service\s+running|服务运行中|started\s+successfully|启动成功)/i;
const LOGIN_INDICATOR_PATTERN =
  /(登录|请先登录|sign in|log in|手机号|验证码|password|账号登录|oauth)/i;
const CREATE_FORM_INDICATOR_PATTERN =
  /(空间英文名称|英文名称|English Name|Studio English|空间中文名称|中文名称|创建并部署|确认创建并部署)/i;
const HOME_PAGE_INDICATOR_PATTERN =
  /(模型库|数据集|创空间|文档|社区动向|登录\s*\/\s*注册|加入社区)/i;
const LOGIN_PATH_PATTERN = /(\/login|\/signin|auth\/login)/i;
const CREATE_PATH_PATTERN = /(\/studios\/create)/i;

const ENGLISH_NAME_SELECTORS = [
  'input[placeholder*="英文"]',
  'input[placeholder*="English"]',
  'input[name*="english"]',
  'input[id*="english"]',
];

const CHINESE_NAME_SELECTORS = [
  'input[placeholder*="中文"]',
  'input[placeholder*="Chinese"]',
  'input[name*="chinese"]',
  'input[id*="chinese"]',
];

const DESCRIPTION_SELECTORS = [
  'textarea[placeholder*="描述"]',
  'textarea[placeholder*="description"]',
  'textarea[name*="description"]',
  "textarea",
];

function kebabToCamel(input) {
  return input.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function testAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferCreatePageState(snapshot) {
  const url = String(snapshot?.url ?? "");
  const bodyText = String(snapshot?.bodyText ?? "");
  const title = String(snapshot?.title ?? "");
  const source = `${title}\n${bodyText}`;
  const reasons = [];

  if (LOGIN_PATH_PATTERN.test(url) || LOGIN_INDICATOR_PATTERN.test(source)) {
    reasons.push("login-indicator");
    return { state: "login_required", reasons };
  }

  const hasFormInputs =
    snapshot?.hasEnglishInput === true ||
    snapshot?.hasChineseInput === true ||
    snapshot?.hasDescriptionInput === true;
  const hasCreateTexts = CREATE_FORM_INDICATOR_PATTERN.test(source);
  const looksLikeHomePage = HOME_PAGE_INDICATOR_PATTERN.test(source);

  if (hasFormInputs || hasCreateTexts) {
    reasons.push("create-form-indicator");
    return { state: "create_form_ready", reasons };
  }

  if (CREATE_PATH_PATTERN.test(url) && looksLikeHomePage) {
    reasons.push("create-url-but-home-page");
    return { state: "login_required", reasons };
  }

  return { state: "unknown", reasons };
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

export function validateOptions(raw) {
  const required = [
    ["projectPath", "--project-path"],
    ["englishName", "--english-name"],
    ["chineseName", "--chinese-name"],
    ["description", "--description"],
  ];

  for (const [key, flag] of required) {
    if (!raw[key]) {
      throw new Error(`Missing required option: ${flag}`);
    }
  }

  const projectPath = path.resolve(String(raw.projectPath));
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }
  if (!fs.statSync(projectPath).isDirectory()) {
    throw new Error(`Project path must be a directory: ${projectPath}`);
  }

  const visibility = String(raw.visibility ?? "private").toLowerCase();
  if (!["public", "private"].includes(visibility)) {
    throw new Error("Invalid --visibility. Use public or private.");
  }

  const timeoutMs = Number.parseInt(String(raw.timeoutMs ?? "180000"), 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid --timeout-ms. Use a positive integer.");
  }

  const promptTimeoutMs = Number.parseInt(
    String(raw.promptTimeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS),
    10,
  );
  if (!Number.isFinite(promptTimeoutMs) || promptTimeoutMs <= 0) {
    throw new Error("Invalid --prompt-timeout-ms. Use a positive integer.");
  }

  const runTimeoutMs = Number.parseInt(
    String(raw.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS),
    10,
  );
  if (!Number.isFinite(runTimeoutMs) || runTimeoutMs <= 0) {
    throw new Error("Invalid --run-timeout-ms. Use a positive integer.");
  }

  const waitAfterUploadMs = Number.parseInt(
    String(raw.waitAfterUploadMs ?? "3000"),
    10,
  );
  if (!Number.isFinite(waitAfterUploadMs) || waitAfterUploadMs < 0) {
    throw new Error("Invalid --wait-after-upload-ms. Use a non-negative integer.");
  }

  const deployTimeoutMs = Number.parseInt(
    String(raw.deployTimeoutMs ?? DEFAULT_DEPLOY_TIMEOUT_MS),
    10,
  );
  if (!Number.isFinite(deployTimeoutMs) || deployTimeoutMs <= 0) {
    throw new Error("Invalid --deploy-timeout-ms. Use a positive integer.");
  }

  const logPollIntervalMs = Number.parseInt(
    String(raw.logPollIntervalMs ?? DEFAULT_LOG_POLL_INTERVAL_MS),
    10,
  );
  if (!Number.isFinite(logPollIntervalMs) || logPollIntervalMs <= 0) {
    throw new Error("Invalid --log-poll-interval-ms. Use a positive integer.");
  }

  const rawBrowserChannel = String(raw.browserChannel ?? "chrome").toLowerCase();
  const browserChannel = rawBrowserChannel === "edge" ? "msedge" : rawBrowserChannel;
  if (!["chrome", "msedge", "chromium"].includes(browserChannel)) {
    throw new Error("Invalid --browser-channel. Use chrome, msedge, or chromium.");
  }

  const outputDir = path.resolve(String(raw.outputDir ?? "output/playwright"));
  const userDataDir = path.resolve(
    String(raw.userDataDir ?? "output/playwright/modelscope-profile"),
  );
  const createUrl = String(raw.createUrl ?? DEFAULT_CREATE_URL);

  return {
    projectPath,
    englishName: String(raw.englishName),
    chineseName: String(raw.chineseName),
    description: String(raw.description),
    visibility,
    timeoutMs,
    promptTimeoutMs,
    runTimeoutMs,
    waitAfterUploadMs,
    deployTimeoutMs,
    logPollIntervalMs,
    browserChannel,
    maxLogChars: DEFAULT_MAX_LOG_CHARS,
    headed: raw.headed !== false,
    autoSubmit: raw.autoSubmit === true,
    monitorDeploy: raw.monitorDeploy === true || raw.autoFix === true,
    autoFix: raw.autoFix === true,
    interactive: raw.interactive !== false,
    outputDir,
    userDataDir,
    createUrl,
  };
}

function printHelp() {
  const lines = [
    "ModelScope Studio auto submit (Playwright)",
    "",
    "Usage:",
    "  node scripts/modelscope-auto-submit.mjs --project-path <dir> --english-name <name> --chinese-name <name> --description <text> [options]",
    "",
    "Required:",
    "  --project-path <dir>      Project directory to upload",
    "  --english-name <name>     Studio English name",
    "  --chinese-name <name>     Studio Chinese name",
    "  --description <text>      Studio description",
    "",
    "Optional:",
    "  --visibility <private|public>  Default: private",
    "  --browser-channel <name>       Default: chrome (chrome|msedge|chromium)",
    "  --timeout-ms <number>          Default: 180000",
    "  --prompt-timeout-ms <number>   Default: 300000",
    "  --run-timeout-ms <number>      Default: 1200000",
    "  --wait-after-upload-ms <num>   Default: 3000",
    "  --headed / --no-headed         Default: headed",
    "  --auto-submit                  Click final submit button",
    "  --monitor-deploy               Monitor deployment logs after submit",
    "  --auto-fix                     Apply known local fixes from detected log errors",
    "  --deploy-timeout-ms <number>   Default: 600000",
    "  --log-poll-interval-ms <num>   Default: 5000",
    "  --no-interactive               Do not prompt for manual confirmation",
    "  --output-dir <dir>             Default: output/playwright",
    "  --user-data-dir <dir>          Default: output/playwright/modelscope-profile",
    "  --create-url <url>             Default: https://modelscope.cn/studios/create?template=quick",
    "",
    "Example:",
    "  node scripts/modelscope-auto-submit.mjs --project-path ../mind-ai --english-name mind-ai --chinese-name mind-ai --description 'AI app' --visibility private --auto-submit --monitor-deploy --auto-fix",
  ];
  console.log(lines.join("\n"));
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      "Cannot import playwright. Install it first with: npm install --save-dev playwright",
      { cause: error },
    );
  }
}

async function promptEnter(message, timeoutMs) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let timeoutId;
  try {
    await Promise.race([
      rl.question(`${message}\nPress Enter to continue...`),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Prompt timed out after ${timeoutMs} ms. Re-run with --no-interactive if needed.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    rl.close();
  }
}

async function collectFilesRecursively(dirPath) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFilesRecursively(fullPath);
      files.push(...nested);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

async function findFirstLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }
  return null;
}

async function collectPageSignals(page) {
  const data = await page.evaluate(() => {
    const hasAny = (selectors) =>
      selectors.some((selector) => document.querySelector(selector) !== null);
    const englishSelectors = [
      'input[placeholder*="英文"]',
      'input[placeholder*="English"]',
      'input[name*="english"]',
      'input[id*="english"]',
    ];
    const chineseSelectors = [
      'input[placeholder*="中文"]',
      'input[placeholder*="Chinese"]',
      'input[name*="chinese"]',
      'input[id*="chinese"]',
    ];
    const descriptionSelectors = [
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="description"]',
      'textarea[name*="description"]',
      "textarea",
    ];

    return {
      title: document.title || "",
      bodyText: (document.body?.innerText || "").slice(0, 16000),
      hasEnglishInput: hasAny(englishSelectors),
      hasChineseInput: hasAny(chineseSelectors),
      hasDescriptionInput: hasAny(descriptionSelectors),
    };
  });

  return {
    url: page.url(),
    ...data,
  };
}

async function saveDebugArtifacts(page, options, stage) {
  try {
    await ensureDir(options.outputDir);
    const stamp = formatStamp();
    const screenshotPath = path.join(
      options.outputDir,
      `modelscope-debug-${stage}-${stamp}.png`,
    );
    const htmlPath = path.join(
      options.outputDir,
      `modelscope-debug-${stage}-${stamp}.html`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await fs.promises.writeFile(htmlPath, await page.content(), "utf8");
    return { screenshotPath, htmlPath };
  } catch {
    return null;
  }
}

async function waitForCreateFormReady(page, options) {
  const deadline = Date.now() + options.timeoutMs;
  let lastState = "unknown";
  let lastUrl = page.url();
  let loginHandled = false;

  while (Date.now() < deadline) {
    const signals = await collectPageSignals(page);
    const inferred = inferCreatePageState(signals);
    lastState = inferred.state;
    lastUrl = signals.url;

    if (inferred.state === "create_form_ready") {
      return;
    }

    if (inferred.state === "login_required") {
      if (options.interactive && !loginHandled) {
        loginHandled = true;
        await promptEnter(
          `Detected login-required state at ${signals.url}. Please login in the opened browser, then continue.`,
          options.promptTimeoutMs,
        );
        await page.goto(options.createUrl, { waitUntil: "domcontentloaded" });
        continue;
      }
      throw new Error(
        `Login required before auto submit. Please login at ${signals.url} and retry.`,
      );
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Create form not ready within ${options.timeoutMs} ms. Last state=${lastState}, url=${lastUrl}`,
  );
}

async function fillBySelectors(page, selectors, value, fieldName) {
  const locator = await findFirstLocator(page, selectors);
  if (!locator) {
    throw new Error(`Cannot find field: ${fieldName}, url=${page.url()}`);
  }
  await locator.click({ timeout: 5000 });
  await locator.fill(value);
}

async function clickBySelectors(page, selectors, fieldName) {
  const locator = await findFirstLocator(page, selectors);
  if (!locator) {
    throw new Error(`Cannot find clickable target: ${fieldName}`);
  }
  await locator.click();
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function formatStamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "-");
}

function normalizeIssue(definition, logText) {
  return {
    id: definition.id,
    title: definition.title,
    autoFixable: definition.autoFixable === true,
    hints: [...(definition.hints ?? [])],
    matchedLines: extractMatchedLines(logText, definition.pattern),
  };
}

function extractMatchedLines(logText, pattern, maxLines = 4) {
  const lines = String(logText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const matched = [];
  for (const line of lines) {
    if (pattern.test(line)) {
      matched.push(line);
      if (matched.length >= maxLines) {
        break;
      }
    }
  }
  return matched;
}

export function analyzeDeployLog(logText) {
  const source = String(logText ?? "");
  const issues = Object.values(KNOWN_ISSUES)
    .filter((issue) => issue.pattern.test(source))
    .map((issue) => normalizeIssue(issue, source));

  const genericErrorLines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => ERROR_LINE_PATTERN.test(line))
    .slice(0, 12);

  return {
    hasErrors: issues.length > 0 || genericErrorLines.length > 0,
    successDetected: SUCCESS_PATTERN.test(source),
    issues,
    genericErrorLines,
  };
}

function normalizeLf(content) {
  return content.replace(/\r\n/g, "\n");
}

async function fixDockerEntrypointNotFound({ projectPath }) {
  const dockerfilePath = path.join(projectPath, "Dockerfile");
  if (!fs.existsSync(dockerfilePath)) {
    return {
      changed: false,
      reason: `Dockerfile not found at ${dockerfilePath}`,
      files: [],
    };
  }

  const original = normalizeLf(await fs.promises.readFile(dockerfilePath, "utf8"));
  let updated = original;

  updated = updated.replace(
    /ENTRYPOINT\s*\[\s*["']docker-entrypoint\.sh["']\s*\]/g,
    'ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]',
  );

  const normalizeLine =
    "RUN sed -i 's/\\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh";

  if (/docker-entrypoint\.sh/i.test(updated) && !updated.includes(normalizeLine)) {
    const copyLinePattern = /^(.*COPY[^\n]*docker-entrypoint\.sh[^\n]*)$/m;
    if (copyLinePattern.test(updated)) {
      updated = updated.replace(copyLinePattern, `$1\n${normalizeLine}`);
    } else {
      const entrypointPattern = /^(.*ENTRYPOINT[^\n]*)$/m;
      if (entrypointPattern.test(updated)) {
        updated = updated.replace(entrypointPattern, `${normalizeLine}\n$1`);
      } else {
        updated = `${updated.trimEnd()}\n${normalizeLine}\n`;
      }
    }
  }

  if (updated === original) {
    return {
      changed: false,
      reason: "Dockerfile already looks compatible with entrypoint requirements.",
      files: [],
    };
  }

  await fs.promises.writeFile(dockerfilePath, updated, "utf8");
  return {
    changed: true,
    reason: "Updated ENTRYPOINT and added CRLF normalization for docker-entrypoint.sh.",
    files: [dockerfilePath],
  };
}

async function fixCorepackRegistryMirror({ projectPath }) {
  const dockerfilePath = path.join(projectPath, "Dockerfile");
  if (!fs.existsSync(dockerfilePath)) {
    return {
      changed: false,
      reason: `Dockerfile not found at ${dockerfilePath}`,
      files: [],
    };
  }

  const original = normalizeLf(await fs.promises.readFile(dockerfilePath, "utf8"));
  let updated = original;

  if (!/corepack/i.test(updated)) {
    return {
      changed: false,
      reason: "No corepack usage detected in Dockerfile.",
      files: [],
    };
  }

  if (/COREPACK_NPM_REGISTRY|npm_config_registry/i.test(updated)) {
    return {
      changed: false,
      reason: "Registry mirror already configured.",
      files: [],
    };
  }

  const mirrorEnv = [
    "ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \\",
    "    npm_config_registry=https://registry.npmmirror.com",
  ].join("\n");

  const fromPattern = /^(FROM[^\n]*\n)/i;
  if (fromPattern.test(updated)) {
    updated = updated.replace(fromPattern, `$1${mirrorEnv}\n`);
  } else {
    updated = `${mirrorEnv}\n${updated}`;
  }

  await fs.promises.writeFile(dockerfilePath, updated, "utf8");
  return {
    changed: true,
    reason: "Added corepack/npm registry mirror config.",
    files: [dockerfilePath],
  };
}

export async function applyKnownAutoFixes({ projectPath, issues }) {
  const uniqueIds = [...new Set((issues ?? []).map((issue) => issue.id).filter(Boolean))];

  const applied = [];
  const skipped = [];
  const failed = [];

  for (const issueId of uniqueIds) {
    const issueDef = KNOWN_ISSUES[issueId];
    if (!issueDef) {
      skipped.push({ id: issueId, reason: "Unknown issue id." });
      continue;
    }
    if (!issueDef.autoFixable || typeof issueDef.autoFix !== "function") {
      skipped.push({ id: issueId, reason: "No automatic fix available." });
      continue;
    }

    try {
      const result = await issueDef.autoFix({ projectPath });
      if (result.changed) {
        applied.push({ id: issueId, ...result });
      } else {
        skipped.push({ id: issueId, reason: result.reason ?? "No changes required." });
      }
    } catch (error) {
      failed.push({
        id: issueId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { applied, skipped, failed };
}

async function collectDeployLogText(page, maxChars) {
  const text = await page.evaluate((limit) => {
    const selectors = [
      "pre",
      "code",
      "[class*='log']",
      "[class*='Log']",
      "[class*='console']",
      "[data-testid*='log']",
      "[data-testid*='console']",
      "[role='log']",
    ];

    const chunks = [];
    const seen = new Set();

    const pushChunk = (value) => {
      const textValue = String(value ?? "").trim();
      if (!textValue) {
        return;
      }
      if (seen.has(textValue)) {
        return;
      }
      seen.add(textValue);
      chunks.push(textValue);
    };

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        pushChunk(node.textContent || "");
      }
    }

    pushChunk(document.body?.innerText || "");

    return chunks.join("\n\n").slice(0, limit);
  }, maxChars);

  return String(text ?? "");
}

function printAnalysis(analysis) {
  if (!analysis.hasErrors) {
    return;
  }

  if (analysis.issues.length > 0) {
    console.log("Detected known deployment issues:");
    for (const issue of analysis.issues) {
      console.log(`- [${issue.id}] ${issue.title}`);
      for (const line of issue.matchedLines.slice(0, 2)) {
        console.log(`  log: ${line}`);
      }
      for (const hint of issue.hints) {
        console.log(`  hint: ${hint}`);
      }
    }
  }

  if (analysis.genericErrorLines.length > 0) {
    console.log("Error-like lines from deployment log:");
    for (const line of analysis.genericErrorLines.slice(0, 5)) {
      console.log(`- ${line}`);
    }
  }
}

async function monitorDeployment(page, options) {
  const logPath = path.join(
    options.outputDir,
    `modelscope-deploy-log-${formatStamp()}.txt`,
  );

  const deadline = Date.now() + options.deployTimeoutMs;
  let latestLogText = "";
  let latestAnalysis = analyzeDeployLog("");

  while (Date.now() < deadline) {
    try {
      const logText = await collectDeployLogText(page, options.maxLogChars);
      if (logText && logText !== latestLogText) {
        latestLogText = logText;
        await fs.promises.writeFile(logPath, latestLogText, "utf8");
      }

      latestAnalysis = analyzeDeployLog(latestLogText);
      if (latestAnalysis.hasErrors) {
        return {
          status: "failed",
          logPath,
          analysis: latestAnalysis,
          url: page.url(),
        };
      }
      if (latestAnalysis.successDetected) {
        return {
          status: "success",
          logPath,
          analysis: latestAnalysis,
          url: page.url(),
        };
      }
    } catch {
      // The page can reload during deployment. Continue polling.
    }

    await page.waitForTimeout(options.logPollIntervalMs);
  }

  return {
    status: "timeout",
    logPath,
    analysis: latestAnalysis,
    url: page.url(),
  };
}

async function withTimeout(taskPromise, timeoutMs, timeoutMessage) {
  let timeoutId;
  try {
    return await Promise.race([
      taskPromise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function run(options) {
  const { chromium } = await importPlaywright();
  await ensureDir(options.outputDir);
  await ensureDir(options.userDataDir);

  const launchOptions = {
    headless: !options.headed,
    viewport: { width: 1440, height: 900 },
  };
  if (options.browserChannel !== "chromium") {
    launchOptions.channel = options.browserChannel;
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(options.userDataDir, launchOptions);
  } catch (error) {
    if (options.browserChannel === "chromium") {
      throw new Error(
        "Playwright Chromium is not installed. Use --browser-channel chrome to reuse system Chrome, or run: npx playwright install chromium",
        { cause: error },
      );
    }
    throw new Error(
      `Failed to launch browser channel '${options.browserChannel}'. Check local browser installation.`,
      { cause: error },
    );
  }

  let page;
  try {
    page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(options.timeoutMs);

    await page.goto(options.createUrl, { waitUntil: "domcontentloaded" });
    await waitForCreateFormReady(page, options);
    if (options.interactive) {
      await promptEnter(
        "Please confirm you are logged in to ModelScope and the create form is visible.",
        options.promptTimeoutMs,
      );
    }

    await fillBySelectors(
      page,
      ENGLISH_NAME_SELECTORS,
      options.englishName,
      "english name",
    );
    await fillBySelectors(
      page,
      CHINESE_NAME_SELECTORS,
      options.chineseName,
      "chinese name",
    );
    await fillBySelectors(
      page,
      DESCRIPTION_SELECTORS,
      options.description,
      "description",
    );

    if (options.visibility === "public") {
      await clickBySelectors(
        page,
        [
          'label:has-text("公开")',
          'label:has-text("Public")',
          '[role="radio"]:has-text("公开")',
          '[role="radio"]:has-text("Public")',
        ],
        "public visibility",
      );
    } else {
      await clickBySelectors(
        page,
        [
          'label:has-text("私有")',
          'label:has-text("Private")',
          '[role="radio"]:has-text("私有")',
          '[role="radio"]:has-text("Private")',
        ],
        "private visibility",
      );
    }

    const uploadInput = await findFirstLocator(page, [
      'input[type="file"][webkitdirectory]',
      'input[type="file"]',
    ]);
    if (!uploadInput) {
      throw new Error("Cannot find upload input");
    }

    const supportsDirectory = await uploadInput.evaluate((el) =>
      el.hasAttribute("webkitdirectory"),
    );
    if (supportsDirectory) {
      await uploadInput.setInputFiles(options.projectPath);
    } else {
      const files = await collectFilesRecursively(options.projectPath);
      await uploadInput.setInputFiles(files);
    }

    await page.waitForTimeout(options.waitAfterUploadMs);

    const beforeSubmitShot = path.join(
      options.outputDir,
      `modelscope-before-submit-${formatStamp()}.png`,
    );
    await page.screenshot({ path: beforeSubmitShot, fullPage: true });
    console.log(`Saved screenshot: ${beforeSubmitShot}`);

    if (!options.autoSubmit) {
      console.log("Dry run completed. Pass --auto-submit to click final submit.");
      return;
    }

    if (options.interactive) {
      await promptEnter(
        "About to click final submit. Confirm all fields are correct.",
        options.promptTimeoutMs,
      );
    }

    await clickBySelectors(
      page,
      [
        'button:has-text("确认创建并部署")',
        'button:has-text("创建并部署")',
        'button:has-text("Create")',
      ],
      "final submit button",
    );

    await page.waitForTimeout(3000);
    const afterSubmitShot = path.join(
      options.outputDir,
      `modelscope-after-submit-${formatStamp()}.png`,
    );
    await page.screenshot({ path: afterSubmitShot, fullPage: true });
    console.log(`Saved screenshot: ${afterSubmitShot}`);
    console.log(`Current URL: ${page.url()}`);

    if (!options.monitorDeploy) {
      return;
    }

    const monitorResult = await monitorDeployment(page, options);
    console.log(`Deployment monitor result: ${monitorResult.status}`);
    console.log(`Deployment log saved at: ${monitorResult.logPath}`);
    console.log(`Deployment page URL: ${monitorResult.url}`);

    printAnalysis(monitorResult.analysis);

    if (monitorResult.status === "failed" && options.autoFix) {
      const fixResult = await applyKnownAutoFixes({
        projectPath: options.projectPath,
        issues: monitorResult.analysis.issues,
      });

      if (fixResult.applied.length > 0) {
        console.log("Applied local auto fixes:");
        for (const item of fixResult.applied) {
          console.log(`- ${item.id}: ${item.reason}`);
          for (const file of item.files ?? []) {
            console.log(`  file: ${file}`);
          }
        }
        console.log("Re-run this script to create a new deployment with the fixed files.");
      }

      if (fixResult.skipped.length > 0) {
        console.log("Skipped fixes:");
        for (const item of fixResult.skipped) {
          console.log(`- ${item.id}: ${item.reason}`);
        }
      }

      if (fixResult.failed.length > 0) {
        console.log("Failed fixes:");
        for (const item of fixResult.failed) {
          console.log(`- ${item.id}: ${item.reason}`);
        }
      }
    }
  } catch (error) {
    const debugArtifacts = await saveDebugArtifacts(page, options, "run-error");
    if (debugArtifacts) {
      console.error(`Saved debug screenshot: ${debugArtifacts.screenshotPath}`);
      console.error(`Saved debug html: ${debugArtifacts.htmlPath}`);
    }
    throw error;
  } finally {
    await context.close();
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const options = validateOptions(parsed);
  await withTimeout(
    run(options),
    options.runTimeoutMs,
    `Script timed out after ${options.runTimeoutMs} ms. Check current progress and rerun.`,
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(`[modelscope-auto-submit] ${error.message}`);
    if (error.cause) {
      console.error(error.cause);
    }
    process.exitCode = 1;
  });
}
