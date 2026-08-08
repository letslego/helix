import { HelixRuntime } from "./runtime.js";
import type { EvalCase, EvalResult, EvalSuite, LoadedAgent } from "./types.js";

export function defineEval(suite: EvalSuite): EvalSuite {
  return suite;
}

export async function runEvals(
  agent: LoadedAgent,
  suite: EvalSuite,
): Promise<{ passed: number; failed: number; results: EvalResult[] }> {
  const runtime = new HelixRuntime(agent);
  const results: EvalResult[] = [];

  for (const testCase of suite.cases) {
    results.push(await runCase(runtime, testCase));
  }

  const passed = results.filter((r) => r.passed).length;
  return { passed, failed: results.length - passed, results };
}

async function runCase(runtime: HelixRuntime, testCase: EvalCase): Promise<EvalResult> {
  const details: string[] = [];
  try {
    const result = await runtime.run({
      message: testCase.input,
      autoApprove: true,
    });
    const toolsUsed = result.toolCalls.map((t) => t.name);

    for (const needle of testCase.expectIncludes ?? []) {
      if (!result.reply.toLowerCase().includes(needle.toLowerCase())) {
        details.push(`missing text: ${needle}`);
      }
    }
    for (const tool of testCase.expectTools ?? []) {
      if (!toolsUsed.includes(tool)) details.push(`missing tool: ${tool}`);
    }

    return {
      name: testCase.name,
      passed: details.length === 0,
      details,
      reply: result.reply,
      toolsUsed,
    };
  } catch (err) {
    return {
      name: testCase.name,
      passed: false,
      details: [err instanceof Error ? err.message : String(err)],
    };
  }
}
