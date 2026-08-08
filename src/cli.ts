#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { scaffoldProject } from "./scaffold.js";
import { describeAgent, loadAgent } from "./loader.js";
import { HelixRuntime } from "./runtime.js";
import { startConsoleServer } from "./console-server.js";

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
  .description("Print discovered agent capabilities")
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
  .description("Run one turn against the agent")
  .action(async (message: string, opts: { dir: string; session?: string; autoApprove?: boolean }) => {
    const agent = await loadAgent(resolve(process.cwd(), opts.dir));
    const runtime = new HelixRuntime(agent);
    const result = await runtime.run({
      message,
      sessionId: opts.session,
      autoApprove: opts.autoApprove,
      onEvent: (e) => {
        if (process.env.HELIX_VERBOSE) {
          console.error(`[${e.type}]`, JSON.stringify(e.data ?? {}));
        }
      },
    });
    console.log(result.reply);
    console.error(
      `\nsession=${result.sessionId} tokens=${result.usage.totalTokens} cost≈$${result.usage.estimatedCostUsd.toFixed(4)}${result.parked ? " parked" : ""}`,
    );
  });

program
  .command("dev")
  .argument("[dir]", "project directory", ".")
  .description("Inspect agent and open the local console")
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
  .description("Start the local operator console")
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

program.parseAsync(process.argv);
