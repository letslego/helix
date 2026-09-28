import { loadAgent } from "@letslego/helix";
import { HelixRuntime } from "@letslego/helix";

async function main() {
  const agent = await loadAgent(new URL(".", import.meta.url).pathname);
  const runtime = new HelixRuntime(agent);

  console.log("=== Helix live demo ===\n");
  console.log("User: Plan a weekend trip to Paris.\n");

  const result = await runtime.run({
    message: "Plan a weekend trip to Paris.",
    autoApprove: true,
    onEvent: (e) => {
      if (e.type === "tool.call") {
        console.log(`→ tool ${e.data?.name}`, e.data?.input);
      }
      if (e.type === "tool.result") {
        console.log(`← result ${e.data?.name}`);
      }
    },
  });

  console.log("\nAssistant:\n");
  console.log(result.reply);
  console.log(
    `\n[session ${result.sessionId} · ${result.usage.totalTokens} tokens · $${result.usage.estimatedCostUsd.toFixed(4)}]`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
