# Read [`AGENTS.md`](../AGENTS.md) first

This file holds no rules. It exists so an AI agent that looks here finds them.
Every AI agent in this repository (Claude, Codex/ChatGPT, Gemini, Grok, Copilot),
in the browser or in an app, starts at [`AGENTS.md`](../AGENTS.md) and follows the
files it lists. When this file and `AGENTS.md` disagree, `AGENTS.md` wins.

The layout is the same in every fleet repository (max3, netsniff,
Maxresearchcollective, Feedhacker, AlienInterface) and is checked by
`tools/agent_pointers.py`, so these files cannot drift.
