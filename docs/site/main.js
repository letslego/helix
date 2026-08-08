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
