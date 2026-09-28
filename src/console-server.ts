import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describeAgent, loadAgent } from "./loader.js";
import { HelixRuntime } from "./runtime.js";

export async function startConsoleServer(
  projectDir: string,
  port = 8787,
  host = process.env.HELIX_BIND_HOST ?? "0.0.0.0",
): Promise<{ url: string; close: () => void }> {
  const agent = await loadAgent(projectDir);
  const runtime = new HelixRuntime(agent);

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, runtime, agent.rootDir);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    url: `http://${displayHost}:${port}`,
    close: () => server.close(),
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: HelixRuntime,
  rootDir: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const agent = runtime.getAgent();

  if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/livez")) {
    json(res, {
      ok: true,
      status: "live",
      contextMode: agent.config.context?.mode ?? process.env.HELIX_CONTEXT_MODE ?? "local",
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/readyz") {
    json(res, {
      ok: true,
      status: "ready",
      contextPacks: agent.contextPacks.length,
      subagents: agent.subagents.length,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(consoleHtml());
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/agent" || url.pathname === "/helix/v1/agent")) {
    json(res, {
      summary: describeAgent(agent),
      tools: agent.tools.map((t) => ({
        name: t.name,
        description: t.description,
        requiresApproval: Boolean(t.requiresApproval),
      })),
      skills: agent.skills,
      config: agent.config,
      channels: agent.channels,
      connections: agent.connections.map((c) => ({
        name: c.name,
        kind: c.kind,
        description: c.description,
      })),
      subagents: agent.subagents.map((s) => ({
        name: s.name,
        description: s.description,
      })),
      schedules: agent.schedules,
      sandbox: agent.sandbox,
      contextPacks: agent.contextPacks.map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title,
      })),
      contextMode: agent.config.context?.mode ?? process.env.HELIX_CONTEXT_MODE ?? "local",
      rootDir,
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/stack" || url.pathname === "/helix/v1/stack")) {
    json(res, {
      runtime: "durable local workflow + event log",
      gateway: agent.config.gateway ?? { defaultModel: agent.config.model },
      sandbox: agent.sandbox,
      channels: agent.channels,
      connections: agent.connections.map((c) => c.name),
      subagents: agent.subagents.map((s) => s.name),
      schedules: agent.schedules.map((s) => ({ name: s.name, cron: s.cron })),
      tools: agent.tools.map((t) => t.name),
      skills: agent.skills.map((s) => s.name),
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/sessions" || url.pathname === "/helix/v1/sessions")) {
    json(res, runtime.store.listSessions());
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/workflows" || url.pathname === "/helix/v1/workflows")) {
    json(
      res,
      runtime.workflows.list(url.searchParams.get("sessionId") ?? undefined),
    );
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/events" || url.pathname === "/helix/v1/events")) {
    json(res, runtime.store.listEvents(url.searchParams.get("sessionId") ?? undefined));
    return;
  }

  if (req.method === "POST" && (url.pathname === "/api/run" || url.pathname === "/helix/v1/sessions")) {
    const body = await readJson(req);
    const tenantHeader = process.env.HELIX_TENANT_HEADER ?? "x-helix-tenant";
    const tenantFromHeader = req.headers[tenantHeader.toLowerCase()];
    const tenantId =
      (body.tenantId ? String(body.tenantId) : undefined) ??
      (typeof tenantFromHeader === "string" ? tenantFromHeader : undefined);
    const result = await runtime.run({
      message: String(body.message ?? ""),
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      autoApprove: Boolean(body.autoApprove),
      channel: body.channel ? String(body.channel) : "http",
      tenantId,
      contextRefs: Array.isArray(body.contextRefs)
        ? body.contextRefs.map(String)
        : undefined,
    });
    json(res, result);
    return;
  }

  if (req.method === "POST" && (url.pathname === "/api/approvals" || url.pathname === "/helix/v1/approvals")) {
    const body = await readJson(req);
    const session = runtime.resolveApproval(
      String(body.sessionId),
      String(body.approvalId),
      Boolean(body.approve),
    );
    json(res, session);
    return;
  }

  if (req.method === "POST" && url.pathname === "/helix/v1/schedules/run") {
    const body = await readJson(req);
    const result = await runtime.runSchedule(String(body.name), true);
    json(res, result);
    return;
  }

  res.statusCode = 404;
  json(res, { error: "not_found" });
}

function json(res: ServerResponse, data: unknown): void {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data, null, 2));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function consoleHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Helix Console</title>
  <style>
    :root {
      --bg: #0f1410;
      --panel: #182019;
      --ink: #e8f0e9;
      --muted: #9aaf9d;
      --accent: #d6ff4b;
      --line: #2a3a2d;
      --warn: #ffb454;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background:
        radial-gradient(1200px 600px at 10% -10%, #243528 0%, transparent 55%),
        radial-gradient(900px 500px at 100% 0%, #1b2a40 0%, transparent 50%),
        var(--bg);
      color: var(--ink);
      min-height: 100vh;
    }
    header {
      padding: 28px 32px 12px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
    }
    h1 {
      margin: 0;
      font-family: "Fraunces", Georgia, serif;
      font-weight: 600;
      letter-spacing: -0.03em;
      font-size: clamp(2rem, 4vw, 3rem);
    }
    .tag {
      color: var(--accent);
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    main {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      padding: 16px 32px 40px;
    }
    @media (max-width: 960px) {
      main { grid-template-columns: 1fr; }
    }
    .panel {
      background: color-mix(in oklab, var(--panel) 92%, black);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      min-height: 320px;
    }
    .panel h2 {
      margin: 0 0 12px;
      font-size: 0.95rem;
      color: var(--muted);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    #transcript {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 280px;
      max-height: 520px;
      overflow: auto;
      margin-bottom: 14px;
    }
    .bubble {
      padding: 12px 14px;
      border-radius: 14px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .user { background: #243528; }
    .assistant { background: #1d2a38; border: 1px solid #31465c; }
    .meta { color: var(--muted); font-size: 0.85rem; }
    form { display: flex; gap: 8px; }
    input, button, select {
      font: inherit;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #101711;
      color: var(--ink);
      padding: 12px 14px;
    }
    input { flex: 1; }
    button {
      background: var(--accent);
      color: #132012;
      border: none;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      color: var(--ink);
      border: 1px solid var(--line);
      font-weight: 600;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--muted);
      font-size: 0.86rem;
      margin: 0;
    }
    .event {
      border-left: 3px solid var(--accent);
      padding: 8px 10px;
      margin-bottom: 8px;
      background: #121a14;
      border-radius: 0 10px 10px 0;
    }
    .event.warn { border-left-color: var(--warn); }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="tag">Helix Console</div>
      <h1>Talk to your agent</h1>
    </div>
    <div class="meta" id="agentMeta">Loading agent…</div>
  </header>
  <main>
    <section class="panel">
      <h2>Conversation</h2>
      <div id="transcript"></div>
      <form id="chatForm">
        <input id="message" placeholder="Plan a weekend trip to Paris…" autocomplete="off" />
        <button type="submit">Send</button>
      </form>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center;">
        <label class="meta"><input type="checkbox" id="autoApprove" /> auto-approve tools</label>
        <button class="secondary" type="button" id="refreshEvents">Refresh timeline</button>
      </div>
    </section>
    <section class="panel">
      <h2>Durable timeline</h2>
      <div id="events"></div>
    </section>
  </main>
  <script>
    let sessionId = null;
    const transcript = document.getElementById('transcript');
    const eventsEl = document.getElementById('events');

    function addBubble(role, text) {
      const div = document.createElement('div');
      div.className = 'bubble ' + role;
      div.textContent = text;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }

    async function loadAgent() {
      const res = await fetch('/api/agent');
      const data = await res.json();
      document.getElementById('agentMeta').textContent =
        (data.config.model || 'model') + ' · ' + data.tools.length + ' tools · ' + data.skills.length + ' skills';
    }

    async function refreshEvents() {
      const qs = sessionId ? ('?sessionId=' + encodeURIComponent(sessionId)) : '';
      const res = await fetch('/api/events' + qs);
      const events = await res.json();
      eventsEl.innerHTML = events.slice(-40).reverse().map(e => {
        const warn = e.type.includes('approval') || e.type === 'error';
        return '<div class="event' + (warn ? ' warn' : '') + '"><div class="meta">' + e.at + ' · ' + e.type + '</div><pre>' +
          JSON.stringify(e.data || {}, null, 2) + '</pre></div>';
      }).join('') || '<div class="meta">No events yet.</div>';
    }

    document.getElementById('chatForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const input = document.getElementById('message');
      const message = input.value.trim();
      if (!message) return;
      addBubble('user', message);
      input.value = '';
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId,
          autoApprove: document.getElementById('autoApprove').checked,
        }),
      });
      const data = await res.json();
      sessionId = data.sessionId;
      addBubble('assistant', data.reply + (data.parked ? '\\n\\n(session parked for approval)' : ''));
      await refreshEvents();
    });

    document.getElementById('refreshEvents').addEventListener('click', refreshEvents);
    loadAgent();
    refreshEvents();
  </script>
</body>
</html>`;
}
