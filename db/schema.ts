// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created: text("created").notNull(),
});
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    workspace: text("workspace")
      .notNull()
      .references(() => workspaces.id),
    user: text("user").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
  },
  (t) => [uniqueIndex("membership_unique").on(t.workspace, t.user)],
);
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    workspace: text("workspace")
      .notNull()
      .references(() => workspaces.id),
    kind: text("kind").notNull(),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    created: text("created").notNull(),
    updated: text("updated").notNull(),
  },
  (t) => [
    index("workspace_kind").on(t.workspace, t.kind),
    uniqueIndex("one_active_source")
      .on(t.workspace, sql`json_extract(${t.data}, '$.sourceId')`)
      .where(
        sql`${t.kind} = 'order' AND json_extract(${t.data}, '$.sourceId') != '' AND json_extract(${t.data}, '$.status') != 'Done'`,
      ),
  ],
);
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    workspace: text("workspace")
      .notNull()
      .references(() => workspaces.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    detail: text("detail").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("workspace_events").on(t.workspace, t.created)],
);
export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  workspace: text("workspace")
    .notNull()
    .references(() => workspaces.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  expires: text("expires").notNull(),
});
