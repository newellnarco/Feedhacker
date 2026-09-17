// Assemble the exact text to paste into the Chrome Web Store "Description" field:
// the listing's detailed description, followed by a "What's new" block built from the most
// recent entries in store/release-notes.md.
//
// Why this exists: the store has no per-version release-notes field, so "what changed in this
// version" can only reach users inside the description. Doing that by hand means the listing
// drifts from what actually shipped — which is exactly what happened to the screenshots.
// `npm run store:notes` prints the text and writes dist/store-description.txt.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const VERSIONS_SHOWN = 3;          // enough to show momentum, short enough that nobody scrolls past it

const version = JSON.parse(read("manifest.json")).version;

// The description lives between "### Detailed description" and the next "## " heading.
function detailedDescription() {
  const src = read("store/listing.md");
  const m = src.match(/### Detailed description\n([\s\S]*?)\n## /);
  if (!m) throw new Error("store/listing.md: could not find the '### Detailed description' section");
  return m[1].trim();
}

// Each "## <version>" heading in store/release-notes.md, in file order (newest first).
// Split rather than one lazy regex: `(?=\n## \d|\s*$)` with the /m flag ends at the first
// line break, because /m makes `$` mean end-of-LINE — every note came back empty.
export function releaseNotes(src = read("store/release-notes.md")) {
  const body = src.split(/\n---\n/).slice(1).join("\n---\n");   // drop the maintenance preamble
  return body
    .split(/^## /m)
    .map((chunk) => chunk.match(/^(\d+\.\d+\.\d+)\s*\n([\s\S]*)$/))
    .filter(Boolean)
    .map((m) => ({ version: m[1], note: m[2].trim() }))
    .filter((n) => n.note.length > 0);
}

function build() {
  const notes = releaseNotes();
  if (!notes.length) throw new Error("store/release-notes.md: no version entries found");
  if (!notes.some((n) => n.version === version)) {
    throw new Error(
      `store/release-notes.md has no entry for ${version} (the version in manifest.json).\n` +
      `Add a "## ${version}" section describing what a USER will notice, newest first.`
    );
  }
  const whatsNew = notes.slice(0, VERSIONS_SHOWN)
    .map((n) => `v${n.version}\n${n.note}`)
    .join("\n\n");
  return `${detailedDescription()}\n\n———\nWHAT'S NEW\n\n${whatsNew}\n`;
}

if (process.argv[1] && process.argv[1].endsWith("store-notes.mjs")) {
  const text = build();
  const out = path.join(ROOT, "dist", "store-description.txt");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  process.stdout.write(text + `\n[written to dist/store-description.txt — paste into the dashboard's Description field]\n`);
}

export { build, detailedDescription, version };
