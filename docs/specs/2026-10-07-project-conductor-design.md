# project-conductor — design (v0.2)

## Problem
Users install hundreds of Agent Skills. Every installed skill's name+description is loaded into the agent's context at startup, so large libraries cost context and cause wrong-skill triggering. Users want planning/reasoning skills always on and everything else activated per project and per project phase.

## Goals
- One agent-agnostic CLI (`npx -y github:r9xdty/project-conductor`), Node 18+, zero dependencies.
- Works with every agent that reads SKILL.md: shared `.agents/skills` dirs plus per-agent adapters.
- Fully reversible; never deletes user content.

## Components
1. **Vault** `~/.skill-vault/` — `skills/`, `agents/`, `config.json`, `index.json`, `log.json`. Agents do not scan it.
2. **Adapters** (`src/agents.js`) — per agent: global skill dirs, project skill dir, instruction file, detection path.
3. **Index** — name, description, kind, source, plugin, path, first_seen. Unsafe names (outside `[A-Za-z0-9._:@-]`) are excluded and reported.
4. **Ingest / restore** — moves non-core entries from every detected agent's global skill dir into the vault (symlinks moved as links). Logged; `restore` reverses. Dry run by default. Claude plugin disabling is opt-in (`--disable-claude-plugins`).
5. **Project state** `.conductor/state.json` + `.conductor/roadmap.md` — phases (goal, order, active skills/agents/plugins, candidate pool), current phase, managed links, scanned_at.
6. **Activation** — links active skills into `.agents/skills` and into project skill dirs of detected agents that don't read `.agents` (Claude, Qwen, Kiro). Claude subagents into `.claude/agents`. Claude plugins via `.claude/settings.local.json`. All link paths added to `.git/info/exclude`.
7. **Instruction block** — marker-delimited block (reasoning protocol, active phase, roadmap path) in AGENTS.md and the instruction file of each detected agent.
8. **Skill** `skills/project-conductor/SKILL.md` — init / phase-switch workflow for any agent; Claude Code plugin wraps it with slash commands.

## Decisions
- Native per-agent disable settings are not used in v0.2: they are global (not per project), unverified for several agents, and would require writing hundreds of names into config. Vault-move works uniformly. Revisit later.
- No hooks: instruction files are read by every agent; hooks are not.
- Core skills matched by exact name or `*` glob only.

## Security
- Third-party descriptions are data: `dump` output is fenced and labeled untrusted; the skill instructs agents not to follow instructions inside it.
- Names validated before any filesystem or shell use.
- Only links created by conductor are removed; real directories are never deleted.
- Settings written to local-only files; global settings backed up before change.

## Testing
- `node --test` with temporary HOME and project for each command and adapter.
- Skill behavior: subagent run without vs. with SKILL.md on the same task.
