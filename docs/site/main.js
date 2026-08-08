const FILES = {
  instructions: {
    title: "Start with instructions.md",
    desc: "An instructions file is a complete agent. Describe its role in Markdown, then run Helix.",
    filename: "instructions.md",
    code: `# Travel Concierge

You are a practical travel assistant.
Use tools for flights and weather.
Keep answers scannable and actionable.`,
  },
  agent: {
    title: "Choose your model in agent.ts",
    desc: "Helix uses a mock model by default. Add agent.ts to pick providers, fallbacks, and cost budgets.",
    filename: "agent.ts",
    code: `import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  fallbackModels: ["openai/gpt-4.1-mini"],
  provider: { mock: true },
  costBudgetUsd: 1,
});`,
  },
  skills: {
    title: "Add reusable skills/",
    desc: "Skills are Markdown playbooks loaded when relevant — focused guidance without bloating every prompt.",
    filename: "skills/itinerary_shape.md",
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
    title: "Define tools/ in TypeScript",
    desc: "Typed tools with approval helpers, toModelOutput, and streaming yields. Filename becomes the tool name.",
    filename: "tools/book_hold.ts",
    code: `import { defineTool, z, always, toolOutput } from "@letslego/helix/tools";

export default defineTool({
  description: "Hold a flight",
  approval: always(),
  inputSchema: z.object({ flight: z.string() }),
  async execute({ flight }, ctx) {
    return { holdId: "HOLD-1", flight };
  },
  toModelOutput(out) {
    return toolOutput.text(\`Held \${out.flight}\`);
  },
});`,
  },
  sandbox: {
    title: "Customize the sandbox/",
    desc: "Every agent gets an isolated workspace for files and constrained commands.",
    filename: "sandbox/sandbox.ts",
    code: `import { defineSandbox } from "@letslego/helix";

export default defineSandbox({
  backend: "local",
  bootstrap: ["workspace/.gitkeep"],
});`,
  },
  channels: {
    title: "Connect channels/",
    desc: "Serve the same agent over web chat, HTTP, CLI, cron, Slack, Discord, and more.",
    filename: "channels/http.ts",
    code: `import { httpChannel } from "@letslego/helix";

export default httpChannel({
  path: "/helix/v1",
});`,
  },
  connections: {
    title: "Create connections/",
    desc: "Connections handle auth for MCP/OpenAPI services. Tools call them without exposing tokens to the model.",
    filename: "connections/places.ts",
    code: `import { defineMcpConnection } from "@letslego/helix";

export default defineMcpConnection({
  url: "https://mcp.example/places",
  description: "Places workspace",
  authEnv: "PLACES_TOKEN",
});`,
  },
  subagents: {
    title: "Delegate to subagents/",
    desc: "Specialists get their own prompts and tools. The root agent delegates and combines results.",
    filename: "subagents/researcher/instructions.md",
    code: `# Researcher

Investigate questions and return
three crisp bullet findings.`,
  },
  schedules: {
    title: "Run schedules/",
    desc: "Cron-authored jobs continue durably without an active chat session.",
    filename: "schedules/morning_digest.md",
    code: `---
cron: "0 8 * * *"
---

Send the user a daily digest
using memory and tools.`,
  },
  policies: {
    title: "Gate side effects with policies.json",
    desc: "Approvals and deny lists are data. Sensitive tools park the session until a human decides.",
    filename: "policies.json",
    code: `{
  "requireApprovalFor": ["book_hold", "sandbox_exec"],
  "denyTools": [],
  "maxToolCallsPerTurn": 6
}`,
  },
  memory: {
    title: "Durability lives in .helix/",
    desc: "Sessions, event logs, and memory persist on disk so you can crash, resume, and replay.",
    filename: ".helix/events.jsonl",
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
const codeFilename = document.getElementById("codeFilename");
const fileRail = document.getElementById("fileRail");

function setActiveFile(key, { fromUser = false } = {}) {
  if (!FILES[key]) return;
  activeFile = key;
  if (fromUser) {
    userPausedRotate = true;
    clearInterval(autoRotateTimer);
    // resume auto-rotate after idle
    setTimeout(() => {
      userPausedRotate = false;
      startAutoRotate();
    }, 12000);
  }

  fileRail.querySelectorAll(".file-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.file === key);
  });

  const file = FILES[key];
  fileTitle.textContent = file.title;
  fileDesc.textContent = file.desc;
  codeFilename.textContent = file.filename;
  typeCode(file.code);
}

function typeCode(text) {
  clearInterval(typingTimer);
  codeBody.textContent = "";
  typeCursor.style.display = "inline-block";
  let i = 0;
  const step = Math.max(1, Math.floor(text.length / 80));
  typingTimer = setInterval(() => {
    i = Math.min(text.length, i + step);
    codeBody.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(typingTimer);
      // keep cursor blinking briefly, then soft-hide
      setTimeout(() => {
        if (codeBody.textContent === text) typeCursor.style.opacity = "0.35";
      }, 600);
      typeCursor.style.opacity = "1";
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
  const text = cliCommand.textContent.trim();
  navigator.clipboard?.writeText(text).catch(() => {});
  cliBox.classList.add("copied");
  setTimeout(() => cliBox.classList.remove("copied"), 1400);
}
cliBox?.addEventListener("click", copyCli);
cliBox?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    copyCli();
  }
});

// Scroll reveals
const revealEls = document.querySelectorAll(".reveal");
const revealObs = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObs.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15 },
);
revealEls.forEach((el) => revealObs.observe(el));
// hero reveals immediately
requestAnimationFrame(() => {
  document.querySelectorAll(".hero .reveal").forEach((el) => el.classList.add("in"));
});

// Production visual observers
function observeVisual(selector, onEnter) {
  const el = document.querySelector(selector);
  if (!el) return;
  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          el.classList.add("in-view");
          onEnter?.(el);
        }
      }
    },
    { threshold: 0.4 },
  );
  obs.observe(el);
}

// Timeline cycle
observeVisual('[data-animate="timeline"] .timeline-visual', (el) => {
  const steps = [...el.querySelectorAll(".tl-step")];
  let i = 0;
  const tick = () => {
    steps.forEach((s, idx) => {
      s.classList.toggle("done", idx < i);
      s.classList.toggle("active", idx === i);
    });
    i = (i + 1) % steps.length;
  };
  tick();
  setInterval(tick, 1100);
});

// Approval loop
observeVisual('[data-animate="approval"] .approval-visual', (el) => {
  const status = document.getElementById("approvalStatus");
  const loop = () => {
    el.classList.remove("approved");
    if (status) status.textContent = "Parked";
    setTimeout(() => {
      el.classList.add("approved");
      if (status) status.textContent = "Approved · Resuming";
    }, 1600);
  };
  loop();
  setInterval(loop, 3600);
});

// Cost meter animation
observeVisual('[data-animate="cost"] .cost-visual', () => {
  const fill = document.getElementById("costFill");
  const tokens = document.getElementById("tokenCount");
  const cost = document.getElementById("costCount");
  const chips = [...document.querySelectorAll(".fallback-chain .chip")];
  let t = 40;
  let chipIdx = 0;
  const tick = () => {
    t = t >= 420 ? 80 : t + 28;
    if (fill) fill.style.width = `${Math.min(92, (t / 450) * 100)}%`;
    if (tokens) tokens.textContent = String(t);
    if (cost) cost.textContent = (t * 0.000002).toFixed(4);
    chips.forEach((c, i) => c.classList.toggle("on", i === chipIdx));
    if (t % 140 < 28) chipIdx = (chipIdx + 1) % chips.length;
  };
  tick();
  setInterval(tick, 700);
});

observeVisual('[data-animate="console"] .console-visual');
observeVisual('[data-animate="memory"] .memory-visual');
observeVisual('[data-animate="channels"] .channels-visual');

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

// Boot explorer
setActiveFile("instructions");
startAutoRotate();

/* ---------- Six primitives showcase ---------- */
const PRIMS = {
  workflows: {
    title: "Workflows",
    desc: "Checkpointed steps, park between messages, resume on delivery. Completed steps never re-run.",
    points: [
      "<strong>Turn = workflow run</strong> under <code>.helix/workflows/</code>",
      "<strong>Step replay</strong> skips finished model/tool work after crashes",
      "<strong>Park & resume</strong> for approvals without holding compute",
    ],
    html: `
      <div class="pv-step done"><i></i>model:0</div>
      <div class="pv-step done"><i></i>tool:search_flights</div>
      <div class="pv-step active"><i></i>checkpoint · saved</div>
      <div class="pv-step"><i></i>resume</div>`,
  },
  gateway: {
    title: "AI Gateway",
    desc: "Route model calls by intent, chain fallbacks, and keep cost budgets in the agent config.",
    points: [
      "<strong>Intent routes</strong> map keywords to models",
      "<strong>Fallback chains</strong> survive provider failures",
      "<strong>Local-first</strong> — no proprietary control plane required",
    ],
    html: `
      <div class="pv-row"><span class="pv-pill">route:weather</span><span>→</span><span class="pv-pill on">mock/helix-demo</span></div>
      <div class="pv-row"><span class="pv-pill">fallback</span><span>→</span><span class="pv-pill">gpt-4.1-mini</span><span class="pv-pill">claude-sonnet</span></div>
      <div class="pv-row"><span class="pv-pill on">budget</span><span>$0.50 / session</span></div>`,
  },
  sandbox: {
    title: "Sandbox",
    desc: "Isolated filesystem and allowlisted commands. Agents get real compute without host credentials.",
    points: [
      "<strong>workspace/</strong> seeded from authored sandbox files",
      "<strong>glob / grep / bash</strong> as built-in tools",
      "<strong>Path escape + allowlist</strong> keep the host safe",
    ],
    html: `
      <div class="pv-box">
        <strong>sandbox://agent</strong>
        workspace/itinerary.md<br/>
        workspace/notes.txt<br/>
        <br/>
        $ sandbox_glob **/*.md<br/>
        $ sandbox_grep Paris workspace
      </div>`,
  },
  connect: {
    title: "Connect",
    desc: "Broker MCP/OpenAPI credentials in the app runtime. The model only sees connection and tool names.",
    points: [
      "<strong>connect({ tokenEnv })</strong> keeps secrets server-side",
      "<strong>MCP + OpenAPI</strong> adapters with brokered HTTP",
      "<strong>No tokens in prompts</strong> or tool transcripts",
    ],
    html: `
      <div class="pv-box">
        <strong>places.top_sights</strong>
        auth: Bearer <span class="pv-secret">sk-live-secret-token</span><br/><br/>
        model sees: connection_call(places, top_sights)<br/>
        model never sees: token
      </div>`,
  },
  tools: {
    title: "Tools",
    desc: "Typed TypeScript actions with approvals, streaming yields, and projected model output.",
    points: [
      "<strong>always / once / when</strong> approval helpers",
      "<strong>async generators</strong> emit tool.partial events",
      "<strong>toModelOutput</strong> keeps channels rich and prompts lean",
    ],
    html: `
      <div class="pv-step done"><i></i>tool.call · book_hold</div>
      <div class="pv-step active"><i></i>approval · always()</div>
      <div class="pv-step"><i></i>tool.partial · reserving</div>
      <div class="pv-step"><i></i>toModelOutput · text</div>`,
  },
  subagents: {
    title: "Subagents",
    desc: "Delegate specialist work to child agents with their own prompts, tools, and sandboxes.",
    points: [
      "<strong>Filesystem authors</strong> under agent/subagents/",
      "<strong>Isolated sandboxes</strong> per specialist by default",
      "<strong>delegate_subagent</strong> tool for the root agent",
    ],
    html: `
      <div class="pv-agent">root · travel concierge</div>
      <div class="pv-agent">researcher · isolated sandbox</div>
      <div class="pv-agent">delegate_subagent("researcher", task)</div>`,
  },
};

let primTimer = null;
let primAnim = null;
let activePrim = "workflows";

function renderPrim(key, { fromUser = false } = {}) {
  const prim = PRIMS[key];
  if (!prim) return;
  activePrim = key;
  document.querySelectorAll(".prim-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.prim === key);
  });
  document.getElementById("primTitle").textContent = prim.title;
  document.getElementById("primDesc").textContent = prim.desc;
  document.getElementById("primPoints").innerHTML = prim.points
    .map((p) => `<li>${p}</li>`)
    .join("");
  const visual = document.getElementById("primVisual");
  visual.innerHTML = prim.html;

  clearInterval(primAnim);
  const steps = [...visual.querySelectorAll(".pv-step")];
  if (steps.length) {
    let i = 0;
    const tick = () => {
      steps.forEach((s, idx) => {
        s.classList.toggle("done", idx < i);
        s.classList.toggle("active", idx === i);
      });
      i = (i + 1) % steps.length;
    };
    tick();
    primAnim = setInterval(tick, 900);
  }

  if (fromUser) {
    clearInterval(primTimer);
    primTimer = setInterval(() => {
      const keys = Object.keys(PRIMS);
      const next = keys[(keys.indexOf(activePrim) + 1) % keys.length];
      renderPrim(next);
    }, 5000);
  }
}

document.querySelectorAll(".prim-tab").forEach((btn) => {
  btn.addEventListener("click", () => renderPrim(btn.dataset.prim, { fromUser: true }));
});
document.querySelectorAll(".prim-grid [data-jump]").forEach((el) => {
  el.addEventListener("click", () => {
    renderPrim(el.getAttribute("data-jump"), { fromUser: true });
    document.getElementById("stack")?.scrollIntoView({ behavior: "smooth" });
  });
});
renderPrim("workflows");
primTimer = setInterval(() => {
  const keys = Object.keys(PRIMS);
  renderPrim(keys[(keys.indexOf(activePrim) + 1) % keys.length]);
}, 5000);

/* ---------- Hero helix canvas ---------- */
(function initHelixCanvas() {
  const canvas = document.getElementById("helixCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;
  let start = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(now) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.42;
    const amp = Math.min(w, h) * 0.18;
    const turns = 3.2;
    const len = Math.min(h * 0.78, 620);
    const steps = 140;

    function strand(phase, color, width) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const y = cy - len / 2 + p * len;
        const angle = p * Math.PI * 2 * turns + t * 0.9 + phase;
        const x = cx + Math.sin(angle) * amp * (0.55 + 0.45 * Math.sin(p * Math.PI));
        const z = Math.cos(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y + z * 2);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    strand(0, "rgba(214,255,75,0.42)", 2.8);
    strand(Math.PI, "rgba(126,208,255,0.34)", 2.5);

    // traveling packets
    for (let k = 0; k < 10; k++) {
      const p = ((t * 0.14 + k / 10) % 1 + 1) % 1;
      const phase = k % 2 === 0 ? 0 : Math.PI;
      const y = cy - len / 2 + p * len;
      const angle = p * Math.PI * 2 * turns + t * 0.9 + phase;
      const x = cx + Math.sin(angle) * amp * (0.55 + 0.45 * Math.sin(p * Math.PI));
      const z = (Math.cos(angle) + 1) / 2;
      const r = 2.8 + z * 3.4;
      ctx.beginPath();
      ctx.fillStyle = k % 2 === 0 ? `rgba(214,255,75,${0.45 + z * 0.55})` : `rgba(126,208,255,${0.4 + z * 0.55})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // soft core
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, amp * 1.6);
    g.addColorStop(0, "rgba(214,255,75,0.12)");
    g.addColorStop(1, "rgba(214,255,75,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, amp * 1.6, 0, Math.PI * 2);
    ctx.fill();

    if (!reduceMotion) raf = requestAnimationFrame(draw);
  }

  resize();
  draw(performance.now());
  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) draw(performance.now());
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduceMotion) {
      start = performance.now();
      raf = requestAnimationFrame(draw);
    }
  });
})();

/* ---------- Live turn theater ---------- */
(function initLiveTurn() {
  const stage = document.getElementById("liveStage");
  const chat = document.getElementById("liveChat");
  const events = document.getElementById("liveEvents");
  const phaseEl = document.getElementById("livePhase");
  const statusEl = document.getElementById("liveStatus");
  const pulse = document.getElementById("livePulse");
  const nodes = [...document.querySelectorAll("#liveNodes li")];
  const packets = [...document.querySelectorAll(".helix-packet")];
  const strandA = document.querySelector(".helix-strand.a");
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
    return id;
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
    while (events.children.length > 9) {
      const first = events.querySelector(".live-evt");
      if (first) first.remove();
      else break;
    }
  }

  let packetProgress = 0.02;
  let packetTarget = 0.02;

  function movePackets(progress) {
    packetTarget = progress;
  }

  function renderPackets() {
    if (!strandA || !packets.length) return;
    packetProgress += (packetTarget - packetProgress) * 0.08;
    const len = strandA.getTotalLength();
    packets.forEach((p, i) => {
      const offset = (packetProgress + i * 0.16) % 1;
      const pt = strandA.getPointAtLength(((offset % 1) + 1) % 1 * len);
      p.setAttribute("cx", String(pt.x));
      p.setAttribute("cy", String(pt.y));
    });
  }

  function reset() {
    chat.innerHTML = "";
    // keep the label
    [...events.querySelectorAll(".live-evt")].forEach((e) => e.remove());
    nodes.forEach((n) => n.classList.remove("on", "done"));
    setPhase("idle", "");
    if (statusEl) statusEl.textContent = "Waiting for a turn…";
    packetProgress = 0.02;
    packetTarget = 0.02;
    renderPackets();
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
        movePackets(0.05);
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
        movePackets(0.18);
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
        movePackets(0.32);
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
        movePackets(0.48);
      },
    },
    {
      at: 3700,
      run() {
        addEvent("tool.call · search_flights", "hot");
        addEvent("tool.result · AF108 · $412");
        movePackets(0.58);
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
        movePackets(0.68);
      },
    },
    {
      at: 5800,
      run() {
        setPhase("approved", "on");
        if (statusEl) statusEl.textContent = "Operator approved · resuming workflow";
        addEvent("approval.resolved · approve", "ok");
        addEvent("workflow.resume", "hot");
        movePackets(0.78);
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
        movePackets(0.88);
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
        movePackets(0.98);
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

  function tickPackets() {
    if (running) {
      packetTarget = Math.min(0.98, packetTarget + 0.0009);
      renderPackets();
    }
    requestAnimationFrame(tickPackets);
  }
  if (!reduceMotion) requestAnimationFrame(tickPackets);
  else renderPackets();
})();
