import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorize,
  condition,
  orderSchema,
  sensorSchema,
  parseCSV,
  csvCell,
  draftFromNotes,
} from "../lib/domain.ts";
const order = () =>
  orderSchema.parse({
    assetId: "asset",
    title: "Inspect pump",
    priority: "High",
    due: "2026-11-04",
    assignee: "tech",
    checklist: [{ text: "Verify operation", done: false }],
  });
test("technicians cannot verify repairs or reassign work", () => {
  const old = order();
  assert.throws(
    () =>
      authorize(
        "technician",
        "order",
        old,
        { ...old, assignee: "other" },
        "tech",
      ),
    /manager/,
  );
  assert.throws(
    () =>
      authorize("technician", "order", old, { ...old, status: "Done" }, "tech"),
    /manager/,
  );
  assert.throws(
    () =>
      authorize(
        "technician",
        "order",
        old,
        { ...old, status: "In progress" },
        "other",
      ),
    /assigned/,
  );
});
test("completion requires notes, completed checklist and valid transitions", () => {
  const old = { ...order(), status: "In progress" };
  assert.throws(
    () =>
      authorize("manager", "order", old, { ...old, status: "Done" }, "manager"),
    /transition/,
  );
  assert.throws(
    () =>
      authorize(
        "technician",
        "order",
        old,
        { ...old, status: "Awaiting verification" },
        "tech",
      ),
    /notes/,
  );
  assert.throws(
    () =>
      authorize(
        "technician",
        "order",
        old,
        { ...old, status: "Awaiting verification", completion: "Repaired" },
        "tech",
      ),
    /checklist/,
  );
  const ready = {
    ...old,
    status: "Awaiting verification",
    completion: "Repaired and measured",
    checklist: [{ text: "Verify operation", done: true }],
  };
  assert.doesNotThrow(() =>
    authorize("technician", "order", old, ready, "tech"),
  );
  assert.doesNotThrow(() =>
    authorize(
      "manager",
      "order",
      ready,
      { ...ready, status: "Done" },
      "manager",
    ),
  );
});
test("viewers cannot modify any entity and technicians cannot modify equipment", () => {
  assert.throws(() => authorize("viewer", "asset", null, {}, "u"), /Viewers/);
  assert.throws(
    () => authorize("technician", "asset", null, {}, "u"),
    /manager/,
  );
});
test("condition rules handle threshold, stale data and disconnect distinctly", () => {
  const s = sensorSchema.parse({
    assetId: "a",
    name: "Temperature",
    unit: "C",
    limit: 80,
    value: 104,
    recorded: new Date().toISOString(),
    source: "Manual",
  });
  assert.equal(condition(s).severity, "Critical");
  assert.equal(condition({ ...s, value: 80 }).severity, "High");
  assert.equal(condition({ ...s, value: 50 }).severity, "Normal");
  assert.equal(condition({ ...s, connected: false }).severity, "Offline");
  assert.equal(
    condition({ ...s, recorded: "2020-01-01T00:00:00.000Z" }).severity,
    "Stale",
  );
  assert.throws(() => sensorSchema.parse({ ...s, limit: 0 }));
});
test("CSV handles quotes, commas, newlines, and spreadsheet formulas", () => {
  assert.deepEqual(
    parseCSV('name,notes\r\n"pump, 1","said ""hello""\nsecond line"'),
    [
      ["name", "notes"],
      ["pump, 1", 'said "hello"\nsecond line'],
    ],
  );
  assert.throws(() => parseCSV('"unclosed'), /Unclosed/);
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
});
test("drafting is labeled and uses reviewable priorities", () => {
  assert.equal(
    draftFromNotes("Pump overheating and leaking. Inspect seals.").priority,
    "High",
  );
  assert.match(draftFromNotes("Inspect pump").method, /Rules-based/);
});
