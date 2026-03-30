#!/usr/bin/env node
const { execFileSync } = require("child_process");
const process = require("process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const semver = require("semver");

const usage = () => {
  console.log("local-dependencies install");
  console.log("add properties to your package.json:");
  console.log(`"localDependencies": {
    "localPath": "./npm-deps",
    "originalDependencies": {
      "wasabi-logger": "git+ssh://git@github.com:some-user/some-package.git#some-branch"
    }
  }`);
};

const run = (command, args, options = {}) => {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
};

// npm pack --json returns machine-readable metadata. We read the emitted
// filename instead of parsing stdout text heuristically.
const parsePackedFilename = (output) => {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error("npm pack returned empty output");
  }

  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0].filename) {
    throw new Error(`unexpected npm pack output: ${trimmed}`);
  }

  return parsed[0].filename;
};

const isGitLikeDependency = (value) => {
  return (
    value.startsWith("git+") ||
    value.startsWith("github:") ||
    value.startsWith("git://") ||
    /^https?:\/\/.+\.git(?:#.*)?$/.test(value) ||
    /^ssh:\/\/.+\.git(?:#.*)?$/.test(value)
  );
};

const isCommitHash = (value) => /^[0-9a-f]{7,40}$/i.test(value);

const splitGitSpec = (value) => {
  const hashIndex = value.lastIndexOf("#");
  const source = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const ref = hashIndex === -1 ? "" : value.slice(hashIndex + 1);
  let cloneUrl = source.startsWith("git+") ? source.slice(4) : source;

  // npm git specs often use "git+ssh://git@github.com:org/repo.git", but for
  // ssh:// URLs git expects a "/" path separator after host, not ":".
  cloneUrl = cloneUrl.replace(/^ssh:\/\/([^@]+@[^/:]+):(.+)$/, "ssh://$1/$2");

  return { cloneUrl, ref };
};

const packRegularDependency = (pkgString, localPath) => {
  const output = run("npm", ["pack", "--json", "--pack-destination", localPath, pkgString]);
  return parsePackedFilename(output);
};

const cloneGitSource = (cloneUrl, ref, repoDir) => {
  if (!ref) {
    // No ref specified: shallow clone default branch for speed.
    run("git", ["clone", "--depth", "1", cloneUrl, repoDir]);
    return;
  }

  if (isCommitHash(ref)) {
    // A commit SHA cannot be used with --branch; clone full history and checkout.
    run("git", ["clone", cloneUrl, repoDir]);
    run("git", ["checkout", ref], { cwd: repoDir });
    return;
  }

  // Branch/tag refs can be shallow-cloned directly.
  run("git", ["clone", "--depth", "1", "--branch", ref, cloneUrl, repoDir]);
};

const packGitDependency = (pkgString, localPath) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-dependencies-"));

  try {
    const repoDir = path.join(tempDir, "repo");
    const { cloneUrl, ref } = splitGitSpec(pkgString);

    cloneGitSource(cloneUrl, ref, repoDir);
    // Install dev deps before pack so prepack/build scripts can generate dist
    // and declaration files that package entrypoints may reference.
    run("npm", ["install", "--include=dev", "--ignore-scripts=false"], { cwd: repoDir });

    const output = run("npm", ["pack", "--json", "--pack-destination", localPath, "."], {
      cwd: repoDir,
    });

    return parsePackedFilename(output);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

const packDependency = (pkgValue, pkgString, localPath) => {
  if (isGitLikeDependency(pkgValue)) {
    return packGitDependency(pkgString, localPath);
  }

  return packRegularDependency(pkgString, localPath);
};

const installPackedDependency = (cwd, localPath, packedFilename) => {
  const packedPath = path.join(localPath, packedFilename);
  // Force keeps the local tarball install deterministic even if npm would
  // otherwise preserve an older locked resolution.
  run("npm", ["i", "--force", packedPath], { cwd });
};

const getPackageString = (name, value) => {
  if (semver.valid(value)) {
    return `${name}@${semver.clean(value)}`;
  }

  return value;
};

const main = () => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] !== "install") {
    usage();
    process.exit(1);
  }

  if (!fs.existsSync("./package.json")) {
    console.error("failed to open package.json");
    usage();
    process.exit(1);
  }

  const cwd = process.cwd();
  const packageJson = require(path.join(cwd, "package.json"));
  const localDependencies = packageJson.localDependencies;

  if (!localDependencies || typeof localDependencies !== "object") {
    console.error("missing localDependencies property");
    usage();
    process.exit(1);
  }
  if (!localDependencies.localPath) {
    console.error("missing localPath property");
    usage();
    process.exit(1);
  }
  if (!localDependencies.originalDependencies || typeof localDependencies.originalDependencies !== "object") {
    console.error("missing originalDependencies property");
    usage();
    process.exit(1);
  }

  const localPath = path.resolve(cwd, path.normalize(localDependencies.localPath));
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }

  console.log("fetching packages");

  for (const [pkgName, pkgValue] of Object.entries(localDependencies.originalDependencies)) {
    const pkgString = getPackageString(pkgName, pkgValue);
    console.log("name:", pkgName, "value:", pkgValue, "result:", pkgString);

    try {
      const packedFilename = packDependency(pkgValue, pkgString, localPath);
      console.log("fetched:", packedFilename, "installing...");

      installPackedDependency(cwd, localPath, packedFilename);
      console.log("installed:", pkgName);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error(`failed to process local dependency ${pkgString}: ${message}`);
    }
  }
};

module.exports = {
  splitGitSpec,
};

if (require.main === module) {
  main();
}
