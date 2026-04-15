# Helm — Visual Intelligence Layer for Claude Code

> The native Mac desktop app that makes Claude Code visible, orchestrable, and self-aware.

Helm gives Claude Code a beautiful real-time GUI — live hook events, agent genome tracking, autonomous task execution, codebase heat maps, project intelligence reports, and a physics-based visual canvas of your entire agent network. Works with any Claude Code project instantly.

![Helm Screenshot](https://i.imgur.com/AcE139x.png)

---

## Why Helm?

Claude Code is powerful but invisible. You're staring at a terminal not knowing what's happening — which hooks are firing, how full your memory files are, which agents are loaded, what sessions are running. And there's no way to see your agents as a system, run multi-agent workflows autonomously, or understand your project's trajectory over time.

Helm makes all of it visible — and goes further.

---

## Features

### 💬 Chat
Context-aware chat with Claude using your project's `CLAUDE.md` as the system prompt. Claude knows your project conventions, stack, and rules — same context it gets in the terminal. Streaming responses, markdown rendering, token counting, and real-time cost tracking per session.

### 🤖 Agents + Genome
Browse every agent in `.claude/agents/` — project agents and ECC builder sub-agents — with their model and description. The **Agent Genome** tracks each agent's performance over time: usage count, success rate, and total API cost, visualised as bar graphs on each card. Filter by Project, ECC, or top Genome performers.

### 🕸 Orchestrate — Visual Agent Canvas
A physics-based 2D canvas showing your entire agent network as an interactive force graph. Nodes are sized by usage frequency, colored by category (JARVIS=violet, ECC=green, Project=gold), and display a success-rate arc ring. Drag nodes, filter by name, click any agent to open its inspector panel — then launch it directly into chat with one click.

### ⚙️ Dark Factory — Autonomous Task Execution
Describe a goal in plain English. Helm sends it to Claude, which decomposes it into a dependency-aware task graph (DAG) with agent assignments, prompts, and cost estimates. A live SVG visualization shows the graph. Hit Launch and Helm executes every task sequentially, respecting dependencies, streaming output to the execution log in real time.

### 🧠 Cognition — Live Codebase Intelligence
Start watching any project directory. Helm uses `fs.watch` to stream every file change into a live feed with timestamps and file sizes. Click any changed file to run an instant impact analysis — which other files reference it, and a complexity score (lines, functions, depth). Scan your full project for a heat map of file recency, surfacing the hottest and coldest parts of your codebase.

### ✦ Mind Mirror — Project Intelligence Reports
Feed your project's memory files, git history, CLAUDE.md, and agent genome data to Claude for a structured intelligence report. Helm surfaces: project health score, momentum trajectory, risk level, key decisions with impact ratings, detected behavioral patterns, contradictions between memory and practice, high-leverage opportunities, and a weekly narrative briefing — plus suggested additions to your CLAUDE.md.

### 🗄 Memory Health
Visual progress bars for every memory file vs its cap. Spot when `core.md` or `L1-critical-facts.md` is approaching limit before Claude starts summarizing. Click any file to preview its contents inline.

### ⚡ Live Feed
Every hook event from your Claude Code sessions surfaces in real time: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`. Watch your ECC pipeline as it runs.

### 📋 Session Monitor
Live detection of running `claude` processes with PID, CPU, and project directory. Know exactly what's active.

### 📜 Command Log
Live tail of `~/.claude/bash-commands.log` — every tool call, timestamped.

### 💰 Cost Tracker
Token counting and real-time cost estimation for every chat session.

### 🗂 Multi-Project
Auto-detects Claude Code projects on your disk. Switch between them in one click. Helm reloads agents, memory, and CLAUDE.md context instantly.

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
│   ├── agents/            ← Agent definitions (shown in Agents + Orchestrate views)
│   └── settings.json      ← Hooks config (shown in Settings view)
└── memory/                ← Memory files (shown in Memory view, if present)
```

---

## ECC Support

Helm is built to work with [everything-claude-code](https://github.com/affaan-m/everything-claude-code) — the Anthropic hackathon-winning agent harness. If you have ECC installed, Helm surfaces your full 47-agent sub-team, 181 skills, and all hook events in real time. The Orchestrate canvas will show your entire ECC network. The Genome tracker captures every agent invocation. Dark Factory can dispatch goals across your ECC sub-team autonomously.

---

## Helm vs. the alternatives

| Feature | Helm | Opcode |
|---------|------|--------|
| Live ECC hook event feed | ✅ | ❌ |
| Memory file health bars | ✅ | ❌ |
| Agent roster + genome tracking | ✅ | ❌ |
| Visual agent force graph (Orchestrate) | ✅ | ❌ |
| Autonomous multi-agent task runner (Factory) | ✅ | ❌ |
| Live codebase file watcher + heat map (Cognition) | ✅ | ❌ |
| AI project intelligence reports (Mind Mirror) | ✅ | ❌ |
| Multi-project switcher | ✅ | ❌ |
| Context-aware chat (uses CLAUDE.md) | ✅ | ✅ |
| Session cost tracker | ✅ | ❌ |
| Live bash-commands.log tail | ✅ | ❌ |
| Actively maintained | ✅ | ❌ (last update Aug 2025) |

---

## Stack

- **Electron 29** — Native macOS app with vibrancy/glass effects
- **Vanilla JS** — Zero framework dependencies, fast boot
- **Claude API** — Direct streaming via SSE for chat, factory, and mirror
- **Canvas 2D** — Physics simulation for Orchestrate agent graph
- **fs.watch** — Native file system watcher for Cognition
- **No backend** — Everything runs locally. API key stays on your machine.
- **~/.helm-store.json** — Local JSON store for genome data, decisions, and patterns

---

## Roadmap

- [ ] Windows + Linux support
- [ ] Git diff viewer
- [ ] Multiple session windows
- [ ] n8n / workflow integration panel
- [ ] Mobile companion (read-only)
- [ ] Plugin system
- [ ] Genome leaderboard across projects
- [ ] Factory task history and replay
- [ ] Cognition impact graph visualization

---

## Contributing

PRs welcome. Open an issue first for anything major.

---

## License

MIT
