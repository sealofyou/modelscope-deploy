import test from "node:test";
import assert from "node:assert/strict";

import {
  parseArgs,
  resolveBrowserExecutable,
  validateOptions,
} from "./open-modelscope-login.mjs";

test("parseArgs parses browser options", () => {
  const args = parseArgs([
    "--browser-channel",
    "chrome",
    "--user-data-dir",
    "./tmp-profile",
    "--create-url",
    "https://modelscope.cn/studios/create?template=quick",
  ]);

  assert.equal(args.browserChannel, "chrome");
  assert.equal(args.userDataDir, "./tmp-profile");
  assert.equal(args.createUrl, "https://modelscope.cn/studios/create?template=quick");
});

test("resolveBrowserExecutable throws for unsupported channel", () => {
  assert.throws(() => resolveBrowserExecutable("firefox"), /Unsupported --browser-channel/);
});

test("validateOptions resolves executable and profile path", () => {
  const options = validateOptions({
    browserChannel: "chrome",
    userDataDir: "./output/playwright/modelscope-profile",
  });

  assert.equal(options.browserChannel, "chrome");
  assert.equal(typeof options.executable, "string");
  assert.equal(options.executable.length > 0, true);
  assert.equal(options.userDataDir.includes("output"), true);
});
