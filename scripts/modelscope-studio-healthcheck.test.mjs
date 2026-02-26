import test from "node:test";
import assert from "node:assert/strict";

import {
  extractLatestLogLines,
  parseHealthcheckArgs,
  validateHealthcheckOptions,
} from "./modelscope-studio-healthcheck.mjs";

test("parseHealthcheckArgs parses key/value and boolean flags", () => {
  const args = parseHealthcheckArgs([
    "--studio-url",
    "https://modelscope.cn/studios/foo/bar",
    "--latest-log-count",
    "12",
    "--check-frontend",
    "--browser-channel",
    "chrome",
    "--timeout-ms",
    "25000",
    "--output-json",
    "output/report.json",
    "--headed",
  ]);

  assert.equal(args.studioUrl, "https://modelscope.cn/studios/foo/bar");
  assert.equal(args.latestLogCount, "12");
  assert.equal(args.checkFrontend, true);
  assert.equal(args.browserChannel, "chrome");
  assert.equal(args.timeoutMs, "25000");
  assert.equal(args.outputJson, "output/report.json");
  assert.equal(args.headed, true);
});

test("extractLatestLogLines keeps only timestamp log lines and slices from tail", () => {
  const text = [
    "日志",
    "[2026-02-27 00:07:16] [/bin/sh]: line-1",
    "random line",
    "[2026-02-27 00:07:20] [/bin/sh]: line-2",
    "[2026-02-27 00:08:29] [/bin/sh]: line-3",
  ].join("\n");

  const result = extractLatestLogLines(text, 2);
  assert.deepEqual(result, [
    "[2026-02-27 00:07:20] [/bin/sh]: line-2",
    "[2026-02-27 00:08:29] [/bin/sh]: line-3",
  ]);
});

test("validateHealthcheckOptions validates and normalizes options", () => {
  const options = validateHealthcheckOptions({
    studioUrl: "https://modelscope.cn/studios/foo/bar",
    latestLogCount: "10",
    checkFrontend: true,
    timeoutMs: "22000",
    browserChannel: "edge",
    userDataDir: "output/playwright/modelscope-profile",
    bboxJson: '[{"label":"cat","bbox":[0,0,1,1]}]',
    outputJson: "output/check/result.json",
  });

  assert.equal(options.studioUrl, "https://modelscope.cn/studios/foo/bar");
  assert.equal(options.latestLogCount, 10);
  assert.equal(options.checkFrontend, true);
  assert.equal(options.timeoutMs, 22000);
  assert.equal(options.browserChannel, "msedge");
  assert.equal(typeof options.userDataDir, "string");
  assert.equal(typeof options.outputJson, "string");
});

test("validateHealthcheckOptions throws when required args are missing", () => {
  assert.throws(() => validateHealthcheckOptions({}), /--studio-url/);
});
