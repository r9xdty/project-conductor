import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS } from './agents.js';

// ------------------------------------------------------------------ env
export function env(overrides = {}) {
  const home = overrides.home || process.env.CONDUCTOR_HOME || os.homedir();
  const vault = overrides.vault || process.env.CONDUCTOR_VAULT || path.join(home, '.skill-vault');
  const project = path.resolve(overrides.project || process.env.CONDUCTOR_PROJECT || process.cwd());
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return { home, vault, project, claudeDir };
}

export const DEFAULT_CONFIG = {
  // Always-on skills: exact names or globs with "*". They are never moved to the vault.
  core_skills: ['brainstorming', 'writing-plans', 'executing-plans', 'systematic-debugging',
    'verification-before-completion', 'using-superpowers', 'project-conductor'],
  core_agents: [],
  core_plugins: ['project-conductor'],
  max_skills_per_phase: 15,
};

export const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,120}$/;

// ------------------------------------------------------------------ utils
export function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

export function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

export function config(E) {
  return { ...DEFAULT_CONFIG, ...readJson(path.join(E.vault, 'config.json'), {}) };
}

function globToRe(g) {
  return new RegExp('^' + g.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
}

export function matchesAny(name, patterns) {
  return patterns.some((p) => globToRe(p).test(name));
}

export function cleanText(s, max = 300) {
  // eslint-disable-next-line no-control-regex
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function parseFrontmatter(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const meta = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      let v = kv[2].trim();
      if (['|', '>', '|-', '>-'].includes(v)) v = '';
      meta[key] = v.replace(/^["']|["']$/g, '');
    } else if (key && /^\s/.test(line)) {
      meta[key] = `${meta[key]} ${line.trim()}`.trim();
    }
  }
  return meta;
}

function exists(p) {
  try { fs.lstatSync(p); return true; } catch { return false; }
}

function isLink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

function realpath(p) {
  try { return fs.realpathSync(p); } catch { return p; }
}

export function linkDir(target, link) {
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(realpath(target), link, process.platform === 'win32' ? 'junction' : 'dir');
}

export function linkFile(target, link) {
  fs.mkdirSync(path.dirname(link), { recursive: true });
  const t = realpath(target);
  try { fs.symlinkSync(t, link, 'file'); return 'symlink'; } catch { /* windows without dev mode */ }
  try { fs.linkSync(t, link); return 'hardlink'; } catch { /* other volume */ }
  fs.copyFileSync(t, link);
  return 'copy';
}

// Removes only links (or files conductor created). Never removes a real directory.
export function removeManaged(p) {
  if (!exists(p)) return;
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) {
    try { fs.unlinkSync(p); } catch { fs.rmdirSync(p); }
  } else if (st.isFile()) {
    fs.unlinkSync(p);
  } else {
    throw new Error(`refusing to delete real directory ${p}`);
  }
}

// ------------------------------------------------------------------ agents
export function detectedAgents(E) {
  return AGENTS.filter((a) => !a.detect || exists(path.join(E.home, a.detect)));
}

// ------------------------------------------------------------------ claude plugins
export function claudePlugins(E) {
  const out = {};
  const data = readJson(path.join(E.claudeDir, 'plugins', 'installed_plugins.json'), {});
  const plugs = (data && (data.plugins || data)) || {};
  for (const [key, entries] of Object.entries(plugs)) {
    const list = Array.isArray(entries) ? entries : [entries];
    const ip = list.length && list[list.length - 1] && list[list.length - 1].installPath;
    if (ip && exists(ip)) out[key] = ip;
  }
  return out;
}

// ------------------------------------------------------------------ index
function scanSkills(root, source, extra = {}) {
  const items = [];
  let entries = [];
  try { entries = fs.readdirSync(root); } catch { return items; }
  for (const dir of entries.sort()) {
    const p = path.join(root, dir);
    const md = path.join(p, 'SKILL.md');
    if (!exists(md)) continue;
    const fm = parseFrontmatter(md);
    items.push({ kind: 'skill', name: cleanText(fm.name || dir, 140), dir, description: cleanText(fm.description, 400), source, path: p, ...extra });
  }
  return items;
}

function scanAgentFiles(root, source, extra = {}) {
  const items = [];
  let entries = [];
  try { entries = fs.readdirSync(root); } catch { return items; }
  for (const f of entries.sort()) {
    if (!f.endsWith('.md')) continue;
    const p = path.join(root, f);
    const fm = parseFrontmatter(p);
    items.push({ kind: 'agent', name: cleanText(fm.name || f.slice(0, -3), 140), dir: f, description: cleanText(fm.description, 400), source, path: p, ...extra });
  }
  return items;
}

export function buildIndex(E) {
  let items = [
    ...scanSkills(path.join(E.vault, 'skills'), 'vault'),
    ...scanAgentFiles(path.join(E.vault, 'agents'), 'vault'),
  ];
  for (const a of detectedAgents(E)) {
    for (const g of a.global) items.push(...scanSkills(path.join(E.home, g), 'global', { agent: a.id }));
    if (a.agentsGlobal) items.push(...scanAgentFiles(path.join(E.home, a.agentsGlobal), 'global', { agent: a.id }));
  }
  for (const [key, ip] of Object.entries(claudePlugins(E))) {
    if (key.split('@')[0] === 'project-conductor') continue;
    items.push(...scanSkills(path.join(ip, 'skills'), 'plugin', { plugin: key }));
    items.push(...scanAgentFiles(path.join(ip, 'agents'), 'plugin', { plugin: key }));
  }
  // de-duplicate the same real skill reached through several agent dirs
  const seenReal = new Set();
  items = items.filter((it) => {
    const k = `${it.kind}|${realpath(it.path)}`;
    if (seenReal.has(k)) return false;
    seenReal.add(k);
    return true;
  });
  const old = readJson(path.join(E.vault, 'index.json'), { items: [] });
  const firstSeen = new Map(old.items.map((o) => [`${o.kind}|${o.name}|${o.plugin || ''}`, o.first_seen]));
  const now = Date.now();
  for (const it of items) {
    it.safe = SAFE_NAME.test(it.name) && SAFE_NAME.test(it.dir.replace(/\.md$/, ''));
    it.first_seen = firstSeen.get(`${it.kind}|${it.name}|${it.plugin || ''}`) || now;
  }
  writeJson(path.join(E.vault, 'index.json'), { built_at: now, items });
  return items;
}

export function getIndex(E) {
  const d = readJson(path.join(E.vault, 'index.json'), null);
  return d ? d.items : buildIndex(E);
}

// ------------------------------------------------------------------ search
const SYN = {
  backend: 'api server database db rest graphql auth endpoint node express fastapi django supabase postgres sql',
  frontend: 'ui ux react vue svelte css tailwind design component nextjs web page layout',
  mobile: 'flutter dart react-native ios android expo app',
  test: 'testing tdd unit e2e playwright jest pytest qa coverage',
  deploy: 'devops docker kubernetes ci cd vercel cloudflare release infra',
  embedded: 'stm32 firmware mcu can rtos microcontroller hal arduino esp32',
  robotics: 'ros ros2 moveit urdf kinematics robot',
  data: 'analysis pandas sql visualization chart dashboard ml',
  docs: 'documentation readme markdown writing spec',
};
const tok = (s) => (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []);

export function scoreItem(it, query) {
  const q = tok(query);
  const extra = q.flatMap((t) => (SYN[t] ? tok(SYN[t]) : []));
  const nameT = new Set(tok(`${it.name} ${it.plugin || ''}`));
  const descT = new Set(tok(it.description));
  let s = 0;
  for (const t of q) { if (nameT.has(t)) s += 4; if (descT.has(t)) s += 2; }
  for (const t of extra) { if (nameT.has(t)) s += 1.5; if (descT.has(t)) s += 0.7; }
  return s;
}

export function isCoreItem(it, cfg) {
  if (it.kind === 'skill') return it.source === 'global' && matchesAny(it.name, cfg.core_skills);
  if (it.kind === 'agent') return it.source === 'global' && matchesAny(it.name, cfg.core_agents);
  return false;
}

export function candidates(E, query, top = 30) {
  const cfg = config(E);
  return getIndex(E)
    .filter((it) => it.safe && !isCoreItem(it, cfg))
    .map((it) => ({ it, s: scoreItem(it, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, top)
    .map((x) => x.it);
}

// ------------------------------------------------------------------ ingest / restore
export function planIngest(E) {
  const cfg = config(E);
  const plan = [];
  const keep = [];
  for (const a of detectedAgents(E)) {
    const roots = a.global.map((g) => ({ kind: 'skill', src: path.join(E.home, g) }));
    if (a.agentsGlobal) roots.push({ kind: 'agent', src: path.join(E.home, a.agentsGlobal) });
    for (const r of roots) {
      let entries = [];
      try { entries = fs.readdirSync(r.src); } catch { continue; }
      for (const e of entries.sort()) {
        if (e.startsWith('.')) continue;
        const p = path.join(r.src, e);
        let name;
        if (r.kind === 'skill') {
          if (!exists(path.join(p, 'SKILL.md'))) continue;
          name = parseFrontmatter(path.join(p, 'SKILL.md')).name || e;
        } else {
          if (!e.endsWith('.md')) continue;
          name = parseFrontmatter(p).name || e.slice(0, -3);
        }
        const core = matchesAny(name, r.kind === 'skill' ? cfg.core_skills : cfg.core_agents) || matchesAny(e, r.kind === 'skill' ? cfg.core_skills : cfg.core_agents);
        (core ? keep : plan).push({ kind: r.kind, agent: a.id, name, from: p });
      }
    }
  }
  // destination: first copy of a real skill -> vault/<kind>s/<entry>; further links to the same real path -> vault/.links/<agent>/<entry>
  const seen = new Map();
  for (const m of plan) {
    const real = realpath(m.from);
    const base = path.basename(m.from);
    if (seen.has(real)) {
      m.to = path.join(E.vault, '.links', m.agent, `${m.kind}s`, base);
      m.duplicate = true;
    } else {
      let dest = path.join(E.vault, `${m.kind}s`, base);
      if (exists(dest)) dest = path.join(E.vault, `${m.kind}s`, `${m.agent}--${base}`);
      m.to = dest;
      seen.set(real, dest);
    }
  }
  return { plan, keep };
}

function moveEntry(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    if (isLink(from)) {
      fs.symlinkSync(fs.readlinkSync(from), to, fs.statSync(from).isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file');
    } else {
      fs.cpSync(from, to, { recursive: true });
    }
    fs.rmSync(from, { recursive: !isLink(from), force: false });
  }
}

export function applyIngest(E, { disableClaudePlugins = false } = {}) {
  if (!exists(path.join(E.vault, 'config.json'))) writeJson(path.join(E.vault, 'config.json'), DEFAULT_CONFIG);
  const log = readJson(path.join(E.vault, 'log.json'), { moved: [], disabled_plugins: [] });
  const { plan } = planIngest(E);
  const moved = [];
  for (const m of plan) {
    if (exists(m.to)) continue;
    moveEntry(m.from, m.to);
    const rec = { kind: m.kind, agent: m.agent, from: m.from, to: m.to, at: Date.now() };
    log.moved.push(rec);
    moved.push(rec);
  }
  let disabled = [];
  if (disableClaudePlugins) disabled = setClaudeGlobalPlugins(E, log);
  writeJson(path.join(E.vault, 'log.json'), log);
  buildIndex(E);
  return { moved, disabled };
}

export function planClaudePluginDisable(E) {
  const cfg = config(E);
  const settings = readJson(path.join(E.claudeDir, 'settings.json'), {});
  const ep = settings.enabledPlugins || {};
  return Object.keys(claudePlugins(E)).filter((k) => !matchesAny(k, cfg.core_plugins) && !matchesAny(k.split('@')[0], cfg.core_plugins) && ep[k] !== false);
}

function setClaudeGlobalPlugins(E, log) {
  const sp = path.join(E.claudeDir, 'settings.json');
  const list = planClaudePluginDisable(E);
  if (!list.length) return [];
  if (exists(sp)) fs.copyFileSync(sp, `${sp}.conductor-backup-${Date.now()}`);
  const s = readJson(sp, {});
  s.enabledPlugins = s.enabledPlugins || {};
  for (const k of list) { s.enabledPlugins[k] = false; if (!log.disabled_plugins.includes(k)) log.disabled_plugins.push(k); }
  writeJson(sp, s);
  return list;
}

export function restore(E, names = []) {
  const log = readJson(path.join(E.vault, 'log.json'), { moved: [], disabled_plugins: [] });
  const left = [];
  const restored = [];
  const skipped = [];
  for (const m of [...log.moved].reverse()) {
    const base = path.basename(m.from).replace(/\.md$/, '');
    if (names.length && !names.includes(base)) { left.unshift(m); continue; }
    if (exists(m.from)) { skipped.push(m.from); left.unshift(m); continue; }
    if (!exists(m.to)) { skipped.push(m.to); continue; }
    moveEntry(m.to, m.from);
    restored.push(m.from);
  }
  log.moved = left;
  if (!names.length && log.disabled_plugins.length) {
    const sp = path.join(E.claudeDir, 'settings.json');
    const s = readJson(sp, {});
    s.enabledPlugins = s.enabledPlugins || {};
    for (const k of log.disabled_plugins) delete s.enabledPlugins[k];
    writeJson(sp, s);
    log.disabled_plugins = [];
  }
  writeJson(path.join(E.vault, 'log.json'), log);
  buildIndex(E);
  return { restored, skipped };
}

// ------------------------------------------------------------------ project state
const stateFile = (E) => path.join(E.project, '.conductor', 'state.json');

export function loadState(E) {
  return readJson(stateFile(E), { version: 1, phases: {}, current: null, managed: [], claude_plugins: [], scanned_at: 0 });
}

export function saveState(E, st) { writeJson(stateFile(E), st); }

export function validateNames(list) {
  const bad = list.filter((n) => !SAFE_NAME.test(n));
  if (bad.length) throw new Error(`invalid name(s): ${bad.map((b) => JSON.stringify(b)).join(', ')} — names may only contain letters, digits, . _ : @ -`);
  return list;
}

export function setPhase(E, name, opts) {
  validateNames([name]);
  const st = loadState(E);
  const prev = st.phases[name] || {};
  const pick = (k) => (opts[k] !== undefined ? validateNames(opts[k]) : prev[k] || []);
  st.phases[name] = {
    goal: opts.goal !== undefined ? cleanText(opts.goal, 200) : prev.goal || '',
    order: opts.order !== undefined ? opts.order : prev.order ?? Object.keys(st.phases).length,
    skills: pick('skills'), agents: pick('agents'), plugins: pick('plugins'), pool: pick('pool'),
  };
  if (opts.scanned) st.scanned_at = Date.now();
  saveState(E, st);
  writeRoadmap(E, st);
  return st;
}

function lookupMap(items) {
  const m = new Map();
  for (const it of items) {
    if (!it.safe) continue;
    for (const k of [it.name.toLowerCase(), it.dir.replace(/\.md$/, '').toLowerCase(), it.plugin ? `${it.plugin.split('@')[0]}:${it.name}`.toLowerCase() : null]) {
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      if (!m.get(k).includes(it)) m.get(k).push(it);
    }
  }
  return m;
}

export function resolveNames(names, kind, items) {
  const m = lookupMap(items.filter((i) => i.kind === kind));
  const found = []; const missing = []; const ambiguous = [];
  for (const n of names) {
    const hits = m.get(n.toLowerCase()) || [];
    if (!hits.length) missing.push(n);
    else if (hits.length > 1 && !hits.every((h) => h.source === hits[0].source && h.plugin === hits[0].plugin)) {
      // prefer vault over global over plugin, but report
      ambiguous.push(`${n} (${hits.map((h) => h.plugin || h.source).join(' / ')})`);
      found.push(hits.sort((a, b) => ['vault', 'global', 'plugin'].indexOf(a.source) - ['vault', 'global', 'plugin'].indexOf(b.source))[0]);
    } else found.push(hits[0]);
  }
  return { found, missing, ambiguous };
}

function gitExclude(E, rels) {
  const gitDir = path.join(E.project, '.git');
  if (!exists(gitDir) || !fs.statSync(gitDir).isDirectory()) return;
  const f = path.join(gitDir, 'info', 'exclude');
  let txt = '';
  try { txt = fs.readFileSync(f, 'utf8'); } catch { /* new */ }
  const start = '# project-conductor:start';
  const end = '# project-conductor:end';
  txt = txt.replace(new RegExp(`${start}[\\s\\S]*?${end}\\n?`), '');
  const lines = [...new Set(['.claude/settings.local.json', ...rels.map((r) => '/' + r.split(path.sep).join('/'))])];
  txt = `${txt.replace(/\n*$/, '\n')}${start}\n${lines.join('\n')}\n${end}\n`;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, txt);
}

export function activatePhase(E, name) {
  const st = loadState(E);
  const ph = name ? st.phases[name] : { skills: [], agents: [], plugins: [] };
  if (name && !ph) throw new Error(`unknown phase "${name}". Known: ${Object.keys(st.phases).join(', ') || '-'}`);
  const items = getIndex(E);
  const cfg = config(E);
  const report = { linked: [], plugins: [], missing: [], ambiguous: [], skippedExisting: [], warnings: [] };

  // 1. remove what conductor created before
  for (const rel of st.managed) {
    try { removeManaged(path.join(E.project, rel)); } catch (e) { report.warnings.push(e.message); }
  }
  const managed = [];

  const sk = resolveNames(ph.skills, 'skill', items);
  const ag = resolveNames(ph.agents, 'agent', items);
  report.missing.push(...sk.missing, ...ag.missing);
  report.ambiguous.push(...sk.ambiguous, ...ag.ambiguous);
  if (sk.found.length > cfg.max_skills_per_phase) report.warnings.push(`${sk.found.length} skills > max_skills_per_phase (${cfg.max_skills_per_phase})`);

  const agents = detectedAgents(E);
  const skillDirs = [...new Set(agents.map((a) => a.project))];
  const pluginsNeeded = new Set(ph.plugins);

  for (const it of sk.found) {
    if (it.source === 'plugin') { pluginsNeeded.add(it.plugin); continue; }
    if (it.source === 'global') continue; // already visible
    for (const d of skillDirs) {
      const rel = path.join(d, it.dir);
      const abs = path.join(E.project, rel);
      if (exists(abs)) { report.skippedExisting.push(rel); continue; }
      linkDir(it.path, abs);
      managed.push(rel);
      report.linked.push(rel);
    }
  }
  const claude = agents.find((a) => a.id === 'claude');
  for (const it of ag.found) {
    if (it.source === 'plugin') { pluginsNeeded.add(it.plugin); continue; }
    if (it.source === 'global' || !claude) continue;
    const rel = path.join(claude.agentsProject, it.dir);
    const abs = path.join(E.project, rel);
    if (exists(abs)) { report.skippedExisting.push(rel); continue; }
    linkFile(it.path, abs);
    managed.push(rel);
    report.linked.push(rel);
  }

  // 2. Claude plugins (project-local settings only)
  const all = Object.keys(claudePlugins(E));
  const full = new Set();
  for (const p of pluginsNeeded) for (const k of all) if (k === p || k.split('@')[0] === p) full.add(k);
  const sp = path.join(E.project, '.claude', 'settings.local.json');
  if (full.size || st.claude_plugins.length) {
    const s = readJson(sp, {});
    s.enabledPlugins = s.enabledPlugins || {};
    for (const k of st.claude_plugins) if (!full.has(k)) delete s.enabledPlugins[k];
    for (const k of full) s.enabledPlugins[k] = true;
    if (!Object.keys(s.enabledPlugins).length) delete s.enabledPlugins;
    writeJson(sp, s);
  }
  report.plugins = [...full].sort();

  st.managed = managed;
  st.claude_plugins = report.plugins;
  st.current = name || null;
  saveState(E, st);
  gitExclude(E, managed);
  writeInstructionBlocks(E, st);
  writeRoadmap(E, st);
  return report;
}

// ------------------------------------------------------------------ instruction blocks
const B_START = '<!-- project-conductor:start -->';
const B_END = '<!-- project-conductor:end -->';

export function instructionText(st) {
  const ph = st.current && st.phases[st.current];
  const order = Object.entries(st.phases).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)).map(([n]) => n);
  return [
    B_START,
    '## Working protocol (project-conductor)',
    '- Before non-trivial work: restate the goal, list assumptions and unknowns, plan, then act.',
    '- Use the always-on planning/reasoning skills when scoping, designing or debugging.',
    '- Verify (run, test, read output) before claiming something is done.',
    ph
      ? `- Active phase: **${st.current}**${ph.goal ? ` — ${ph.goal}` : ''}. Phases: ${order.join(' → ')}.`
      : `- No active phase.${order.length ? ` Phases: ${order.join(' → ')}.` : ''}`,
    '- If the work clearly moves into another phase, suggest once switching with the project-conductor skill (`phase <name>`); do not switch on your own.',
    '- Phase plan and candidate skills: `.conductor/roadmap.md` (read only when choosing or switching phases).',
    B_END,
  ].join('\n');
}

function upsertBlock(file, block) {
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { /* new */ }
  const re = new RegExp(`${B_START}[\\s\\S]*?${B_END}`);
  if (block === null) {
    if (!re.test(txt)) return;
    txt = txt.replace(re, '').replace(/\n{3,}/g, '\n\n');
    if (!txt.trim()) { fs.unlinkSync(file); return; }
  } else if (re.test(txt)) {
    txt = txt.replace(re, block);
  } else {
    txt = txt ? `${txt.replace(/\n*$/, '\n\n')}${block}\n` : `${block}\n`;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, txt);
}

export function instructionFiles(E) {
  return [...new Set(detectedAgents(E).map((a) => a.instructions))];
}

export function writeInstructionBlocks(E, st, remove = false) {
  const block = remove ? null : instructionText(st);
  for (const f of instructionFiles(E)) upsertBlock(path.join(E.project, f), block);
}

// ------------------------------------------------------------------ roadmap
function itemLine(it) {
  return `\`${it.name}\` (${it.kind}, ${it.plugin || it.source}) — ${cleanText(it.description, 140)}`;
}

export function writeRoadmap(E, st) {
  const m = lookupMap(getIndex(E));
  const line = (n) => { const h = m.get(n.toLowerCase()); return `- ${h ? itemLine(h[0]) : `\`${n}\` (not in index)`}`; };
  const out = ['# Project roadmap (project-conductor)', '', '_Generated file. Change it with the project-conductor skill or CLI._', '', `**Active phase:** ${st.current || '-'}`, ''];
  for (const [name, ph] of Object.entries(st.phases).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))) {
    const active = [...ph.skills, ...ph.agents];
    out.push(`## ${name}${name === st.current ? ' ← active' : ''}`, '', `Goal: ${ph.goal || '-'}`, '', '**Active set:**');
    out.push(...(active.length ? active.map(line) : ['- -']));
    if (ph.plugins.length) out.push(`- plugins (Claude Code): ${ph.plugins.join(', ')}`);
    const pool = ph.pool.filter((n) => !active.includes(n));
    out.push('', '**Candidate pool (inactive):**', ...(pool.length ? pool.map(line) : ['- -']), '');
  }
  const p = path.join(E.project, '.conductor', 'roadmap.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, out.join('\n'));
}

// ------------------------------------------------------------------ review
export function review(E, name, top = 20) {
  const st = loadState(E);
  const ph = st.phases[name];
  if (!ph) throw new Error(`unknown phase "${name}". Known: ${Object.keys(st.phases).join(', ') || '-'}`);
  const items = getIndex(E).filter((i) => i.safe);
  const m = lookupMap(items);
  const get = (n) => (m.get(n.toLowerCase()) || [])[0];
  const active = [...ph.skills, ...ph.agents];
  const fresh = items.filter((i) => i.first_seen > (st.scanned_at || 0) && !isCoreItem(i, config(E)))
    .map((it) => ({ it, s: scoreItem(it, `${name} ${ph.goal}`) }))
    .sort((a, b) => b.s - a.s).slice(0, top).map((x) => x.it);
  return { phase: name, goal: ph.goal, active: active.map((n) => get(n) || { name: n, missing: true }), pool: ph.pool.filter((n) => !active.includes(n)).map((n) => get(n) || { name: n, missing: true }), fresh, plugins: ph.plugins };
}

export { itemLine };
