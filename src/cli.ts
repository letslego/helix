#!/usr/bin/env node
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { Command } from "commander";
import { scaffoldProject } from "./scaffold.js";
import { describeAgent, loadAgent } from "./loader.js";
import { HelixRuntime } from "./runtime.js";
import { startConsoleServer } from "./console-server.js";
import { runEvals } from "./evals.js";
import { dueSchedules } from "./schedules.js";
import type { EvalSuite } from "./types.js";

const program = new Command();

program
  .name("helix")
  .description("Filesystem-first framework for durable AI agents")
  .version("0.1.0");

program
  .command("init")
  .argument("[dir]", "project directory", "my-agent")
  .description("Scaffold a new Helix agent project")
  .action((dir: string) => {
    const target = resolve(process.cwd(), dir);
    scaffoldProject(target);
    console.log(`Created Helix agent in ${target}`);
    console.log(`Next:\n  cd ${dir}\n  npm install\n  npx helix console`);
  });

program
  .command("inspect")
  .argument("[dir]", "project directory", ".")
  .description("Print discovered agent stack capabilities")
  .action(async (dir: string) => {
    const agent = await loadAgent(resolve(process.cwd(), dir));
    console.log(describeAgent(agent));
  });

program
  .command("run")
  .argument("<message>", "user message")
  .option("-d, --dir <dir>", "project directory", ".")
  .option("-s, --session <id>", "resume session id")
  .option("--auto-approve", "auto-approve gated tools", false)
  .option("-c, --channel <name>", "channel name", "cli")
  .description("Run one turn against the agent")
  .action(
    async (
      message: string,
      opts: { dir: string; session?: string; autoApprove?: boolean; channel: string },
    ) => {
      const agent = await loadAgent(resolve(process.cwd(), opts.dir));
      const runtime = new HelixRuntime(agent);
      const result = await runtime.run({
        message,
        sessionId: opts.session,
        autoApprove: opts.autoApprove,
        channel: opts.channel,
        onEvent: (e) => {
          if (process.env.HELIX_VERBOSE) {
            console.error(`[${e.type}]`, JSON.stringify(e.data ?? {}));
          }
        },
      });
      console.log(result.reply);
      console.error(
        `\nsession=${result.sessionId} model=${result.modelUsed} tokens=${result.usage.totalTokens} cost≈$${result.usage.estimatedCostUsd.toFixed(4)}${result.parked ? " parked" : ""}`,
      );
    },
  );

program
  .command("dev")
  .argument("[dir]", "project directory", ".")
  .description("Inspect agent stack and open the local console")
  .action(async (dir: string) => {
    const root = resolve(process.cwd(), dir);
    const agent = await loadAgent(root);
    console.log(describeAgent(agent));
    const { url } = await startConsoleServer(root, Number(process.env.PORT || 8787));
    console.log(`\nHelix console: ${url}`);
  });

program
  .command("console")
  .argument("[dir]", "project directory", ".")
  .option("-p, --port <port>", "port", "8787")
  .description("Start the local operator console + HTTP API")
  .action(async (dir: string, opts: { port: string }) => {
    const { url } = await startConsoleServer(
      resolve(process.cwd(), dir),
      Number(opts.port),
    );
    console.log(`Helix console listening on ${url}`);
  });

program
  .command("replay")
  .argument("<sessionId>", "session id")
  .option("-d, --dir <dir>", "project directory", ".")
  .description("Print the durable event log for a session")
  .action(async (sessionId: string, opts: { dir: string }) => {
    const agent = await loadAgent(resolve(process.cwd(), opts.dir));
    const runtime = new HelixRuntime(agent);
    const events = runtime.store.listEvents(sessionId);
    for (const event of events) {
      console.log(`${event.at}  ${event.type}`);
      if (event.data) console.log(JSON.stringify(event.data, null, 2));
      console.log("---");
    }
  });

program
  .command("schedule")
  .argument("[name]", "schedule name (omit to list / run due)")
  .option("-d, --dir <dir>", "project directory", ".")
  .option("--due", "run all schedules due now", false)
  .description("List or fire authored schedules")
  .action(async (name: string | undefined, opts: { dir: string; due?: boolean }) => {
    const agent = await loadAgent(resolve(process.cwd(), opts.dir));
    const runtime = new HelixRuntime(agent);
    if (!name && !opts.due) {
      for (const s of agent.schedules) {
        console.log(`${s.name}\t${s.cron}\t${s.description ?? ""}`);
      }
      return;
    }
    if (opts.due) {
      const due = dueSchedules(agent.schedules);
      if (!due.length) {
        console.log("No schedules due.");
        return;
      }
      for (const s of due) {
        console.log(`Firing ${s.name}...`);
        const result = await runtime.runSchedule(s.name, true);
        console.log(result.reply);
      }
      return;
    }
    const result = await runtime.runSchedule(String(name), true);
    console.log(result.reply);
  });

program
  .command("eval")
  .argument("[suite]", "eval suite path", "evals/suite.ts")
  .option("-d, --dir <dir>", "project directory", ".")
  .description("Run an evaluation suite against the agent")
  .action(async (suitePath: string, opts: { dir: string }) => {
    const root = resolve(process.cwd(), opts.dir);
    const agent = await loadAgent(root);
    const candidates = [
      resolve(process.cwd(), suitePath),
      resolve(root, suitePath),
      resolve(root, "evals/suite.ts"),
    ];
    const full = candidates.find((p) => existsSync(p));
    if (!full) throw new Error(`Eval suite not found: ${suitePath}`);
    const mod = await import(pathToFileURL(full).href);
    const suite = (mod.default ?? mod.suite) as EvalSuite;
    const report = await runEvals(agent, suite);
    for (const r of report.results) {
      console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.name}`);
      for (const d of r.details) console.log(`  - ${d}`);
    }
    console.log(`\n${report.passed} passed / ${report.failed} failed`);
    if (report.failed) process.exitCode = 1;
  });

program
  .command("stack")
  .argument("[dir]", "project directory", ".")
  .description("Print the Helix stack map for this agent")
  .action(async (dir: string) => {
    const agent = await loadAgent(resolve(process.cwd(), dir));
    const stack = {
      runtime: "durable local workflow + event log",
      gateway: agent.config.gateway ?? { defaultModel: agent.config.model },
      sandbox: agent.sandbox,
      channels: agent.channels.map((c) => ({ name: c.name, kind: c.kind })),
      connections: agent.connections.map((c) => ({ name: c.name, kind: c.kind })),
      subagents: agent.subagents.map((s) => s.name),
      schedules: agent.schedules.map((s) => ({ name: s.name, cron: s.cron })),
      tools: agent.tools.map((t) => t.name),
      skills: agent.skills.map((s) => s.name),
      evals: existsSync(join(resolve(process.cwd(), dir), "evals")) ? "present" : "none",
    };
    console.log(JSON.stringify(stack, null, 2));
  });

program.parseAsync(process.argv);
