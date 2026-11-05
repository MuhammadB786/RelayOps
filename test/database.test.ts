import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
test("migrations enforce active-work uniqueness per source and isolate workspaces", () => {
  const db = new DatabaseSync(":memory:");
  for (const f of fs
    .readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(fs.readFileSync("drizzle/" + f, "utf8"));
  db.exec(
    "INSERT INTO workspaces VALUES ('a','A','2026-11-04'),('b','B','2026-11-04')",
  );
  const insert = db.prepare("INSERT INTO records VALUES(?,?,?, ?,1,?,?)");
  const data = JSON.stringify({ sourceId: "sensor", status: "Open" });
  insert.run("one", "a", "order", data, "now", "now");
  assert.throws(
    () => insert.run("two", "a", "order", data, "now", "now"),
    /UNIQUE/,
  );
  assert.doesNotThrow(() =>
    insert.run("three", "b", "order", data, "now", "now"),
  );
  db.prepare("UPDATE records SET data=? WHERE id=?").run(
    JSON.stringify({ sourceId: "sensor", status: "Done" }),
    "one",
  );
  assert.doesNotThrow(() =>
    insert.run("four", "a", "order", data, "now", "now"),
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM records WHERE workspace=?").get("a")
      ?.n,
    2,
  );
  db.close();
});
