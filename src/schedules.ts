import type { ScheduleDefinition } from "./types.js";

export function defineSchedule(
  def: Omit<ScheduleDefinition, "name"> & { name?: string },
): ScheduleDefinition {
  return {
    name: def.name ?? "schedule",
    cron: def.cron,
    prompt: def.prompt,
    description: def.description,
  };
}

/** Very small cron matcher for demo/local use: supports `m h * * *`. */
export function cronMatches(cron: string, date = new Date()): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [min, hour] = parts;
  const match = (field: string, value: number) =>
    field === "*" || field.split(",").some((p) => Number(p) === value);
  return match(min, date.getMinutes()) && match(hour, date.getHours());
}

export function dueSchedules(
  schedules: ScheduleDefinition[],
  date = new Date(),
): ScheduleDefinition[] {
  return schedules.filter((s) => cronMatches(s.cron, date));
}
