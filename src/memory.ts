import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MemoryEntry, MemoryStore } from "./types.js";

export function createMemoryStore(filePath: string): MemoryStore {
  mkdirSync(dirname(filePath), { recursive: true });
  let entries: MemoryEntry[] = [];

  if (existsSync(filePath)) {
    try {
      entries = JSON.parse(readFileSync(filePath, "utf8")) as MemoryEntry[];
    } catch {
      entries = [];
    }
  }

  const persist = () => {
    writeFileSync(filePath, JSON.stringify(entries, null, 2));
  };

  return {
    list() {
      return [...entries];
    },
    write(entry) {
      const full: MemoryEntry = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...entry,
      };
      entries.push(full);
      persist();
      return full;
    },
    search(query, limit = 5) {
      const q = query.toLowerCase();
      return entries
        .map((e) => ({
          e,
          score:
            (e.content.toLowerCase().includes(q) ? 3 : 0) +
            e.tags.filter((t) => t.toLowerCase().includes(q)).length +
            (e.kind === "preference" ? 0.5 : 0),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.e);
    },
  };
}

export function defaultMemoryPath(rootDir: string): string {
  return join(rootDir, ".helix", "memory.json");
}
