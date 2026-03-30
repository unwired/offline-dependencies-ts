import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { splitGitSpec } = require(path.join(__dirname, "..", "src", "index.js"));

test("normalizes git+ssh github spec for git clone", () => {
  const { cloneUrl, ref } = splitGitSpec("git+ssh://git@github.com:unwired/wasabi-logger-js.git#master");

  assert.equal(cloneUrl, "ssh://git@github.com/unwired/wasabi-logger-js.git");
  assert.equal(ref, "master");
});
