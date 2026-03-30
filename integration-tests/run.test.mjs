import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

const writeJson = (filePath, value) => {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const initGitRepo = (repoDir) => {
  run("git", ["init", "-q"], { cwd: repoDir });
  run("git", ["config", "user.email", "itest@example.com"], { cwd: repoDir });
  run("git", ["config", "user.name", "itest"], { cwd: repoDir });
  run("git", ["config", "commit.gpgsign", "false"], { cwd: repoDir });
};

const firstTgz = (depsDir, pkgName) => {
  const entries = readdirSync(depsDir).filter((entry) => entry.startsWith(`${pkgName}-`) && entry.endsWith(".tgz"));
  assert.ok(entries.length > 0, `no ${pkgName} tarball produced`);
  return path.join(depsDir, entries[0]);
};

const runInstaller = (consumerDir) => {
  run("node", [path.join(ROOT_DIR, "src", "index.js"), "install"], { cwd: consumerDir });
};

const listTar = (tgzFile) => run("tar", ["-tzf", tgzFile]);
const extractTarFile = (tgzFile, innerPath) => run("tar", ["-xOf", tgzFile, innerPath]);

const setupBasePackage = (repoDir, buildScriptBody) => {
  writeJson(path.join(repoDir, "package.json"), {
    name: "itest-logger",
    version: "1.0.0",
    main: "dist/logger.js",
    types: "dist/index.d.ts",
    files: ["dist", "README.md", "package.json"],
    scripts: {
      prepack: "node build.js",
    },
  });
  writeFileSync(path.join(repoDir, "build.js"), buildScriptBody);
  writeFileSync(path.join(repoDir, "README.md"), "# Integration Test Logger\n");
};

const withTempDir = (prefix, fn) => {
  const workDir = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return fn(workDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};

test("git dependency prepack includes dist files", () => {
  withTempDir("offdep-itest-prepack-", (workDir) => {
    const srcRepo = path.join(workDir, "itest-logger");
    const consumer = path.join(workDir, "consumer");

    mkdirSync(srcRepo, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    setupBasePackage(
      srcRepo,
      [
        "const fs = require(\"fs\");",
        "fs.mkdirSync(\"dist\", { recursive: true });",
        "fs.writeFileSync(\"dist/logger.js\", \"module.exports = { ok: true };\\n\");",
        "fs.writeFileSync(\"dist/index.d.ts\", \"export declare const ok: boolean;\\n\");",
        "",
      ].join("\n")
    );

    initGitRepo(srcRepo);
    run("git", ["add", "."], { cwd: srcRepo });
    run("git", ["commit", "-q", "-m", "init"], { cwd: srcRepo });

    writeJson(path.join(consumer, "package.json"), {
      name: "consumer-itest",
      version: "1.0.0",
      localDependencies: {
        localPath: "./npm-deps",
        originalDependencies: {
          "itest-logger": `git+file://${srcRepo}`,
        },
      },
    });

    runInstaller(consumer);

    const tgzFile = firstTgz(path.join(consumer, "npm-deps"), "itest-logger");
    const tarList = listTar(tgzFile);

    assert.ok(tarList.includes("package/dist/logger.js"), "missing package/dist/logger.js in packed tarball");
    assert.ok(tarList.includes("package/dist/index.d.ts"), "missing package/dist/index.d.ts in packed tarball");
  });
});

test("git SHA ref resolves pinned commit", () => {
  withTempDir("offdep-itest-sha-", (workDir) => {
    const srcRepo = path.join(workDir, "itest-logger");
    const consumer = path.join(workDir, "consumer");

    mkdirSync(srcRepo, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    setupBasePackage(
      srcRepo,
      [
        "const fs = require(\"fs\");",
        "const version = fs.readFileSync(\"version.txt\", \"utf8\").trim();",
        "fs.mkdirSync(\"dist\", { recursive: true });",
        "fs.writeFileSync(\"dist/logger.js\", `module.exports = { version: \\\"${version}\\\" };\\n`);",
        "fs.writeFileSync(\"dist/index.d.ts\", \"export declare const version: string;\\n\");",
        "",
      ].join("\n")
    );

    initGitRepo(srcRepo);

    writeFileSync(path.join(srcRepo, "version.txt"), "v1\n");
    run("git", ["add", "."], { cwd: srcRepo });
    run("git", ["commit", "-q", "-m", "v1"], { cwd: srcRepo });
    const shaV1 = run("git", ["rev-parse", "HEAD"], { cwd: srcRepo }).trim();

    writeFileSync(path.join(srcRepo, "version.txt"), "v2\n");
    run("git", ["add", "version.txt"], { cwd: srcRepo });
    run("git", ["commit", "-q", "-m", "v2"], { cwd: srcRepo });

    writeJson(path.join(consumer, "package.json"), {
      name: "consumer-itest-sha",
      version: "1.0.0",
      localDependencies: {
        localPath: "./npm-deps",
        originalDependencies: {
          "itest-logger": `git+file://${srcRepo}#${shaV1}`,
        },
      },
    });

    runInstaller(consumer);

    const tgzFile = firstTgz(path.join(consumer, "npm-deps"), "itest-logger");
    const loggerJs = extractTarFile(tgzFile, "package/dist/logger.js");

    assert.ok(loggerJs.includes('version: "v1"'), "packed artifact does not match pinned SHA content");
  });
});
