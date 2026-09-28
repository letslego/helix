import type { ActionableEnv } from "./actionable-env.js";
import { Rules } from "./harnesses/rules.js";

export class RulesCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesCodeError";
  }
}

/** Compile code and return the `_Rules` class constructor. */
export function loadRulesSubclass(code: string): typeof Rules {
  if (!code.trim()) {
    return Rules;
  }

  let Subclass: unknown;
  try {
    const factory = new Function(
      "Rules",
      "Action",
      "Blocked",
      "Observation",
      "EnvResponse",
      `
      ${code}
      if (typeof _Rules === "undefined") {
        throw new Error("Code must define a top-level class named _Rules.");
      }
      return _Rules;
      `,
    );
    Subclass = factory(Rules, Object, Object, Object, Object);
  } catch (e) {
    throw new RulesCodeError(
      `Code raised at module load time: ${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (typeof Subclass !== "function") {
    throw new RulesCodeError("Code must define a top-level class named `_Rules`.");
  }

  const testInstance = new (Subclass as new (inner: ActionableEnv | null) => Rules)(null);
  if (!(testInstance instanceof Rules)) {
    throw new RulesCodeError("`_Rules` must subclass `Rules`.");
  }

  return Subclass as typeof Rules;
}

export function loadRulesInstance(code: string, inner: ActionableEnv | null = null): Rules {
  const Subclass = loadRulesSubclass(code);
  const inst = new Subclass(inner);
  inst.rulesCode = code.trim() ? code : "";
  return inst;
}
