// Builds every FeedHacker release asset in the Claude session's Linux VM (owner, 2026-10-21: "no builds on the pc for
// any repo", "no js bundles on the pc either. just build in claude's vm"). Nothing here runs on a runner.
//
//   node scripts/build-release-vm.mjs     (on a clean checkout of the commit to release)
//
// It runs the normal build (scripts/build.mjs) and checks that every asset release.yml publishes exists. The MSI is
// NOT built here: installer/windows/feedhacker.wxs is WiX v4 syntax, which msitools' wixl cannot read (it only reads
// WiX v3), so the release workflow's hosted Windows `msi` job still runs `wix build` on these staged files. Then run
// scripts/stage-release.mjs to put the assets on the `installers` branch.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_COMMIT_FILE, assetNames, gitRunner, readVersion } from "./stage-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => { console.error(`build-release-vm: ${msg}`); process.exit(1); };

const version = readVersion(root);
execFileSync(process.execPath, [path.join(root, "scripts", "build.mjs")], { cwd: root, stdio: "inherit" });
for (const name of assetNames(version)) {
  const file = path.join(root, "dist", name);
  if (!existsSync(file)) fail(`dist/${name} was not produced`);
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  console.log(`build-release-vm: ${name}  ${statSync(file).size} B  sha256 ${sha}`);
}
// The commit these assets came from: stage-release.mjs refuses to stage them for any other commit.
const git = gitRunner(root);
if (git(["status", "--porcelain", "--untracked-files=no"])) fail("the checkout has uncommitted changes: build from the commit being released");
writeFileSync(path.join(root, "dist", BUILD_COMMIT_FILE), `${git(["rev-parse", "HEAD"])}\n`);
console.log("build-release-vm: done; now run node scripts/stage-release.mjs");
