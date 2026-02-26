import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  analyzeDeployLog,
  applyKnownAutoFixes,
  inferCreatePageState,
  parseArgs,
  validateOptions,
} from "./modelscope-auto-submit.mjs";

test("parseArgs parses key/value and boolean flags", () => {
  const args = parseArgs([
    "--project-path",
    "E:/workspace/github/mind-ai",
    "--english-name",
    "mind-ai",
    "--chinese-name",
    "mind-ai-cn",
    "--description",
    "AI app",
    "--visibility",
    "private",
    "--auto-submit",
    "--monitor-deploy",
    "--auto-fix",
    "--browser-channel",
    "chrome",
    "--run-timeout-ms",
    "900000",
    "--prompt-timeout-ms",
    "120000",
    "--deploy-timeout-ms",
    "600000",
    "--log-poll-interval-ms",
    "4000",
    "--headed",
  ]);

  assert.equal(args.projectPath, "E:/workspace/github/mind-ai");
  assert.equal(args.englishName, "mind-ai");
  assert.equal(args.chineseName, "mind-ai-cn");
  assert.equal(args.description, "AI app");
  assert.equal(args.visibility, "private");
  assert.equal(args.autoSubmit, true);
  assert.equal(args.monitorDeploy, true);
  assert.equal(args.autoFix, true);
  assert.equal(args.browserChannel, "chrome");
  assert.equal(args.runTimeoutMs, "900000");
  assert.equal(args.promptTimeoutMs, "120000");
  assert.equal(args.deployTimeoutMs, "600000");
  assert.equal(args.logPollIntervalMs, "4000");
  assert.equal(args.headed, true);
});

test("validateOptions throws when required args are missing", () => {
  assert.throws(
    () =>
      validateOptions({
        englishName: "mind-ai",
      }),
    /Missing required option: --project-path/,
  );
});

test("validateOptions normalizes and validates options", () => {
  const options = validateOptions({
    projectPath: ".",
    englishName: "mind-ai",
    chineseName: "mind-ai-cn",
    description: "AI app",
    visibility: "public",
    timeoutMs: "120000",
    promptTimeoutMs: "120000",
    runTimeoutMs: "900000",
    deployTimeoutMs: "480000",
    logPollIntervalMs: "3000",
    browserChannel: "chrome",
    headed: true,
    autoSubmit: true,
    monitorDeploy: true,
    autoFix: true,
  });

  assert.equal(typeof options.projectPath, "string");
  assert.equal(options.englishName, "mind-ai");
  assert.equal(options.visibility, "public");
  assert.equal(options.timeoutMs, 120000);
  assert.equal(options.promptTimeoutMs, 120000);
  assert.equal(options.runTimeoutMs, 900000);
  assert.equal(options.deployTimeoutMs, 480000);
  assert.equal(options.logPollIntervalMs, 3000);
  assert.equal(options.browserChannel, "chrome");
  assert.equal(options.headed, true);
  assert.equal(options.autoSubmit, true);
  assert.equal(options.monitorDeploy, true);
  assert.equal(options.autoFix, true);
});

test("analyzeDeployLog detects known issues from deployment logs", () => {
  const logText = `
    Starting container...
    /bin/sh: docker-entrypoint.sh: not found
    Build failed
  `;

  const analysis = analyzeDeployLog(logText);

  assert.equal(analysis.hasErrors, true);
  assert.equal(analysis.issues.length > 0, true);
  assert.equal(analysis.issues.some((x) => x.id === "docker-entrypoint-not-found"), true);
});

test("applyKnownAutoFixes patches Dockerfile for docker-entrypoint issue", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-deploy-"));
  const dockerfilePath = path.join(tmpDir, "Dockerfile");

  fs.writeFileSync(
    dockerfilePath,
    [
      "FROM python:3.10-slim",
      "WORKDIR /app",
      "COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh",
      'ENTRYPOINT ["docker-entrypoint.sh"]',
      'CMD ["python", "app.py"]',
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await applyKnownAutoFixes({
    projectPath: tmpDir,
    issues: [{ id: "docker-entrypoint-not-found" }],
  });
  const updated = fs.readFileSync(dockerfilePath, "utf8");

  assert.equal(result.applied.some((x) => x.id === "docker-entrypoint-not-found"), true);
  assert.match(updated, /ENTRYPOINT \["\/usr\/local\/bin\/docker-entrypoint\.sh"\]/);
  assert.match(updated, /sed -i 's\/\\r\$\/\/'/);
});

test("inferCreatePageState identifies login page by url/text", () => {
  const state = inferCreatePageState({
    url: "https://modelscope.cn/login",
    bodyText: "请先登录后继续",
  });

  assert.equal(state.state, "login_required");
});

test("inferCreatePageState identifies create form by common labels", () => {
  const state = inferCreatePageState({
    url: "https://modelscope.cn/studios/create?template=quick",
    bodyText: "空间英文名称 空间中文名称 描述",
  });

  assert.equal(state.state, "create_form_ready");
});
