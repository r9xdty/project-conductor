# project-conductor

**Install as many Agent Skills as you like, but load only the ones the current project phase needs.**

Each skill you install adds its name and description to your agent's context in every session. With hundreds of skills, that costs context and makes the agent trigger the wrong skill. project-conductor keeps the library in a vault the agent never scans. Your planning and reasoning skills stay always on. Everything else is linked into a project only for the phase you are working on.

It works with Claude Code, OpenAI Codex CLI, Gemini CLI, Kimi Code CLI, Cursor, GitHub Copilot, OpenCode, Windsurf, Goose, Cline, Roo Code, Amp, Qwen Code, Kiro, and any other agent that reads `SKILL.md` from `.agents/skills`.

```
~/.skill-vault/              ← your whole library, invisible to agents
your-project/
  .agents/skills/<skill>     ← links to the active phase's skills (read by most agents)
  .claude/skills/<skill>     ← same links, for agents that don't read .agents (Claude, Qwen, Kiro)
  AGENTS.md / CLAUDE.md ...  ← small managed block: reasoning protocol + active phase
  .conductor/roadmap.md      ← every phase with its active set and candidate pool
```

## How it works

1. **Ingest (once).** Non-core skills and subagents move from your agents' global skill folders into `~/.skill-vault`. Core skills (planning, brainstorming, debugging…) stay where they are. Every move is logged, and `restore` puts everything back.
2. **Setup (once per project).** Your agent reads the project, plans *all* phases (including ones you haven't reached yet), and reads the description of every vaulted skill once. For each phase it picks an **active set** (at most 15) and a **candidate pool** (up to 25 that may help later). You approve, and the first phase is activated.
3. **Phase switch.** The agent reviews the next phase's pool together with any skills you installed since the setup scan, re-picks the active set, and re-links. Start a new session to load it.

Nothing is deleted. conductor removes only the links it created. The local links are added to `.git/info/exclude`, and Claude plugin toggles go to `.claude/settings.local.json`, so your repository and your teammates are not affected.

## Install

Requires Node.js 18.17 or newer. The CLI has no dependencies and runs straight from GitHub:

```bash
npx -y github:r9xdty/project-conductor --help
```

Then give your agent the `project-conductor` skill.

**Any SKILL.md agent** (Codex, Gemini CLI, Kimi, Cursor, Copilot, OpenCode, Cline, Goose, Roo, Windsurf…):

```bash
npx skills add r9xdty/project-conductor -g
```

**Claude Code** (plugin, adds `/project-conductor:init`, `:phase`, `:status`):

```
/plugin marketplace add r9xdty/project-conductor
/plugin install project-conductor@project-conductor
```

## Usage

Ask your agent: *"Set up project-conductor for this project."* (in Claude Code: `/project-conductor:init`).

The first time, it runs a dry-run ingest and shows you what would move. Before you approve, open `~/.skill-vault/config.json` and list your always-on skills:

```json
{
  "core_skills": ["brainstorming", "writing-plans", "systematic-debugging", "*-reasoning"],
  "core_agents": [],
  "core_plugins": ["project-conductor", "superpowers"],
  "max_skills_per_phase": 15
}
```

Names match exactly. Use `*` for a wildcard.

To switch phases later, say *"Switch to the frontend phase"* (in Claude Code: `/project-conductor:phase frontend`), then start a new session.

### CLI reference

| Command | What it does |
|---|---|
| `agents` | Detected agents and the folders they use |
| `ingest [--apply] [--disable-claude-plugins]` | Move non-core items to the vault (dry run without `--apply`) |
| `restore [name…]` | Undo ingest |
| `dump [--kind skill\|agent]` | One line per indexed item, for the one-time full scan |
| `candidates "<keywords>"` | Keyword search over the vault |
| `set-phase <name> --skills … --pool … [--activate]` | Define or update a phase |
| `phase [name]` | Activate a phase (no name: list phases) |
| `review <name>` | Saved set, pool, and skills added since the last scan |
| `off` | Remove everything conductor added to this project |
| `status` | Library and project summary |

Environment overrides: `CONDUCTOR_HOME`, `CONDUCTOR_VAULT`, `CONDUCTOR_PROJECT`, `CLAUDE_CONFIG_DIR`.

## Supported agents

| Agent | Global skill folders vaulted | Project activation | Instruction file | Status |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills`, `~/.claude/agents`, plugins | `.claude/skills`, `.claude/agents`, `settings.local.json` | `CLAUDE.md` | **Tested** |
| Shared alias | `~/.agents/skills`, `~/.config/agents/skills` | `.agents/skills` | `AGENTS.md` | Tested (filesystem) |
| Codex CLI | `~/.codex/skills` | `.agents/skills` | `AGENTS.md` | Per docs |
| Gemini CLI | `~/.gemini/skills` | `.agents/skills` | `GEMINI.md` | Per docs |
| Kimi Code CLI | `~/.kimi/skills` | `.agents/skills` | `AGENTS.md` | Per docs |
| Cursor | `~/.cursor/skills` | `.agents/skills` | `AGENTS.md` | Per docs |
| GitHub Copilot | `~/.copilot/skills` | `.agents/skills` | `AGENTS.md` | Per docs |
| OpenCode | `~/.config/opencode/skills` | `.agents/skills` | `AGENTS.md` | Per docs |
| Windsurf / Devin | `~/.codeium/windsurf/skills` | `.agents/skills` | `AGENTS.md` | Per docs |
| Goose, Cline, Roo Code, Amp | their `skills` folders | `.agents/skills` | `AGENTS.md` | Per docs |
| Qwen Code | `~/.qwen/skills` | `.qwen/skills` | `QWEN.md` | Per docs |
| Kiro | `~/.kiro/skills` | `.kiro/skills` | `.kiro/steering/project-conductor.md` | Per docs |

"Per docs" means the paths come from each agent's documentation and the [vercel-labs/skills](https://github.com/vercel-labs/skills) registry, but they have not been run end to end yet. Reports and PRs are welcome; adapters live in [`src/agents.js`](src/agents.js).

Agents are detected by their home folder (`~/.codex`, `~/.gemini`, …). Only detected agents get project links and instruction files.

## Security

- Skill descriptions come from third parties. `dump`, `candidates` and `review` wrap them in `UNTRUSTED SKILL METADATA` markers, and the skill tells the agent never to act on instructions found inside them.
- Item names are validated (`[A-Za-z0-9._:@-]`). Items with other characters are hidden from the agent, and the CLI rejects them, so a crafted name cannot become a shell command.
- conductor never deletes a real directory. It removes only links it created and recorded.
- Global Claude settings are changed only with `--disable-claude-plugins`, and are backed up first. Plugins also carry MCP servers and hooks, so this is opt-in.

## Limitations

- Agents read skills at session start. Start a new session after switching phases (Claude Code: `/reload-plugins`).
- Turning plugins on and off per phase is supported only for Claude Code. Gemini extensions and Codex plugins are not managed yet.
- Agents' built-in per-skill disable settings are not used, because they are global rather than per project. The vault approach works the same way everywhere.
- The managed block in `AGENTS.md`/`CLAUDE.md` changes when you switch phases. Run `off` before committing if you don't want it in the repo.

## Development

```bash
npm test        # node:test, uses temporary HOME and project folders
```

Design notes: [`docs/specs`](docs/specs).

## License

MIT © Mustafa Altuntaş
