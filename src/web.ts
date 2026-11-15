// Read-only web viewer for the shared store: `amh web [--port 7788] [--host 127.0.0.1]`.
// Same JSONL the agents read - no database, no build step, no dependencies. Nothing here writes:
// the store only ever grows through `amh add` / `memory_write`.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import { Store } from "./store.ts";
import type { MemoryEntry } from "./store.ts";
import { userHome } from "./paths.ts";

export interface WebOptions {
  port?: number;
  host?: string;
  store?: Store;
}

export interface WebHandle {
  url: string;
  close: () => Promise<void>;
}

interface Row extends MemoryEntry {
  /** "project:..." is unreadable in a table, so the client gets both forms. */
  scopeKind: "global" | "project";
  projectPath: string | null;
  chars: number;
}

function toRow(e: MemoryEntry): Row {
  const isProject = e.scope.startsWith("project:");
  return {
    ...e,
    scopeKind: isProject ? "project" : "global",
    projectPath: isProject ? e.scope.slice("project:".length) : null,
    chars: e.content.length,
  };
}

/** Show the store path with the home directory folded to `~`: shorter to read, and no user name in screenshots. */
function tilde(p: string): string {
  const flat = p.replace(/[\\/]+/g, "/");
  const home = userHome().replace(/[\\/]+/g, "/").replace(/\/$/, "");
  return home && flat.toLowerCase().startsWith(home.toLowerCase()) ? "~" + flat.slice(home.length) : flat;
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f1115'/%3E%3Ccircle cx='10' cy='11' r='3' fill='%237aa2f7'/%3E%3Ccircle cx='22' cy='16' r='3' fill='%237bd88f'/%3E%3Ccircle cx='12' cy='23' r='3' fill='%23e0af68'/%3E%3Cpath d='M12 12l8 3M20 18l-6 4' stroke='%23343a4a' stroke-width='1.5'/%3E%3C/svg%3E">
<title>agent-memory-hub · shared memory</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --panel2: #1d2130; --line: #282d3a;
    --ink: #e6e8ee; --dim: #8b93a7; --accent: #7aa2f7; --ok: #7bd88f; --bad: #f7768e;
    --mono: ui-monospace, "Cascadia Mono", "JetBrains Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 14.5px/1.65 -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 5; backdrop-filter: blur(8px);
           background: rgba(15,17,21,.86); border-bottom: 1px solid var(--line); padding: 14px 20px 12px; }
  h1 { margin: 0 0 2px; font-size: 16px; font-weight: 600; letter-spacing: .2px; display: flex; align-items: baseline; gap: 8px; }
  h1 small { color: var(--dim); font-weight: 400; font-size: 12px; }
  .storepath { font: 11px/1.5 var(--mono); color: var(--dim); word-break: break-all; }
  .stats { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 10px; }
  .stat { display: flex; align-items: baseline; gap: 6px; }
  .stat b { font-size: 17px; font-variant-numeric: tabular-nums; }
  .stat i { font-style: normal; color: var(--dim); font-size: 12px; }
  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
  input[type=search], select { background: var(--panel2); color: var(--ink); border: 1px solid var(--line);
      border-radius: 8px; padding: 7px 10px; font: inherit; outline: none; }
  input[type=search] { flex: 1 1 260px; min-width: 180px; }
  input[type=search]:focus, select:focus { border-color: var(--accent); }
  button { background: var(--panel2); color: var(--ink); border: 1px solid var(--line); border-radius: 8px;
           padding: 7px 12px; font: inherit; cursor: pointer; }
  button:hover { border-color: var(--accent); color: var(--accent); }
  button.on { border-color: var(--accent); color: var(--accent); }
  main { padding: 16px 20px 60px; max-width: 1080px; margin: 0 auto; }
  .muted { color: var(--dim); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
          border-left: 3px solid var(--line); padding: 12px 14px; margin-bottom: 10px; }
  .card.global { border-left-color: #2c4a35; }
  .card.project { border-left-color: #2b3a5c; }
  .card.deleted { opacity: .5; border-style: dashed; }
  .card .content { white-space: pre-wrap; word-break: break-word; }
  .card code { font: .92em var(--mono); background: var(--panel2); border: 1px solid var(--line);
               border-radius: 4px; padding: 0 4px; color: #c9d4f2; }
  .card .meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 9px; font-size: 12px; }
  .pill { border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; color: var(--dim); }
  .pill.global { color: var(--ok); border-color: #2c4a35; }
  .pill.project { color: var(--accent); border-color: #2b3a5c; }
  .pill.deleted { color: var(--bad); border-color: #4a2c33; }
  .pill.src { font-family: var(--mono); }
  .id { font-family: var(--mono); color: var(--dim); cursor: pointer; border-bottom: 1px dotted var(--line); }
  .id:hover { color: var(--accent); }
  .grow { flex: 1; }
  .empty { border: 1px dashed var(--line); border-radius: 12px; padding: 28px; text-align: center; color: var(--dim); }
  .count { font: 12px var(--mono); color: var(--dim); }
  footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 6px 20px; font-size: 11px; color: var(--dim);
           background: rgba(15,17,21,.9); border-top: 1px solid var(--line); }
</style>
</head>
<body>
<header>
  <h1><span data-i18n="title">Shared memory</span><small data-i18n="subtitle">agent-memory-hub · read-only</small>
    <span class="grow"></span><button id="lang" title="switch language">中</button></h1>
  <div class="storepath" id="storepath">…</div>
  <div class="stats" id="stats"></div>
  <div class="toolbar">
    <input type="search" id="q" data-i18n-ph="search" placeholder="search" autocomplete="off">
    <select id="scope">
      <option value="all" data-i18n="scopeAll">All scopes</option>
      <option value="global" data-i18n="scopeGlobal">global</option>
      <option value="project" data-i18n="scopeProject">project</option>
    </select>
    <select id="source"><option value="all" data-i18n="sourceAll">All sources</option></select>
    <select id="status">
      <option value="active" data-i18n="statusActive">Active only</option>
      <option value="all" data-i18n="statusAll">Include deleted</option>
      <option value="deleted" data-i18n="statusDeleted">Deleted only</option>
    </select>
    <button id="refresh" data-i18n="refresh">Refresh</button>
    <button id="auto" class="on" data-i18n="auto">Auto</button>
  </div>
</header>
<main>
  <div class="count" id="count"></div>
  <div id="list"></div>
</main>
<footer id="foot">…</footer>
<script>
(function () {
  var STR = {
    en: {
      title: 'Shared memory', subtitle: 'agent-memory-hub · read-only',
      search: 'Search text (space-separated, all terms must hit)',
      scopeAll: 'All scopes', scopeGlobal: 'global', scopeProject: 'project',
      sourceAll: 'All sources', statusActive: 'Active only', statusAll: 'Include deleted', statusDeleted: 'Deleted only',
      refresh: 'Refresh', auto: 'Auto',
      active: 'active facts', deleted: 'deleted', global: 'global', project: 'project', sources: 'sources', chars: 'characters',
      of: 'of', rows: 'rows', empty: 'No memory matches. Try another term, or switch the status filter to “Include deleted”.',
      deletedPill: 'deleted', dir: 'data dir', readonly: 'read-only view', updated: 'updated', every: 'refreshes every 5s',
      copied: 'copied', mins: 'm ago', hours: 'h ago', days: 'd ago', secs: 's ago', lang: '中'
    },
    zh: {
      title: '共享记忆库', subtitle: 'agent-memory-hub · 只读',
      search: '搜索内容（空格分词，全部命中才显示）',
      scopeAll: '全部作用域', scopeGlobal: 'global', scopeProject: 'project',
      sourceAll: '全部来源', statusActive: '仅有效', statusAll: '含已删除', statusDeleted: '仅已删除',
      refresh: '刷新', auto: '自动刷新',
      active: '条有效记忆', deleted: '条已删除', global: 'global', project: 'project', sources: '个来源', chars: '字符总量',
      of: '/', rows: '条', empty: '没有匹配的记忆。换个关键词，或把状态切到「含已删除」。',
      deletedPill: '已删除', dir: '数据目录', readonly: '只读视图', updated: '更新于', every: '每 5 秒自动刷新',
      copied: '已复制', mins: ' 分钟前', hours: ' 小时前', days: ' 天前', secs: ' 秒前', lang: 'EN'
    }
  };

  var state = { entries: [], query: '', scope: 'all', source: 'all', status: 'active', auto: true, timer: null, lang: 'en' };
  function t(k) { return STR[state.lang][k] || STR.en[k] || k; }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // escaped text, with \`inline code\` promoted (memory text often carries paths and tool names)
  function fmt(s) {
    return esc(s).replace(/\`([^\`]+)\`/g, function (_m, code) { return '<code>' + code + '</code>'; });
  }

  function ago(iso) {
    var t0 = Date.parse(iso);
    if (isNaN(t0)) return '';
    var s = Math.max(0, Math.round((Date.now() - t0) / 1000));
    if (s < 60) return s + t('secs');
    if (s < 3600) return Math.round(s / 60) + t('mins');
    if (s < 86400) return Math.round(s / 3600) + t('hours');
    return Math.round(s / 86400) + t('days');
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function shortPath(p) {
    if (!p) return '';
    var parts = p.split(/[\\\\/]/).filter(Boolean);
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
  }

  // same idea as src/text.ts: ascii words plus CJK char pairs, so 中文 queries match loosely
  function tokens(s) {
    var out = {};
    var lower = String(s).toLowerCase();
    (lower.match(/[a-z0-9_]+/g) || []).forEach(function (w) { if (w.length > 1) out[w] = 1; });
    (lower.match(/[\\u4e00-\\u9fff]+/g) || []).forEach(function (run) {
      if (run.length === 1) out[run] = 1;
      for (var i = 0; i < run.length - 1; i++) out[run.slice(i, i + 2)] = 1;
    });
    return Object.keys(out);
  }

  function matches(e, qs) {
    if (!qs.length) return true;
    var hay = (e.content + ' ' + e.sources.join(' ') + ' ' + e.tags.join(' ') + ' ' + (e.projectPath || '')).toLowerCase();
    var set = {};
    tokens(hay).forEach(function (x) { set[x] = 1; });
    return qs.every(function (q) { return set[q] === 1 || hay.indexOf(q) >= 0; });
  }

  function visible() {
    var qs = tokens(state.query);
    return state.entries.filter(function (e) {
      if (state.status !== 'all' && e.status !== state.status) return false;
      if (state.scope !== 'all' && e.scopeKind !== state.scope) return false;
      if (state.source !== 'all' && e.sources.indexOf(state.source) < 0) return false;
      return matches(e, qs);
    }).sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
  }

  function applyLang() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = 'agent-memory-hub · ' + t('title');
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    var ph = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < ph.length; j++) ph[j].setAttribute('placeholder', t(ph[j].getAttribute('data-i18n-ph')));
    document.getElementById('lang').textContent = t('lang');
    render();
  }

  function renderStats(all) {
    var active = all.filter(function (e) { return e.status === 'active'; });
    var dead = all.filter(function (e) { return e.status === 'deleted'; });
    var glob = active.filter(function (e) { return e.scopeKind === 'global'; });
    var proj = active.filter(function (e) { return e.scopeKind === 'project'; });
    var sources = {};
    active.forEach(function (e) { e.sources.forEach(function (s) { sources[s] = (sources[s] || 0) + 1; }); });
    var chars = active.reduce(function (n, e) { return n + e.chars; }, 0);
    var cells = [
      [active.length, t('active')], [dead.length, t('deleted')],
      [glob.length, t('global')], [proj.length, t('project')],
      [Object.keys(sources).length, t('sources')], [chars, t('chars')]
    ];
    document.getElementById('stats').innerHTML = cells.map(function (c) {
      return '<div class="stat"><b>' + c[0] + '</b><i>' + c[1] + '</i></div>';
    }).join('');

    var sel = document.getElementById('source');
    var cur = state.source;
    var opts = ['<option value="all">' + esc(t('sourceAll')) + '</option>'];
    Object.keys(sources).sort().forEach(function (s) {
      opts.push('<option value="' + esc(s) + '">' + esc(s) + ' (' + sources[s] + ')</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = cur;
    if (sel.value !== cur) { sel.value = 'all'; state.source = 'all'; }
  }

  function render() {
    var rows = visible();
    var all = state.entries;
    if (!all.length && !rows.length) {
      document.getElementById('stats').innerHTML = '';
      document.getElementById('count').textContent = '';
      document.getElementById('list').innerHTML = '<div class="empty">' + esc(t('empty')) + '</div>';
      return;
    }
    renderStats(all);
    document.getElementById('count').textContent = rows.length + ' ' + t('of') + ' ' + all.length + ' ' + t('rows');
    var list = document.getElementById('list');
    if (!rows.length) {
      list.innerHTML = '<div class="empty">' + esc(t('empty')) + '</div>';
      return;
    }
    list.innerHTML = rows.map(function (e) {
      var cls = 'card ' + e.scopeKind + (e.status === 'deleted' ? ' deleted' : '');
      var scopePill = e.scopeKind === 'global'
        ? '<span class="pill global">global</span>'
        : '<span class="pill project" title="' + esc(e.projectPath) + '">project ' + esc(shortPath(e.projectPath)) + '</span>';
      var srcs = e.sources.map(function (s) { return '<span class="pill src">' + esc(s) + '</span>'; }).join('');
      var tags = e.tags.map(function (x) { return '<span class="pill">#' + esc(x) + '</span>'; }).join('');
      var dead = e.status === 'deleted' ? '<span class="pill deleted">' + esc(t('deletedPill')) + '</span>' : '';
      return '<article class="' + cls + '">' +
        '<div class="content">' + fmt(e.content) + '</div>' +
        '<div class="meta">' + scopePill + dead + srcs + tags +
        '<span class="grow"></span>' +
        '<span class="id" data-id="' + esc(e.id) + '" title="click to copy the full id">' + esc(e.id.slice(0, 8)) + '</span>' +
        '<span class="muted" title="' + esc(when(e.updated_at)) + '">' + esc(ago(e.updated_at)) + '</span>' +
        '</div></article>';
    }).join('');
  }

  var meta = { dir: '', now: '' };

  function paintMeta() {
    document.getElementById('storepath').textContent = meta.store || '';
    document.getElementById('foot').textContent =
      t('dir') + ' ' + meta.dir + ' · ' + t('readonly') + ' · ' + t('updated') + ' ' + when(meta.now) +
      (state.auto ? ' · ' + t('every') : '');
  }

  function load() {
    fetch('/api/memories', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      state.entries = data.entries;
      meta = { store: data.store, dir: data.dir, now: data.now };
      paintMeta();
      render();
    }).catch(function (err) {
      document.getElementById('foot').textContent = 'read failed: ' + err;
    });
  }

  function schedule() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (state.auto) state.timer = setInterval(load, 5000);
  }

  document.getElementById('q').addEventListener('input', function (ev) { state.query = ev.target.value; render(); });
  document.getElementById('scope').addEventListener('change', function (ev) { state.scope = ev.target.value; render(); });
  document.getElementById('source').addEventListener('change', function (ev) { state.source = ev.target.value; render(); });
  document.getElementById('status').addEventListener('change', function (ev) { state.status = ev.target.value; render(); });
  document.getElementById('refresh').addEventListener('click', load);
  document.getElementById('auto').addEventListener('click', function (ev) {
    state.auto = !state.auto;
    ev.target.classList.toggle('on', state.auto);
    schedule();
    paintMeta();
  });
  document.getElementById('lang').addEventListener('click', function () {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    applyLang();
    paintMeta();
  });
  document.getElementById('list').addEventListener('click', function (ev) {
    var target = ev.target;
    if (target && target.className === 'id') {
      var id = target.getAttribute('data-id');
      if (navigator.clipboard) navigator.clipboard.writeText(id);
      target.textContent = t('copied');
      setTimeout(function () { target.textContent = id.slice(0, 8); }, 900);
    }
  });

  state.lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  applyLang();
  document.getElementById('scope').value = state.scope;
  document.getElementById('status').value = state.status;
  load();
  schedule();
})();
</script>
</body>
</html>`;

export function startWeb(o: WebOptions = {}): Promise<WebHandle> {
  const store = o.store ?? new Store();
  const port = o.port ?? Number(process.env.AMH_WEB_PORT ?? 7788);
  const host = o.host ?? "127.0.0.1";

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method !== "GET" && req.method !== "HEAD") {
      json(res, 405, { error: "read-only viewer: use `amh add`, `amh forget` or the memory_write tool" });
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      html(res, PAGE);
      return;
    }
    if (url.pathname === "/api/memories") {
      const entries = store.all().map(toRow);
      json(res, 200, {
        store: tilde(store.file),
        dir: tilde(dirname(store.file)),
        now: new Date().toISOString(),
        entries,
        stats: {
          total: entries.length,
          active: entries.filter((e) => e.status === "active").length,
          deleted: entries.filter((e) => e.status === "deleted").length,
        },
      });
      return;
    }
    if (url.pathname === "/api/health") {
      json(res, 200, { ok: true, store: tilde(store.file) });
      return;
    }
    json(res, 404, { error: "not found" });
  });

  return new Promise<WebHandle>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`;
      console.log(`agent-memory-hub viewer: ${url}`);
      console.log(`store: ${store.file}`);
      console.log("read-only · Ctrl+C to stop");
      resolve({
        url,
        close: () =>
          new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      });
    });
  });
}

if (process.argv[1] && /[\\/]web\.(ts|js)$/.test(process.argv[1])) {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  await startWeb({ port: get("port") ? Number(get("port")) : undefined, host: get("host") });
}
