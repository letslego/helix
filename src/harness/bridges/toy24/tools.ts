import { defineTool } from "../../tool.js";
import type { Toy24State } from "./state.js";

function apply(op: string, a: number, b: number): number | null {
  if (op === "add") return a + b;
  if (op === "sub") return a - b;
  if (op === "mul") return a * b;
  if (op === "div") {
    if (Math.abs(b) < 1e-6) return null;
    return a / b;
  }
  return null;
}

export const Combine = defineTool({
  name: "combine",
  description:
    "Combine the numbers at positions i and j using one of {add, sub, mul, div}. Result replaces them; positions shift accordingly.",
  parameters: {
    i: { type: "integer" },
    j: { type: "integer" },
    op: { type: "string" },
  },
  required: ["i", "j", "op"],
  invoke(envState, kwargs) {
    const state = envState as Toy24State;
    const i = Number(kwargs.i);
    const j = Number(kwargs.j);
    const op = String(kwargs.op);
    if (state.stopped) return { error: "already stopped" };
    const n = state.currentNumbers.length;
    if (!(0 <= i && i < n && 0 <= j && j < n) || i === j) {
      return { error: `invalid indices i=${i} j=${j}, n=${n}` };
    }
    const a = state.currentNumbers[i];
    const b = state.currentNumbers[j];
    const v = apply(op, a, b);
    if (v === null) return { error: `operation ${op} failed on ${a}, ${b}` };
    const rest = state.currentNumbers.filter((_, k) => k !== i && k !== j);
    state.currentNumbers = [...rest, v];
    state.history.push(`${a} ${op} ${b} = ${v}`);
    return { ok: true, result: v, numbers: [...state.currentNumbers] };
  },
});

export const Reset = defineTool({
  name: "reset",
  description: "Reset numbers back to the puzzle's initial values.",
  invoke(envState) {
    const state = envState as Toy24State;
    state.currentNumbers = state.initialNumbers.map((n) => Number(n));
    state.history.push("reset");
    return { ok: true, numbers: [...state.currentNumbers] };
  },
});

export const Stop = defineTool({
  name: "stop",
  description:
    "Declare the puzzle solved. Success iff a remaining number equals the target (within 1e-6).",
  invoke(envState) {
    const state = envState as Toy24State;
    state.stopped = true;
    state.success = state.currentNumbers.some((x) => Math.abs(x - state.target) < 1e-6);
    return { ok: true, success: state.success };
  },
});

export const TOY24_TOOLS = [Combine, Reset, Stop];
