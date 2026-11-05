import assert from "node:assert/strict";
const base = process.env.RELAYOPS_TEST_URL || "http://localhost:5180";
const cookie = "__sites_local_auth=1";
let workspace = "";
async function call(action, data = {}, expected = 200, auth = true) {
  const r = await fetch(
    base + "/api/relay" + (workspace ? "?workspace=" + workspace : ""),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Cookie: cookie } : {}),
        Origin: base,
      },
      body: JSON.stringify({ action, ...data }),
    },
  );
  const d = await r.json();
  assert.equal(r.status, expected, JSON.stringify(d));
  return d;
}
async function get() {
  const r = await fetch(base + "/api/relay?workspace=" + workspace, {
    headers: { Cookie: cookie },
  });
  assert.equal(r.status, 200);
  return r.json();
}
await call("createWorkspace", { name: "Unauthorized test" }, 401, false);
workspace = (
  await call("createWorkspace", {
    name: "API verification " + new Date().toISOString(),
  })
).workspace;
await call("seed");
let s = await get();
assert.equal(s.records.filter((r) => r.kind === "asset").length, 6);
assert.equal(s.member.role, "owner");
const order = s.records.find((r) => r.kind === "order");
await call(
  "save",
  {
    kind: "order",
    id: order.id,
    version: order.version,
    data: { ...order.data, status: "Done" },
  },
  400,
);
await call("save", {
  kind: "order",
  id: order.id,
  version: order.version,
  data: { ...order.data, status: "In progress" },
});
await call(
  "save",
  {
    kind: "order",
    id: order.id,
    version: order.version,
    data: { ...order.data, status: "In progress" },
  },
  409,
);
s = await get();
let o = s.records.find((r) => r.id === order.id);
await call("save", {
  kind: "order",
  id: o.id,
  version: o.version,
  data: {
    ...o.data,
    status: "Awaiting verification",
    completion: "Replaced seal and verified measurements",
    checklist: o.data.checklist.map((c) => ({ ...c, done: true })),
    laborHours: 1.5,
    cost: 120,
  },
});
s = await get();
o = s.records.find((r) => r.id === order.id);
await call("save", {
  kind: "order",
  id: o.id,
  version: o.version,
  data: { ...o.data, status: "Done" },
});
const asset = s.records.find((r) => r.kind === "asset");
await call("scenario", { assetId: asset.id, scenario: "overheat" });
const first = await call("generate");
const second = await call("generate");
assert.ok(first.created >= 1);
assert.equal(second.created, 0);
await call("scenario", { assetId: asset.id, scenario: "recover" });
s = await get();
assert.ok(
  s.records
    .filter((r) => r.kind === "order" && r.data.source === "Condition")
    .every((r) => r.data.status !== "Done"),
);
await call(
  "save",
  { kind: "order", data: { ...order.data, assetId: "other-workspace-asset" } },
  400,
);
await call("import", {
  rows: [
    {
      assetId: asset.id,
      name: "Temperature",
      unit: "C",
      limit: 80,
      value: 61,
      recorded: new Date().toISOString(),
      source: "Imported",
      connected: true,
    },
  ],
});
await call(
  "import",
  {
    rows: [
      {
        assetId: asset.id,
        name: "Temperature",
        unit: "C",
        limit: 0,
        value: 61,
        recorded: new Date().toISOString(),
        source: "Imported",
      },
    ],
  },
  400,
);
const results = await call("searchManuals", { query: "inspection" });
const historyRows=[10,5].map((seconds,index)=>({assetId:asset.id,name:'Temperature',unit:'C',limit:80,value:55+index,recorded:new Date(Date.now()-seconds*1000).toISOString(),source:'Imported',connected:true}));
assert.equal((await call('import',{rows:historyRows})).imported,2);
assert.equal((await call('import',{rows:historyRows})).imported,0);
s=await get();
const importedSensors=s.records.filter(r=>r.kind==='sensor'&&r.data.source==='Imported'&&r.data.assetId===asset.id&&r.data.name==='Temperature'&&r.data.unit==='C');
assert.equal(importedSensors.length,1);
assert.equal(importedSensors[0].data.value,61);
assert.equal(s.records.filter(r=>r.kind==='reading'&&r.data.sensorId===importedSensors[0].id).length,3);
assert.ok(results.results.length > 0);
const form = new FormData();
form.set("target", order.id);
form.set(
  "file",
  new File(["Verification evidence"], "evidence.txt", { type: "text/plain" }),
);
const upload = await fetch(base + "/api/files?workspace=" + workspace, {
  method: "POST",
  headers: { Cookie: cookie, Origin: base },
  body: form,
});
assert.equal(upload.status, 200, await upload.clone().text());
const attachment = await upload.json();
const download = await fetch(
  base +
    "/api/files?workspace=" +
    workspace +
    "&key=" +
    encodeURIComponent(attachment.key),
  { headers: { Cookie: cookie } },
);
assert.equal(await download.text(), "Verification evidence");
const wrong = await fetch(base + "/api/relay?workspace=unrelated", {
  headers: { Cookie: cookie },
});
assert.equal(wrong.status, 403);
s = await get();
assert.ok(s.events.some((e) => e.action === "Attachment uploaded"));
assert.ok(s.records.some((r) => r.id === order.id && r.data.status === "Done"));
console.log(
  JSON.stringify({
    status: "passed",
    workspace,
    checks: [
      "authentication",
      "workspace isolation",
      "sample data",
      "work-order lifecycle",
      "completion evidence",
      "optimistic locking",
      "condition deduplication",
      "recovery preserves open work",
      "foreign asset rejection",
      "CSV validation",
      "CSV history grouping, deduplication and out-of-order ingestion",
      "manual source retrieval",
      "R2 upload and download",
      "persistent activity",
    ],
  }),
);
