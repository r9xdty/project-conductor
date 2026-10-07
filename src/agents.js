// Adapter registry. Paths are relative to HOME (global) or project root (project).
// readsShared: agent reads the cross-agent `.agents/skills` project dir, so no extra project link is needed.
// Sources: vercel-labs/skills src/agents.ts and each agent's docs (see README "Supported agents").

export const AGENTS = [
  { id: 'shared', name: 'Shared (.agents)', detect: null, global: ['.agents/skills', '.config/agents/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'claude', name: 'Claude Code', detect: '.claude', global: ['.claude/skills'], project: '.claude/skills', agentsGlobal: '.claude/agents', agentsProject: '.claude/agents', instructions: 'CLAUDE.md', readsShared: false },
  { id: 'codex', name: 'OpenAI Codex CLI', detect: '.codex', global: ['.codex/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'gemini', name: 'Gemini CLI', detect: '.gemini', global: ['.gemini/skills'], project: '.agents/skills', instructions: 'GEMINI.md', readsShared: true },
  { id: 'kimi', name: 'Kimi Code CLI', detect: '.kimi', global: ['.kimi/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'cursor', name: 'Cursor', detect: '.cursor', global: ['.cursor/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'copilot', name: 'GitHub Copilot', detect: '.copilot', global: ['.copilot/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'opencode', name: 'OpenCode', detect: '.config/opencode', global: ['.config/opencode/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'windsurf', name: 'Windsurf / Devin Desktop', detect: '.codeium/windsurf', global: ['.codeium/windsurf/skills', '.config/devin/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'goose', name: 'Goose', detect: '.config/goose', global: ['.config/goose/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'cline', name: 'Cline', detect: '.cline', global: ['.cline/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'roo', name: 'Roo Code', detect: '.roo', global: ['.roo/skills'], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'amp', name: 'Amp', detect: '.config/amp', global: [], project: '.agents/skills', instructions: 'AGENTS.md', readsShared: true },
  { id: 'qwen', name: 'Qwen Code', detect: '.qwen', global: ['.qwen/skills'], project: '.qwen/skills', instructions: 'QWEN.md', readsShared: false },
  { id: 'kiro', name: 'Kiro', detect: '.kiro', global: ['.kiro/skills'], project: '.kiro/skills', instructions: '.kiro/steering/project-conductor.md', readsShared: false },
];
