# Helm — Visual Companion for Claude Code

> The native Mac desktop app that Opcode stopped building.

Helm gives Claude Code a beautiful, real-time GUI — live hook events, agent roster, memory health bars, session monitoring, and a context-aware chat window. Works with any Claude Code project instantly.

![Helm Screenshot](assets/screenshot.png)

---

## Why Helm?

Claude Code is powerful but invisible. You're staring at a terminal not knowing what's happening — which hooks are firing, how full your memory files are, which agents are loaded, what sessions are running. Helm makes it visible.

| Feature | Helm | Opcode |
|---------|------|--------|
| Live ECC hook event feed | ✅ | ❌ |
| Memory file health bars | ✅ | ❌ |
| Agent roster browser | ✅ | ❌ |
| Multi-project switcher | ✅ | ❌ |
| Context-aware chat (uses CLAUDE.md) | ✅ | ✅ |
| Session cost tracker | ✅ | ❌ |
| Live bash-commands.log tail | ✅ | ❌ |
| Active maintained | ✅ | ❌ (last update Aug 2025) |

---

## Features

**Live Feed** — Every hook event from your Claude Code sessions surfaces in real time: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`. Watch your ECC pipeline as it runs.

**Agent Roster** — Browse every agent in `.claude/agents/` — project agents and ECC builder sub-agents — with their model, description, and type.

**Memory Health** — Visual progress bars for every memory file vs its cap. Spot when `core.md` or `L1-critical-facts.md` is approaching limit before Claude starts summarizing.

**Context-Aware Chat** — Chat with Claude using your project's `CLAUDE.md` as the system prompt. Claude knows your project conventions, stack, and rules — same context it gets in the terminal.

**Session Monitor** — Live detection of running `claude` processes with PID, CPU, and project directory. Know exactly what's active.

**Command Log** — Live tail of `~/.claude/bash-commands.log` — every tool call, timestamped.

**Cost Tracker** — Token counting and real-time cost estimation for every chat session.

**Multi-Project** — Auto-detects Claude Code projects on your disk. Switch between them in one click. Helm reloads agents, memory, and CLAUDE.md context instantly.

---

## Install

```bash
git clone https://github.com/ChrisJDiMarco/helm
cd helm
npm install
npm start
```

**Requirements:** macOS 12+, Node.js 18+

---

## First-time setup

1. Launch Helm with `npm start`
2. It will auto-detect Claude Code projects on your disk
3. Go to **Settings** and paste your Anthropic API key (`sk-ant-…`)
4. Select a project — Helm reads its `.claude/` directory and `CLAUDE.md`
5. Start chatting, monitoring, and watching hooks fire

---

## What is a Claude Code project?

Any folder with a `.claude/` directory. If you use Claude Code CLI, you already have these. The `.claude/` folder holds your agents, settings, and hooks config.

---

## Project structure

```
your-project/
├── CLAUDE.md              ← Project instructions (used as system prompt in chat)
├── .claude/
│   ├── agents/            ← Agent definitions (shown in Agents view)
│   └── settings.json      ← Hooks config (shown in Settings view)
└── memory/                ← Memory files (shown in Memory view, if present)
```

---

## ECC Support

Helm is built to work with [everything-claude-code](https://github.com/affaan-m/everything-claude-code) — the Anthropic hackathon-winning agent harness. If you have ECC installed, Helm surfaces your full 47-agent sub-team, 181 skills, and all hook events in real time.

---

## Stack

- **Electron 29** — Native macOS app with vibrancy/glass effects
- **Vanilla JS** — Zero framework dependencies, fast boot
- **Claude API** — Direct streaming via SSE
- **No backend** — Everything runs locally. API key stays on your machine.

---

## Roadmap

- [ ] Windows + Linux support
- [ ] Git diff viewer
- [ ] Multiple session windows
- [ ] Workflow/n8n integration panel
- [ ] Mobile companion (read-only)
- [ ] Plugin system

---

## Contributing

PRs welcome. Open an issue first for anything major.

---

## License

MIT
