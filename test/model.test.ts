import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { features, predict, metrics } from "../lib/benchmark.ts";
test("committed benchmark metrics match the untouched test rows and source checksum", () => {
  const model = JSON.parse(
    fs.readFileSync("lib/generated/benchmark.json", "utf8"),
  );
  const text = fs.readFileSync("data/ai4i2020/ai4i2020.csv", "utf8");
  assert.equal(
    crypto.createHash("sha256").update(text).digest("hex"),
    model.datasetSHA256,
  );
  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(8001)
    .map((l) => l.split(","));
  const labels = rows.map((r) => +r[8]);
  const scores = rows.map(
    (r) =>
      predict(model.tree, features(+r[3], +r[4], +r[5], +r[6], +r[7])).score,
  );
  assert.deepEqual(metrics(labels, scores, model.threshold), model.test);
  assert.equal(model.test.support, 2000);
  assert.equal(model.test.tp + model.test.fn, 39);
  assert.ok(
    model.limitations.some((s: string) => s.includes("not calibrated")),
  );
});
