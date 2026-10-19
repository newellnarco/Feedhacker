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
import hashlib
import pathlib
import sys

IDENTICAL = ["GEMINI.md", "GROK.md", ".grok/GROK.md", ".gemini/settings.json", "tools/agent_pointers.py", "tools/agent_route.py", "docs/agents/fleet-topics.json"]
BANNERS = {"CLAUDE.md": "@AGENTS.md",
           ".github/copilot-instructions.md": "starts at [`AGENTS.md`](../AGENTS.md)"}
TABLE = "Every AI agent reads this file first"

def agent_table(text):
    """The agent table's rows, which every fleet repo carries word for word."""
    lines = text.splitlines()
    head = "| agent | its own file | what that file does |"
    if head not in lines:
        return None
    rows = []
    for line in lines[lines.index(head):]:
        if not line.startswith("|"):
            break
        rows.append(line)
    return "\n".join(rows)

def check(root):
    root, bad = pathlib.Path(root), []
    if not (root / "AGENTS.md").is_file():
        return "no AGENTS.md"
    try:
        agents = (root / "AGENTS.md").read_text(encoding="utf-8")
        banners = {f: (root / f).read_text(encoding="utf-8") if (root / f).is_file() else None for f in BANNERS}
        hashes = {f: hashlib.sha256((root / f).read_bytes()).hexdigest() for f in IDENTICAL if (root / f).is_file()}
    except (OSError, UnicodeDecodeError) as e:
        return f"a pointer file is unreadable ({type(e).__name__})"
    table = agent_table(agents)
    if TABLE not in agents or table is None:
        bad.append("AGENTS.md: missing the agent table")
    for f, needle in BANNERS.items():
        if banners[f] is None or needle not in "".join(banners[f].splitlines(True)[:6]):
            bad.append(f"{f}: missing the AGENTS.md banner near the top")
    bad += [f"{f}: missing" for f in IDENTICAL if f not in hashes]
    return bad, hashes, table

def main(argv):
    roots = [pathlib.Path(__file__).resolve().parent.parent]
    if "--fleet" in argv:
        roots += [pathlib.Path(a) for a in argv[argv.index("--fleet") + 1:]]
    first, first_table, rc = None, None, 0
    for r in roots:
        res = check(r)
        if isinstance(res, str):
            print(f"UNKNOWN {r}: {res}, could not look")
            rc = max(rc, 2)
            continue
        bad, h, table = res
        if first is None:
            first, first_table = h, table
        bad += [f"{f}: differs from {roots[0].name}" for f in h if first.get(f) not in (None, h[f])]
        if table != first_table:
            bad.append(f"AGENTS.md: agent table differs from {roots[0].name}")
        for b in bad:
            print(f"DRIFT {r.name}: {b}")
        rc = max(rc, 1 if bad else 0)
        if not bad:
            print(f"ok {r.name}")
    return rc

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
