import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { RuntimeEvent, SessionRecord, TokenUsage } from "./types.js";

const emptyUsage = (): TokenUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
});

export class DurableStore {
  private sessionsDir: string;
  private eventsPath: string;

  constructor(rootDir: string) {
    const base = join(rootDir, ".helix");
    this.sessionsDir = join(base, "sessions");
    this.eventsPath = join(base, "events.jsonl");
    mkdirSync(this.sessionsDir, { recursive: true });
    if (!existsSync(this.eventsPath)) {
      writeFileSync(this.eventsPath, "");
    }
  }

  createSession(): SessionRecord {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      usage: emptyUsage(),
      status: "active",
      pendingApprovals: [],
    };
    this.saveSession(session);
    return session;
  }

  getSession(id: string): SessionRecord | null {
    const path = join(this.sessionsDir, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as SessionRecord;
  }

  saveSession(session: SessionRecord): void {
    session.updatedAt = new Date().toISOString();
    const path = join(this.sessionsDir, `${session.id}.json`);
    writeFileSync(path, JSON.stringify(session, null, 2));
  }

  appendEvent(event: RuntimeEvent): void {
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`);
  }

  listEvents(sessionId?: string): RuntimeEvent[] {
    if (!existsSync(this.eventsPath)) return [];
    return readFileSync(this.eventsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RuntimeEvent)
      .filter((e) => (sessionId ? e.sessionId === sessionId : true));
  }

  listSessions(): SessionRecord[] {
    if (!existsSync(this.sessionsDir)) return [];
    return readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith(".json"))
      .map(
        (f) =>
          JSON.parse(
            readFileSync(join(this.sessionsDir, f), "utf8"),
          ) as SessionRecord,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
