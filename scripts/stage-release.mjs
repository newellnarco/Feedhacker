// Stages the release assets scripts/build-release-vm.mjs built on the `installers` branch, for release.yml to publish.
// One orphan commit, force-written each time: never merged, never based on. GitHub refuses files over 100 MB, so any
// asset over PART_BYTES is split into parts (none is today; the zips are ~150 KB).
//
//   node scripts/stage-release.mjs              stage and force-push (on the commit being released)
//   node scripts/stage-release.mjs --dry-run    write the staged commit locally, do not push
//   node scripts/stage-release.mjs --check DIR  verify a staged checkout in DIR against VERSION and GITHUB_SHA
//                                               (release.yml), then join any parts into DIR/<asset>
//
// manifest.json names the version, the source commit and every asset's size and sha256. release.yml refuses to
// publish anything that does not match the run's commit and the repo's version.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PART_BYTES = 90 * 1024 * 1024;
export const BRANCH = "installers";

/** The assets release.yml publishes (the MSI is built later, on the hosted Windows job). */
export function assetNames(version) {
  return [
    `feedhacker-${version}.zip`,
    `feedhacker-${version}-store.zip`,
    `feedhacker-${version}-win.zip`,
    `feedhacker-${version}-store-submission.zip`,
  ];
}

/** manifest.json and package.json must agree; the version is theirs. */
export function readVersion(root) {
  const m = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version;
  const p = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
  if (!m || m !== p) throw new Error(`manifest.json (${m}) and package.json (${p}) disagree on the version`);
  return m;
}

/** The part names for a file of `size` bytes: one name when it fits, else name.part00, name.part01, … */
export function partNames(name, size) {
  if (size <= PART_BYTES) return [name];
  const n = Math.ceil(size / PART_BYTES);
  return Array.from({ length: n }, (_, i) => `${name}.part${String(i).padStart(2, "0")}`);
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** The manifest for `files` ([{ name, buf }]). */
export function buildManifest({ version, commit, files, built = new Date().toISOString() }) {
  return {
    version,
    commit,
    built,
    by: "scripts/build-release-vm.mjs in the Claude session VM",
    files: files.map(({ name, buf }) => ({ name, size: buf.length, sha256: sha256(buf), parts: partNames(name, buf.length) })),
  };
}

/**
 * Checks a staged manifest against the run. `read(name)` returns a staged file's bytes or null.
 * Returns { errors, files: [{ name, buf }] } with the parts joined; publish only when errors is empty.
 */
export function checkStaged(manifest, { version, commit }, read) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return { errors: ["manifest.json is missing or not an object"], files: [] };
  if (manifest.version !== version) errors.push(`staged assets are ${manifest.version}, the repo is ${version}: build and stage this version`);
  if (manifest.commit !== commit) errors.push(`staged assets were built from ${manifest.commit}, this run is ${commit}: build and stage this commit`);
  const listed = Array.isArray(manifest.files) ? manifest.files : [];
  const want = assetNames(version);
  for (const name of want) if (!listed.some((f) => f && f.name === name)) errors.push(`${name} is not staged`);
  const files = [];
  for (const f of listed) {
    if (!f || !want.includes(f.name)) { errors.push(`unexpected staged file ${f && f.name}`); continue; }
    if (!Array.isArray(f.parts) || f.parts.length === 0) { errors.push(`${f.name} lists no parts`); continue; }
    const bufs = f.parts.map((p) => read(p));
    const missing = f.parts.filter((_, i) => !bufs[i]);
    if (missing.length) { errors.push(`${f.name}: missing ${missing.join(", ")}`); continue; }
    const buf = Buffer.concat(bufs);
    if (buf.length !== f.size) errors.push(`${f.name} is ${buf.length} B, the manifest says ${f.size}`);
    else if (sha256(buf) !== f.sha256) errors.push(`${f.name} sha256 does not match the manifest`);
    else files.push({ name: f.name, buf });
  }
  return { errors, files };
}

function check(dir) {
  const version = process.env.VERSION, commit = process.env.GITHUB_SHA;
  if (!version || !commit) { console.error("::error::--check needs VERSION and GITHUB_SHA"); process.exit(1); }
  const read = (p) => (p && !p.includes("/") && existsSync(path.join(dir, p)) ? readFileSync(path.join(dir, p)) : null);
  let manifest = null;
  try { manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")); } catch { /* reported below */ }
  const { errors, files } = checkStaged(manifest, { version, commit }, read);
  if (errors.length) { for (const e of errors) console.error(`::error::${e}`); process.exit(1); }
  for (const { name, buf } of files) { writeFileSync(path.join(dir, name), buf); console.log(`ok ${name} ${buf.length} B ${sha256(buf)}`); }
}

/** A git caller for `root`. With stdio "inherit" execFileSync returns null: only captured output is trimmed. */
export function gitRunner(root, exec = execFileSync) {
  return (args, opts = {}) => (exec("git", args, { cwd: root, encoding: "utf8", ...opts }) ?? "").trim();
}

/** The file build-release-vm.mjs writes into dist/: the commit the assets were built from. */
export const BUILD_COMMIT_FILE = "BUILD_COMMIT";

/** Why staging must refuse, or null: the assets must come from the commit being staged. */
export function buildCommitProblem(built, head) {
  if (!built) return `dist/${BUILD_COMMIT_FILE} missing: run scripts/build-release-vm.mjs on this commit first`;
  if (built !== head) return `dist/ was built from ${built}, but HEAD is ${head}: rebuild with scripts/build-release-vm.mjs`;
  return null;
}

function stage(root, push) {
  const git = gitRunner(root);
  const fail = (msg) => { console.error(`stage-release: ${msg}`); process.exit(1); };
  if (git(["status", "--porcelain", "--untracked-files=no"])) fail("the checkout has uncommitted changes: build from the commit being released");
  const version = readVersion(root);
  const files = assetNames(version).map((name) => {
    const p = path.join(root, "dist", name);
    if (!existsSync(p)) fail(`dist/${name} missing: run scripts/build-release-vm.mjs first`);
    return { name, buf: readFileSync(p) };
  });
  const commit = git(["rev-parse", "HEAD"]);
  const builtFile = path.join(root, "dist", BUILD_COMMIT_FILE);
  const problem = buildCommitProblem(existsSync(builtFile) ? readFileSync(builtFile, "utf8").trim() : "", commit);
  if (problem) fail(problem);
  const manifest = buildManifest({ version, commit, files });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "stage-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, "index") };
  const add = (name, buf) => {
    const blob = git(["hash-object", "-w", "--stdin"], { input: buf });
    git(["update-index", "--add", "--cacheinfo", `100644,${blob},${name}`], { env });
  };
  for (const [i, f] of files.entries()) {
    manifest.files[i].parts.forEach((p, j) => add(p, f.buf.subarray(j * PART_BYTES, (j + 1) * PART_BYTES)));
  }
  add("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  const tree = git(["write-tree"], { env });
  const staged = git(["commit-tree", tree, "-m", `release assets ${version} from ${commit}`]);
  rmSync(tmp, { recursive: true, force: true });
  if (!push) { console.log(`stage-release: dry run, staged commit ${staged} (not pushed)`); return; }
  git(["push", "--force", "origin", `${staged}:refs/heads/${BRANCH}`], { stdio: "inherit" });
  console.log(`stage-release: ${version} from ${commit} staged on ${BRANCH}; now run the Release workflow`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  if (args[0] === "--check") check(path.resolve(args[1] || "staged"));
  else stage(root, !args.includes("--dry-run"));
}
