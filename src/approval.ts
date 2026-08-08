import type { ApprovalPolicy } from "./types.js";

/** Always require human approval before the tool runs. */
export function always(): ApprovalPolicy {
  return { mode: "always" };
}

/** Require approval once per session for identical tool+input. */
export function once(): ApprovalPolicy {
  return { mode: "once" };
}

/** Never require approval (explicit opt-out). */
export function never(): ApprovalPolicy {
  return { mode: "never" };
}

/** Approve when a predicate on the tool input returns true. */
export function when(
  predicate: (input: Record<string, unknown>) => boolean,
): ApprovalPolicy {
  return { mode: "when", predicate };
}

export function needsApproval(
  policy: ApprovalPolicy | undefined,
  requiresApprovalFlag: boolean | undefined,
  input: unknown,
  priorApprovedKeys: Set<string>,
  toolName: string,
): boolean {
  if (requiresApprovalFlag && !policy) return true;
  if (!policy) return false;
  if (policy.mode === "never") return false;
  if (policy.mode === "always") return true;
  if (policy.mode === "once") {
    const key = `${toolName}:${stableKey(input)}`;
    return !priorApprovedKeys.has(key);
  }
  if (policy.mode === "when") {
    return Boolean(policy.predicate?.(asRecord(input)));
  }
  return false;
}

export function approvalKey(toolName: string, input: unknown): string {
  return `${toolName}:${stableKey(input)}`;
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

function stableKey(input: unknown): string {
  try {
    return JSON.stringify(input ?? null);
  } catch {
    return String(input);
  }
}
