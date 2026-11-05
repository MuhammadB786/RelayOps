import { z } from "zod";
export function businessDate(time = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function addDays(day: string, days: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export const roleSchema = z.enum(["owner", "manager", "technician", "viewer"]);
export type Role = z.infer<typeof roleSchema>;
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.');
export const assetSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(100),
  criticality: z.enum(["Low", "Medium", "High", "Critical"]),
  serial: z.string().max(100).default(""),
  status: z
    .enum(["Operational", "Maintenance", "Offline"])
    .default("Operational"),
  notes: z.string().max(4000).default(""),
});
export const orderSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().trim().min(3).max(180),
  description: z.string().max(6000).default(""),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  assignee: z.string().default(""),
  due: calendarDate,
  status: z
    .enum(["Open", "In progress", "Awaiting verification", "Done"])
    .default("Open"),
  checklist: z
    .array(z.object({ text: z.string().min(1).max(200), done: z.boolean() }))
    .max(30)
    .default([]),
  completion: z.string().max(4000).default(""),
  laborHours: z.number().min(0).max(10000).default(0),
  cost: z.number().min(0).max(10000000).default(0),
  source: z.enum(["Manual", "Condition", "Preventive"]).default("Manual"),
  sourceId: z.string().default(""),
});
export const sensorSchema = z.object({
  assetId: z.string().min(1),
  name: z.string().min(1).max(80),
  unit: z.string().min(1).max(20),
  limit: z.number().positive().max(1e9),
  value: z.number().finite(),
  recorded: z.string().datetime(),
  source: z.enum(["Imported", "Simulation", "Manual"]),
  connected: z.boolean().default(true),
});
export const planSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(3).max(180),
  intervalDays: z.number().int().min(1).max(3650),
  nextDue: calendarDate,
  assignee: z.string().default(""),
  checklist: z.array(z.string().min(1).max(200)).max(30).default([]),
  enabled: z.boolean().default(true),
});
export const manualSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(2).max(180),
  text: z.string().min(10).max(100000),
});
export const commentSchema = z.object({
  orderId: z.string().min(1),
  text: z.string().trim().min(1).max(4000),
});
export const schemas = {
  asset: assetSchema,
  order: orderSchema,
  sensor: sensorSchema,
  plan: planSchema,
  manual: manualSchema,
  comment: commentSchema,
};
export type Kind = keyof typeof schemas;
export type Asset = z.infer<typeof assetSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Sensor = z.infer<typeof sensorSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Manual = z.infer<typeof manualSchema>;
export type Row<T = Record<string, any>> = {
  id: string;
  kind: Kind;
  data: T;
  version: number;
  created: string;
  updated: string;
};
export function condition(s: Sensor, now = Date.now()) {
  if (!s.connected)
    return {
      severity: "Offline",
      ratio: 0,
      reason: "Sensor disconnected; inspect the connection.",
    };
  if (now - Date.parse(s.recorded) > 24 * 3600000)
    return {
      severity: "Stale",
      ratio: 0,
      reason: "No reading in the last 24 hours.",
    };
  const ratio = s.value / s.limit;
  return {
    severity:
      ratio >= 1.2
        ? "Critical"
        : ratio >= 1
          ? "High"
          : ratio >= 0.8
            ? "Watch"
            : "Normal",
    ratio,
    reason: `${s.name}: ${s.value} ${s.unit}; upper limit ${s.limit} ${s.unit} (${Math.round(ratio * 100)}% of limit).`,
  };
}
export function authorize(
  role: Role,
  kind: Kind,
  old: Record<string, any> | null,
  next: Record<string, any>,
  user: string,
) {
  if (role === "viewer") throw new Error("Viewers cannot modify records.");
  if (role === "technician") {
    if (kind === "order") {
      if (!old || old.assignee !== user)
        throw new Error("You can update only work assigned to you.");
      for (const k of [
        "assetId",
        "title",
        "description",
        "priority",
        "assignee",
        "due",
        "source",
        "sourceId",
      ])
        if (JSON.stringify(old[k]) !== JSON.stringify(next[k]))
          throw new Error("Assignment and planning require a manager.");
      if (next.status === "Done")
        throw new Error("A manager must verify completed work.");
      if (old.status === "Done")
        throw new Error("Verified work cannot be changed by technicians.");
    } else if (kind !== "comment")
      throw new Error("This action requires a manager.");
  }
  if (kind === "order") {
    if (!old && next.status !== "Open")
      throw new Error("New work orders must start Open.");
    if (old && next.status !== old.status) {
      const transitions: Record<string, string[]> = {
        Open: ["In progress"],
        "In progress": ["Awaiting verification", "Open"],
        "Awaiting verification": ["Done", "In progress"],
        Done: ["Open"],
      };
      if (!transitions[old.status]?.includes(next.status))
        throw new Error("Invalid work-order transition.");
    }
    if (["Awaiting verification", "Done"].includes(next.status)) {
      if (!next.completion.trim())
        throw new Error("Add completion notes before submitting work.");
      if (next.checklist.some((x: { done: boolean }) => !x.done))
        throw new Error("Complete every checklist item first.");
    }
  }
}
export function draftFromNotes(notes: string) {
  return {
    title:
      notes
        .trim()
        .split(/[.!?\n]/)[0]
        .slice(0, 150) || "Equipment inspection",
    description: notes.trim(),
    priority: /smoke|fire|sparks|injury/i.test(notes)
      ? "Critical"
      : /leak|overheat|vibrat|stopped/i.test(notes)
        ? "High"
        : "Medium",
    checklist: [
      { text: "Inspect and document the reported condition", done: false },
      { text: "Complete repair and record measurements", done: false },
      { text: "Verify operation and attach evidence", done: false },
    ],
    method: "Rules-based draft · review required",
  };
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
