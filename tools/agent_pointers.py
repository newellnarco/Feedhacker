#!/usr/bin/env python3
"""Check the fleet's AI-agent pointer layout. Identical in every fleet repo.

Every agent, browser or app, reaches AGENTS.md through the same files:
  AGENTS.md                         Codex/ChatGPT, Copilot coding agent (native)
  CLAUDE.md                         Claude Code: @AGENTS.md import (a plain link is not loaded)
  GEMINI.md, .gemini/settings.json  Gemini CLI / Code Assist (loads AGENTS.md)
  GROK.md, .grok/GROK.md           Grok (Grok Build also reads AGENTS.md)
  .github/copilot-instructions.md   Copilot on github.com: banner pointing at AGENTS.md
Pointer files must hash to the values below in every repo (no drift).
Pass --fleet DIR [DIR...] to also compare against other checkouts.
Exit 0 ok, 1 drift, 2 could not look.
"""
import hashlib, pathlib, sys

IDENTICAL = ["GEMINI.md", "GROK.md", ".grok/GROK.md", ".gemini/settings.json", "tools/agent_pointers.py"]
BANNERS = {"CLAUDE.md": "@AGENTS.md",
           ".github/copilot-instructions.md": "starts at [`AGENTS.md`](../AGENTS.md)"}
TABLE = "Every AI agent reads this file first"

def check(root):
    root, bad = pathlib.Path(root), []
    if not (root / "AGENTS.md").is_file():
        return None
    if TABLE not in (root / "AGENTS.md").read_text(encoding="utf-8"):
        bad.append("AGENTS.md: missing the agent table")
    for f, needle in BANNERS.items():
        p = root / f
        if not p.is_file() or needle not in "".join(p.read_text(encoding="utf-8").splitlines(True)[:6]):
            bad.append(f"{f}: missing the AGENTS.md banner near the top")
    hashes = {}
    for f in IDENTICAL:
        p = root / f
        if not p.is_file():
            bad.append(f"{f}: missing")
        else:
            hashes[f] = hashlib.sha256(p.read_bytes()).hexdigest()
    return bad, hashes

def main(argv):
    roots = [pathlib.Path(__file__).resolve().parent.parent]
    if "--fleet" in argv:
        roots += [pathlib.Path(a) for a in argv[argv.index("--fleet") + 1:]]
    first, rc = None, 0
    for r in roots:
        res = check(r)
        if res is None:
            print(f"UNKNOWN {r}: no AGENTS.md, could not look"); rc = max(rc, 2); continue
        bad, h = res
        if first is None:
            first = h
        bad += [f"{f}: differs from {roots[0].name}" for f in h if first.get(f) not in (None, h[f])]
        for b in bad:
            print(f"DRIFT {r.name}: {b}")
        rc = max(rc, 1 if bad else 0)
        if not bad:
            print(f"ok {r.name}")
    return rc

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
