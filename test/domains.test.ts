import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DomainRegistry,
  defineDomain,
  domainsFromSubagents,
  routeDomains,
  delegateDomains,
} from "../src/domains.js";
import type { SubagentDefinition } from "../src/types.js";

test("routeDomains picks matching capability cards", () => {
  const registry = new DomainRegistry([
    defineDomain({
      id: "researcher",
      description: "Investigate topics",
      whenToUse: ["research a topic", "investigate"],
      notFor: ["book a flight"],
      keywords: ["research"],
    }),
    defineDomain({
      id: "weather_scout",
      description: "Weather summaries",
      whenToUse: ["weather in a city", "temperature forecast"],
      keywords: ["weather", "rain"],
    }),
  ]);

  const research = routeDomains("Please investigate Kyoto neighborhoods", registry);
  assert.deepEqual(research.domains, ["researcher"]);
  assert.equal(research.mode, "serial");

  const weather = routeDomains("What is the weather in Paris this weekend?", registry);
  assert.ok(weather.domains.includes("weather_scout"));

  const none = routeDomains("Thanks!", registry);
  assert.deepEqual(none.domains, []);
  assert.equal(none.mode, "none");
});

test("notFor excludes a domain even when keywords match", () => {
  const registry = new DomainRegistry([
    defineDomain({
      id: "researcher",
      description: "Investigate",
      whenToUse: ["research"],
      notFor: ["book a flight"],
      keywords: ["research", "flight"],
    }),
  ]);
  const plan = routeDomains("research and book a flight to Paris", registry);
  assert.deepEqual(plan.domains, []);
});

test("multi-domain plans fan out in parallel", async () => {
  const registry = new DomainRegistry([
    defineDomain({
      id: "researcher",
      description: "Investigate destinations",
      whenToUse: ["research a destination"],
      keywords: ["destination", "research"],
    }),
    defineDomain({
      id: "weather_scout",
      description: "Weather",
      whenToUse: ["weather in a city"],
      keywords: ["weather"],
    }),
  ]);
  const plan = routeDomains(
    "Research the destination and check the weather in Lisbon",
    registry,
  );
  assert.ok(plan.domains.includes("researcher"));
  assert.ok(plan.domains.includes("weather_scout"));
  assert.equal(plan.mode, "parallel");

  const calls: string[] = [];
  const results = await delegateDomains(plan, "plan a weekend", async (name, task) => {
    calls.push(`${name}:${task}`);
    return `${name}-ok`;
  });
  assert.equal(results.length, 2);
  assert.ok(calls.some((c) => c.startsWith("researcher:")));
  assert.ok(calls.some((c) => c.startsWith("weather_scout:")));
});

test("domainsFromSubagents derives cards and merges overrides", () => {
  const subs = [
    {
      name: "researcher",
      description: "Investigate destinations",
      instructions: "x",
      config: {},
      tools: [],
    },
  ] as SubagentDefinition[];
  const cards = domainsFromSubagents(subs, [
    defineDomain({
      id: "researcher",
      description: "Override",
      whenToUse: ["deep research"],
      keywords: ["deep"],
    }),
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].description, "Override");
  assert.deepEqual(cards[0].whenToUse, ["deep research"]);
});
