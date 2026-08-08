const FILES = {
  instructions: {
    title: "instructions.md",
    desc: "An instructions.md file is a complete agent. Describe its role in Markdown, then run Helix.",
    code: `# Identity

You are a practical travel assistant.
You can fetch weather and search flights
for any city in the world.`,
  },
  agent: {
    title: "agent.ts",
    desc: "Helix uses a mock model by default. Add agent.ts to pick providers, fallbacks, and cost budgets.",
    code: `import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  fallbackModels: ["openai/gpt-4.1-mini"],
  provider: { mock: true },
  costBudgetUsd: 1,
});`,
  },
  skills: {
    title: "skills/itinerary_shape.md",
    desc: "Skills are Markdown playbooks loaded only when relevant, so the agent gets focused guidance without carrying it in every prompt.",
    code: `---
name: itinerary_shape
description: Structure trip answers clearly.
---

Always include:
1. Weather snapshot
2. Best flight option
3. One clear next action`,
  },
  tools: {
    title: "tools/get_weather.ts",
    desc: "Drop a TypeScript file in tools/ and the model can call it — the filename becomes the tool name.",
    code: `import { defineTool, z, toolOutput } from "@letslego/helix/tools";

export default defineTool({
  description: "Get the weather for a city",
  inputSchema: z.object({ city: z.string() }),
  async execute({ city }) {
    return { city, tempF: 64, summary: "clear" };
  },
  toModelOutput(out) {
    return toolOutput.text(\`\${out.city}: \${out.tempF}°F\`);
  },
});`,
  },
  sandbox: {
    title: "sandbox/sandbox.ts",
    desc: "Every agent includes an isolated sandbox. Add sandbox/sandbox.ts to customize its setup.",
    code: `import { defineSandbox } from "@letslego/helix";

export default defineSandbox({
  backend: "local",
  bootstrap: ["workspace/.gitkeep"],
});`,
  },
  channels: {
    title: "channels/http.ts",
    desc: "Add channel files to use the same agent over HTTP, web chat, Slack, Discord, and more.",
    code: `import { httpChannel } from "@letslego/helix";

export default httpChannel({
  path: "/helix/v1",
});`,
  },
  connections: {
    title: "connections/places.ts",
    desc: "Connections handle auth for MCP/OpenAPI services so tools can call them without managing tokens.",
    code: `import { defineMcpConnection, connect } from "@letslego/helix";

export default defineMcpConnection({
  url: "https://mcp.example/places",
  description: "Places workspace",
  auth: connect({ tokenEnv: "PLACES_TOKEN" }),
});`,
  },
  subagents: {
    title: "subagents/researcher/instructions.md",
    desc: "Add subagents for specialized work. The main agent delegates tasks and combines the results.",
    code: `# Researcher

Investigate questions and return
three crisp bullet findings.`,
  },
  schedules: {
    title: "schedules/weekend_watch.md",
    desc: "Schedules run agents automatically for jobs like digests, continuing durably without an active session.",
    code: `---
cron: "0 8 * * 5"
---

Scan weekend flight deals for the
user's saved cities and summarize.`,
  },
  policies: {
    title: "policies.json",
    desc: "Approvals and deny lists are data. Sensitive tools park the session until a human decides.",
    code: `{
  "requireApprovalFor": ["book_hold", "sandbox_exec"],
  "denyTools": [],
  "maxToolCallsPerTurn": 6
}`,
  },
  memory: {
    title: ".helix/events.jsonl",
    desc: "Sessions, event logs, and memory persist on disk so you can crash, resume, and replay.",
    code: `{"type":"model.request","sessionId":"…"}
{"type":"tool.call","data":{"name":"search_flights"}}
{"type":"checkpoint","data":{"tool":"get_weather"}}
{"type":"session.end","data":{"status":"completed"}}`,
  },
};

const fileOrder = Object.keys(FILES);
let activeFile = "instructions";
let typingTimer = null;
let autoRotateTimer = null;
let userPausedRotate = false;

const codeBody = document.getElementById("codeBody");
const typeCursor = document.getElementById("typeCursor");
const fileTitle = document.getElementById("fileTitle");
const fileDesc = document.getElementById("fileDesc");
const fileRail = document.getElementById("fileRail");

function setActiveFile(key, { fromUser = false } = {}) {
  if (!FILES[key]) return;
  activeFile = key;
  if (fromUser) {
    userPausedRotate = true;
    clearInterval(autoRotateTimer);
    setTimeout(() => {
      userPausedRotate = false;
      startAutoRotate();
    }, 12000);
  }

  fileRail?.querySelectorAll(".file-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.file === key);
  });

  const file = FILES[key];
  if (fileTitle) fileTitle.textContent = file.title;
  if (fileDesc) fileDesc.textContent = file.desc;
  typeCode(file.code);
}

function typeCode(text) {
  if (!codeBody || !typeCursor) return;
  clearInterval(typingTimer);
  codeBody.textContent = "";
  typeCursor.style.display = "inline-block";
  typeCursor.style.opacity = "1";
  let i = 0;
  const step = Math.max(1, Math.floor(text.length / 80));
  typingTimer = setInterval(() => {
    i = Math.min(text.length, i + step);
    codeBody.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(typingTimer);
      setTimeout(() => {
        if (codeBody.textContent === text) typeCursor.style.opacity = "0.35";
      }, 600);
    }
  }, 18);
}

function startAutoRotate() {
  clearInterval(autoRotateTimer);
  autoRotateTimer = setInterval(() => {
    if (userPausedRotate) return;
    const idx = fileOrder.indexOf(activeFile);
    const next = fileOrder[(idx + 1) % fileOrder.length];
    setActiveFile(next);
  }, 4200);
}

fileRail?.querySelectorAll(".file-item").forEach((btn) => {
  btn.addEventListener("click", () => setActiveFile(btn.dataset.file, { fromUser: true }));
});

// CLI copy
const cliBox = document.getElementById("cliBox");
const cliCommand = document.getElementById("cliCommand");
function copyCli() {
  const text = cliCommand?.textContent?.trim() || "";
  navigator.clipboard?.writeText(text).catch(() => {});
  cliBox?.classList.add("copied");
  setTimeout(() => cliBox?.classList.remove("copied"), 1400);
}
cliBox?.addEventListener("click", copyCli);
cliBox?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    copyCli();
  }
});

// Smooth in-page nav
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (event) => {
    const href = anchor.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// Stack toggle (content swap)
const STACK = {
  primitives: [
    ["Workflows", "Checkpointed steps, park between messages, resume on delivery", ".helix/workflows/"],
    ["AI Gateway", "Intent routing, fallback chains, cost budgets", "helix-gateway"],
    ["Sandbox", "Isolated FS, glob, grep, allowlisted bash", "helix-sandbox"],
    ["Connect", "Brokered MCP/OpenAPI auth — secrets stay out of prompts", "helix-connect"],
    ["Channels", "HTTP, web console, Slack, Discord, cron, CLI", "helix-channels"],
    ["Tools & Subagents", "Approvals, streaming yields, specialist delegates", "in Helix"],
  ],
  selfhost: [
    ["Runtime", "Local-first durability under .helix/ — no managed control plane", "filesystem"],
    ["Workflow engine", "Step replay + park/resume from helix-workflow", "@letslego/helix-workflow"],
    ["Model calls", "OpenAI-compatible providers via helix-gateway", "any Chat Completions API"],
    ["Sandbox backend", "Local process isolation today; swap backends later", "local"],
    ["Connections", "Env-brokered tokens never enter model context", "MCP / OpenAPI"],
    ["Deploy", "Run the console anywhere Node 20+ runs", "npx helix console"],
  ],
};

const stackBoard = document.getElementById("stackBoard");
document.querySelectorAll(".stack-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".stack-tab").forEach((b) => b.classList.toggle("active", b === btn));
    const key = btn.dataset.stack;
    const rows = STACK[key];
    if (!stackBoard || !rows) return;
    stackBoard.innerHTML = rows
      .map(
        ([title, desc, meta]) =>
          `<article><strong>${title}</strong><span>${desc}</span><em>${meta}</em></article>`,
      )
      .join("");
  });
});

setActiveFile("instructions");
startAutoRotate();

/* ---------- Live turn theater ---------- */
(function initLiveTurn() {
  const stage = document.getElementById("liveStage");
  const chat = document.getElementById("liveChat");
  const events = document.getElementById("liveEvents");
  const phaseEl = document.getElementById("livePhase");
  const statusEl = document.getElementById("liveStatus");
  const pulse = document.getElementById("livePulse");
  const nodes = [...document.querySelectorAll("#liveNodes li")];
  if (!stage || !chat || !events) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = false;
  let timers = [];

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }
  function later(ms, fn) {
    const id = setTimeout(fn, ms);
    timers.push(id);
  }

  function setNode(name) {
    let hit = false;
    nodes.forEach((n) => {
      const key = n.getAttribute("data-node");
      if (key === name) {
        n.classList.add("on");
        n.classList.remove("done");
        hit = true;
      } else if (!hit) {
        n.classList.remove("on");
        n.classList.add("done");
      } else {
        n.classList.remove("on", "done");
      }
    });
  }

  function setPhase(text, kind = "on") {
    if (phaseEl) phaseEl.textContent = text;
    if (pulse) {
      pulse.classList.remove("on", "warn");
      if (kind) pulse.classList.add(kind);
    }
  }

  function addChat(role, html) {
    const el = document.createElement("div");
    el.className = `live-msg ${role}`;
    el.innerHTML = html;
    chat.appendChild(el);
    while (chat.children.length > 6) chat.removeChild(chat.firstChild);
    return el;
  }

  function addEvent(text, kind = "") {
    const el = document.createElement("div");
    el.className = `live-evt ${kind}`.trim();
    el.textContent = text;
    events.appendChild(el);
    while (events.querySelectorAll(".live-evt").length > 8) {
      events.querySelector(".live-evt")?.remove();
    }
  }

  function reset() {
    chat.innerHTML = "";
    [...events.querySelectorAll(".live-evt")].forEach((e) => e.remove());
    nodes.forEach((n) => n.classList.remove("on", "done"));
    setPhase("idle", "");
    if (statusEl) statusEl.textContent = "Waiting for a turn…";
  }

  const script = [
    {
      at: 0,
      run() {
        reset();
        setNode("channel");
        setPhase("channel", "on");
        if (statusEl) statusEl.textContent = "Inbound message on web channel";
        addChat("user", "Plan a weekend trip to Paris");
        addEvent("channel.message · web", "hot");
      },
    },
    {
      at: 900,
      run() {
        setNode("gateway");
        setPhase("gateway", "on");
        if (statusEl) statusEl.textContent = "Gateway routing by intent";
        addEvent("gateway.route · research", "ok");
        addEvent("model.request · mock/helix-demo");
      },
    },
    {
      at: 1800,
      run() {
        setNode("workflow");
        setPhase("workflow", "on");
        if (statusEl) statusEl.textContent = "Durable workflow step · model:0";
        addEvent("workflow.step · model:0", "hot");
        const typing = addChat("assistant typing", "<i></i><i></i><i></i>");
        typing.dataset.temp = "1";
      },
    },
    {
      at: 2800,
      run() {
        setNode("tools");
        setPhase("tools", "on");
        if (statusEl) statusEl.textContent = "Calling tools under checkpointed steps";
        chat.querySelector('[data-temp="1"]')?.remove();
        addEvent("tool.call · get_weather", "hot");
        addEvent("tool.result · 64°F clear");
      },
    },
    {
      at: 3700,
      run() {
        addEvent("tool.call · search_flights", "hot");
        addEvent("tool.result · AF108 · $412");
      },
    },
    {
      at: 4500,
      run() {
        setNode("approval");
        setPhase("parked", "warn");
        if (statusEl) statusEl.textContent = "Approval required · session parked";
        addEvent("tool.call · book_hold", "warn");
        addEvent("approval.requested · book_hold", "warn");
        addChat("system", "parked · waiting for operator on book_hold");
      },
    },
    {
      at: 5800,
      run() {
        setPhase("approved", "on");
        if (statusEl) statusEl.textContent = "Operator approved · resuming workflow";
        addEvent("approval.resolved · approve", "ok");
        addEvent("workflow.resume", "hot");
      },
    },
    {
      at: 6700,
      run() {
        setNode("checkpoint");
        setPhase("checkpoint", "on");
        if (statusEl) statusEl.textContent = "Checkpoint written to disk";
        addEvent("checkpoint · saved", "hot");
        addEvent("tool.result · HOLD-AF108");
      },
    },
    {
      at: 7600,
      run() {
        setNode("reply");
        setPhase("reply", "on");
        if (statusEl) statusEl.textContent = "Assistant reply streamed to channel";
        addChat(
          "assistant",
          "Paris looks clear at <strong>64°F</strong>. Best flight <strong>AF108 · $412</strong>. Hold <strong>HOLD-AF108</strong> is ready — want the itinerary shaped next?",
        );
        addEvent("session.end · completed", "ok");
      },
    },
  ];

  function play() {
    clearTimers();
    running = true;
    script.forEach((step) => later(reduceMotion ? 0 : step.at, step.run));
    later(reduceMotion ? 50 : 11000, () => {
      if (!running) return;
      play();
    });
  }

  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!running) play();
        } else {
          running = false;
          clearTimers();
        }
      }
    },
    { threshold: 0.35 },
  );
  obs.observe(stage);
})();
