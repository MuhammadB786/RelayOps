import { env } from "cloudflare:workers";
import { generateDraft } from "@/lib/ai-draft";
const aiEnv = env as typeof env & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  schemas,
  authorize,
  condition,
  businessDate,
  addDays,
  draftFromNotes,
  roleSchema,
  type Kind,
  type Role,
} from "@/lib/domain";
import { z } from "zod";
export const dynamic = "force-dynamic";
const json = (x: unknown, status = 200) =>
  Response.json(x, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
function db() {
  if (!env.DB) throw new Error("Database is not configured.");
  return env.DB;
}
async function membership(workspace: string, user: string) {
  return db()
    .prepare("SELECT * FROM members WHERE workspace=? AND user=?")
    .bind(workspace, user)
    .first<{ role: Role; name: string; email: string }>();
}
function audit(
  workspace: string,
  actor: string,
  action: string,
  target: string,
  detail: string,
) {
  return db()
    .prepare(
      "INSERT INTO events (id,workspace,actor,action,target,detail,created) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(id(), workspace, actor, action, target, detail, now());
}
async function record(workspace: string, recordId: string) {
  return db()
    .prepare("SELECT * FROM records WHERE workspace=? AND id=?")
    .bind(workspace, recordId)
    .first<{ id: string; kind: Kind; data: string; version: number }>();
}
function insert(
  workspace: string,
  kind: string,
  data: unknown,
  recordId = id(),
  ignore = false,
) {
  const time = now();
  return db()
    .prepare(
      `INSERT ${ignore ? 'OR IGNORE ' : ''}INTO records(id,workspace,kind,data,version,created,updated) VALUES(?,?,?,?,1,?,?)`,
    )
    .bind(recordId, workspace, kind, JSON.stringify(data), time, time);
}
async function context(req: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new Error("Unauthorized");
  const workspace = new URL(req.url).searchParams.get("workspace");
  if (!workspace) throw new Error("Workspace required.");
  const member = await membership(workspace, user.userId);
  if (!member) throw new Error("Forbidden");
  return { user, workspace, member };
}
function fail(e: unknown) {
  if (e instanceof z.ZodError)
    return json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  const msg = e instanceof Error ? e.message : "Request failed";
  return json(
    { error: msg },
    msg === "Unauthorized"
      ? 401
      : msg === "Forbidden"
        ? 403
        : msg.includes("conflict")
          ? 409
          : 400,
  );
}
export async function GET(req: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ user: null, workspaces: [] });
    const workspaces = (
      await db()
        .prepare(
          "SELECT w.*,m.role FROM workspaces w JOIN members m ON m.workspace=w.id WHERE m.user=? ORDER BY w.created",
        )
        .bind(user.userId)
        .all()
    ).results;
    const workspace = new URL(req.url).searchParams.get("workspace");
    if (!workspace) return json({ user, workspaces });
    const member = await membership(workspace, user.userId);
    if (!member) return json({ error: "Forbidden" }, 403);
    const [rs, ms, es, iv, history] = await Promise.all([
      db()
        .prepare(
          "SELECT * FROM records WHERE workspace=? AND kind!='reading' ORDER BY created DESC LIMIT 10000",
        )
        .bind(workspace)
        .all(),
      db()
        .prepare(
          "SELECT id,user,email,name,role FROM members WHERE workspace=?",
        )
        .bind(workspace)
        .all(),
      db()
        .prepare(
          "SELECT * FROM events WHERE workspace=? ORDER BY created DESC LIMIT 500",
        )
        .bind(workspace)
        .all(),
      db()
        .prepare(
          "SELECT id,email,role,expires FROM invites WHERE workspace=? AND expires>?",
        )
        .bind(workspace, now())
        .all(),
      db().prepare("SELECT * FROM records WHERE workspace=? AND kind='reading' ORDER BY created DESC LIMIT 2000").bind(workspace).all(),
    ]);
    return json({
      user,
      workspaces,
      member,
      records: [...rs.results,...history.results].map((r: any) => ({ ...r, data: JSON.parse(r.data) })),
      viewLimited:rs.results.length===10000||history.results.length===2000,
      members: ms.results,
      events: es.results,
      invites: ["owner", "manager"].includes(member.role) ? iv.results : [],
      capabilities: { ai: !!aiEnv.OPENAI_API_KEY, storage: !!env.BUCKET },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    if (
      req.headers.get("origin") &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      return json({ error: "Forbidden" }, 403);
    if (Number(req.headers.get("content-length") || 0) > 2_000_000)
      return json({ error: "Request too large" }, 413);
    const b = (await req.json()) as Record<string, any>;
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (b.action === "createWorkspace") {
      const name = z.string().trim().min(2).max(100).parse(b.name);
      const w = id();
      await db().batch([
        db()
          .prepare("INSERT INTO workspaces(id,name,created) VALUES(?,?,?)")
          .bind(w, name, now()),
        db()
          .prepare(
            "INSERT INTO members(id,workspace,user,email,name,role) VALUES(?,?,?,?,?,?)",
          )
          .bind(id(), w, user.userId, user.email, user.displayName, "owner"),
        audit(w, user.displayName, "Workspace created", w, name),
      ]);
      return json({ workspace: w });
    }
    if (b.action === "join") {
      const token = z.string().uuid().parse(b.token);
      const invite = await db()
        .prepare(
          "SELECT * FROM invites WHERE id=? AND lower(email)=? AND expires>?",
        )
        .bind(token, user.email.toLowerCase(), now())
        .first<{ workspace: string; role: string }>();
      if (!invite)
        throw new Error(
          "Invitation unavailable, expired, or addressed to another email.",
        );
      await db().batch([
        db()
          .prepare(
            "INSERT OR IGNORE INTO members(id,workspace,user,email,name,role) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            id(),
            invite.workspace,
            user.userId,
            user.email,
            user.displayName,
            invite.role,
          ),
        db().prepare("DELETE FROM invites WHERE id=?").bind(token),
        audit(
          invite.workspace,
          user.displayName,
          "Member joined",
          user.userId,
          invite.role,
        ),
      ]);
      return json({ workspace: invite.workspace });
    }
    const { workspace, member } = await context(req);
    const manager = ["owner", "manager"].includes(member.role);
    const actor = user.displayName;
    if (b.action === "save") {
      const kind = z
        .enum(["asset", "order", "sensor", "plan", "manual", "comment"])
        .parse(b.kind);
      const data = schemas[kind].parse(b.data) as Record<string, any>;
      const old = b.id ? await record(workspace, b.id) : null;
      if (b.id && !old) throw new Error("Record not found.");
      if (old && old.kind !== kind) throw new Error("Record type mismatch.");
      authorize(
        member.role,
        kind,
        old ? JSON.parse(old.data) : null,
        data,
        user.userId,
      );
      if (data.assetId) {
        const a = await record(workspace, data.assetId);
        if (!a || a.kind !== "asset")
          throw new Error("Select an asset in this workspace.");
      }
      if (data.orderId) {
        const o = await record(workspace, data.orderId);
        if (!o || o.kind !== "order") throw new Error("Work order not found.");
        if (
          member.role === "technician" &&
          JSON.parse(o.data).assignee !== user.userId
        )
          throw new Error("Forbidden");
      }
      if (data.assignee && !(await membership(workspace, data.assignee)))
        throw new Error("Assignee is not a workspace member.");
      if (kind === "comment") data.author = actor;
      const rid = old?.id || id();
      if (old) {
        if (b.version !== old.version)
          throw new Error("Edit conflict. Reload and try again.");
        const result = await db().batch([
          db()
            .prepare(
              "UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND workspace=? AND version=?",
            )
            .bind(JSON.stringify(data), now(), rid, workspace, b.version),
          db()
            .prepare(
              "INSERT INTO events(id,workspace,actor,action,target,detail,created) SELECT ?,?,?,?,?,?,? WHERE changes()=1",
            )
            .bind(
              id(),
              workspace,
              actor,
              kind + " updated",
              rid,
              kind === "order"
                ? `${JSON.parse(old.data).status} → ${data.status}`
                : data.name || data.title || kind,
              now(),
            ),
          ...(kind === 'sensor' ? [db().prepare('INSERT INTO records(id,workspace,kind,data,version,created,updated) SELECT ?,?,?,?,1,?,? WHERE changes()=1').bind(id(),workspace,'reading',JSON.stringify({...data,sensorId:rid}),now(),now())] : []),
        ]);
        if (!result[0].meta.changes)
          throw new Error("Edit conflict. Reload and try again.");
      } else
        await db().batch([
          insert(workspace, kind, data, rid),
          audit(
            workspace,
            actor,
            kind + " created",
            rid,
            data.title || data.name || data.text || kind,
          ),
          ...(kind === 'sensor' ? [insert(workspace, 'reading', {...data,sensorId:rid})] : []),
        ]);
      return json({ id: rid });
    }
    if (b.action === "import") {
      if (!manager) throw new Error("Forbidden");
      const rows = z.array(schemas.sensor).min(1).max(100).parse(b.rows);
      const uniqueAssets = [...new Set(rows.map((r) => r.assetId))];
      for (const aid of uniqueAssets) {
        const a = await record(workspace, aid);
        if (!a || a.kind !== "asset")
          throw new Error("Import references an unknown asset.");
      }
      const statements = [];
      for (const row of rows) {
        const data = { ...row, source: "Imported" };
        const hash = async (value:unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
        const sid = 'ingest-'+await hash([workspace,row.assetId,row.name,row.unit]);
        const readingId = 'reading-'+await hash([sid,data]);
        const time=now();
        statements.push(
          db().prepare("INSERT INTO records(id,workspace,kind,data,version,created,updated) VALUES(?,?,'sensor',?,1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1,updated=excluded.updated WHERE json_extract(excluded.data,'$.recorded')>json_extract(records.data,'$.recorded')").bind(sid,workspace,JSON.stringify(data),time,time),
          insert(workspace, "reading", { ...data, sensorId: sid },readingId,true),
        );
      }
      statements.push(
        audit(
          workspace,
          actor,
          "Readings imported",
          workspace,
          rows.length + " validated readings",
        ),
      );
      const results=await db().batch(statements);
      return json({ imported: results.filter((_,index)=>index%2===1).reduce((sum,r)=>sum+Number(r.meta.changes||0),0) });
    }
    if (b.action === "delete") {
      if (!manager) throw new Error("Forbidden");
      const r = await record(workspace, b.id);
      if (!r) throw new Error("Record not found.");
      if (r.kind === "order")
        throw new Error(
          "Work orders are retained for audit. Reopen or complete them instead.",
        );
      if (r.kind === "asset") {
        const related = await db()
          .prepare(
            "SELECT id FROM records WHERE workspace=? AND json_extract(data,'$.assetId')=? LIMIT 1",
          )
          .bind(workspace, r.id)
          .first();
        if (related)
          throw new Error(
            "This asset has linked records. Set it Offline to retain its history.",
          );
      }
      await db().batch([
        db()
          .prepare("DELETE FROM records WHERE id=? AND workspace=?")
          .bind(r.id, workspace),
        audit(workspace, actor, "Record deleted", r.id, r.kind),
      ]);
      return json({ ok: true });
    }
    if (b.action === "invite") {
      if (!manager) throw new Error("Forbidden");
      const email = z.string().email().parse(b.email).toLowerCase();
      const role = z.enum(["manager", "technician", "viewer"]).parse(b.role);
      if (member.role !== "owner" && role === "manager")
        throw new Error("Only owners can invite managers.");
      const token = id();
      await db().batch([
        db()
          .prepare(
            "INSERT INTO invites(id,workspace,email,role,expires) VALUES(?,?,?,?,?)",
          )
          .bind(
            token,
            workspace,
            email,
            role,
            new Date(Date.now() + 7 * 86400000).toISOString(),
          ),
        audit(
          workspace,
          actor,
          "Invitation created",
          token,
          email + " · " + role,
        ),
      ]);
      return json({ token });
    }
    if (b.action === "revokeInvite") {
      if (!manager) throw new Error("Forbidden");
      await db()
        .prepare("DELETE FROM invites WHERE id=? AND workspace=?")
        .bind(b.id, workspace)
        .run();
      return json({ ok: true });
    }
    if (b.action === "role") {
      if (member.role !== "owner") throw new Error("Forbidden");
      const role = roleSchema.exclude(["owner"]).parse(b.role);
      const target = await membership(workspace, b.user);
      if (!target || target.role === "owner")
        throw new Error("The workspace owner role cannot be changed.");
      await db().batch([
        db()
          .prepare("UPDATE members SET role=? WHERE workspace=? AND user=?")
          .bind(role, workspace, b.user),
        audit(workspace, actor, "Role changed", b.user, role),
      ]);
      return json({ ok: true });
    }
    if (b.action === "draft") {
      if (!manager) throw new Error("Forbidden");
      const notes = z.string().min(10).max(6000).parse(b.notes);
      if (!b.useAI) return json(draftFromNotes(notes));
      if (!aiEnv.OPENAI_API_KEY)
        throw new Error(
          "Generative AI is not configured. Use a rules-based draft.",
        );
      const stamp = now();
      const reservation = await db()
        .prepare(
          "INSERT INTO events(id,workspace,actor,action,target,detail,created) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM events WHERE workspace=? AND actor=? AND action=? AND created>?)<5",
        )
        .bind(
          id(),
          workspace,
          actor,
          "AI draft requested",
          workspace,
          "Draft requested; provider output requires human review",
          stamp,
          workspace,
          actor,
          "AI draft requested",
          new Date(Date.now() - 60000).toISOString(),
        )
        .run();
      if (!reservation.meta.changes)
        throw new Error("Limit of 5 AI drafts per minute reached.");
      return json(
        await generateDraft(
          notes,
          aiEnv.OPENAI_API_KEY,
          aiEnv.OPENAI_MODEL || "gpt-5-mini",
        ),
      );
    }
    if (b.action === "searchManuals") {
      const query = z
        .string()
        .trim()
        .min(2)
        .max(500)
        .parse(b.query)
        .toLowerCase();
      const manuals = (
        await db()
          .prepare(
            "SELECT id,data FROM records WHERE workspace=? AND kind='manual'",
          )
          .bind(workspace)
          .all()
      ).results as any[];
      const words = query.split(/\W+/).filter((w) => w.length > 2);
      const results = manuals
        .flatMap((m) => {
          const d = JSON.parse(m.data);
          return d.text
            .split(/\n\s*\n/)
            .map((text: string, i: number) => ({
              manualId: m.id,
              assetId: d.assetId,
              title: d.title,
              section: i + 1,
              text: text.slice(0, 1600),
              score: words.filter((w) => text.toLowerCase().includes(w)).length,
            }));
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      return json({
        results,
        method:
          "Keyword retrieval from your uploaded text; excerpts are source citations, not generated instructions.",
      });
    }
    if (b.action === "scenario") {
      if (!manager) throw new Error("Forbidden");
      const a = await record(workspace, b.assetId);
      if (!a || a.kind !== "asset") throw new Error("Asset not found.");
      const scenario = z
        .enum(["overheat", "vibration", "disconnect", "recover"])
        .parse(b.scenario);
      const sr = await db()
        .prepare(
          "SELECT * FROM records WHERE workspace=? AND kind='sensor' AND json_extract(data,'$.assetId')=? AND json_extract(data,'$.source')='Simulation' LIMIT 1",
        )
        .bind(workspace, b.assetId)
        .first<any>();
      let d = sr
        ? JSON.parse(sr.data)
        : {
            assetId: b.assetId,
            name: "Temperature",
            unit: "°C",
            limit: 80,
            value: 60,
            connected: true,
            source: "Simulation",
          };
      d = { ...d, recorded: now(), connected: scenario !== "disconnect" };
      if (scenario === "overheat")
        d = { ...d, name: "Temperature", unit: "°C", limit: 80, value: 104 };
      if (scenario === "vibration")
        d = { ...d, name: "Vibration", unit: "mm/s", limit: 12, value: 16 };
      if (scenario === "recover") d.value = d.limit * 0.65;
      const sid = sr?.id || id();
      const readingId = id();
      await db().batch([
        sr
          ? db()
              .prepare(
                "UPDATE records SET data=?,updated=?,version=version+1 WHERE id=? AND workspace=?",
              )
              .bind(JSON.stringify(d), now(), sid, workspace)
          : insert(workspace, "sensor", d, sid),
        insert(workspace, "reading", { ...d, sensorId: sid }, readingId),
        audit(
          workspace,
          actor,
          "Simulation: " + scenario,
          b.assetId,
          condition(d).reason,
        ),
      ]);
      return json({ sensorId: sid });
    }
    if (b.action === "reading") {
      if (!manager) throw new Error("Forbidden");
      const s = await record(workspace, b.id);
      if (!s || s.kind !== "sensor") throw new Error("Sensor not found.");
      const d = sensorUpdate(JSON.parse(s.data), b.value);
      await db().batch([
        db()
          .prepare(
            "UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND workspace=?",
          )
          .bind(JSON.stringify(d), now(), s.id, workspace),
        insert(workspace, "reading", { ...d, sensorId: s.id }),
        audit(workspace, actor, "Reading recorded", s.id, condition(d).reason),
      ]);
      return json({ ok: true });
    }
    if (b.action === "seed") {
      if (!manager) throw new Error("Forbidden");
      const count = await db()
        .prepare("SELECT COUNT(*) AS n FROM records WHERE workspace=?")
        .bind(workspace)
        .first<{ n: number }>();
      if (count?.n)
        throw new Error(
          "Sample data can only be loaded into an empty workspace.",
        );
      const assets = [
        ["Centrifugal pump P-101", "Pump", "Utility plant", "Critical"],
        ["Air compressor C-204", "Compressor", "Production floor", "High"],
        ["Conveyor CV-03", "Conveyor", "Packing line", "Medium"],
        ["Air handler AHU-01", "HVAC", "Building A", "High"],
        ["Backup generator G-01", "Generator", "Service yard", "Critical"],
        ["Cooling tower CT-02", "Cooling", "Utility plant", "Medium"],
      ];
      const statements = [];
      for (let i = 0; i < assets.length; i++) {
        const aid = id();
        const [name, type, location, criticality] = assets[i];
        statements.push(
          insert(
            workspace,
            "asset",
            schemas.asset.parse({
              name,
              type,
              location,
              criticality,
              serial: "DEMO-" + (100 + i),
              notes: "Sample asset. Replace with your equipment records.",
            }),
            aid,
          ),
        );
        const sd = {
          assetId: aid,
          name: i % 2 ? "Vibration" : "Temperature",
          unit: i % 2 ? "mm/s" : "°C",
          limit: i % 2 ? 12 : 80,
          value: i === 0 ? 104 : i % 2 ? 6 : 58,
          source: "Simulation",
          recorded: now(),
          connected: true,
        };
        const sid = id();
        statements.push(
          insert(workspace, "sensor", sd, sid),
          insert(workspace, "reading", { ...sd, sensorId: sid }),
        );
        if (i < 3)
          statements.push(
            insert(
              workspace,
              "order",
              schemas.order.parse({
                assetId: aid,
                title: [
                  "Inspect pump temperature excursion",
                  "Inspect compressor drive belt",
                  "Lubricate conveyor bearings",
                ][i],
                priority: i === 0 ? "Critical" : "Medium",
                due: addDays(businessDate(), i - 1),
                assignee: user.userId,
                description:
                  "Sample work order for exploring the maintenance workflow.",
                checklist: [
                  {
                    text: "Inspect equipment and record observations",
                    done: false,
                  },
                  { text: "Verify operation after maintenance", done: false },
                ],
              }),
            ),
          );
        statements.push(
          insert(
            workspace,
            "plan",
            schemas.plan.parse({
              assetId: aid,
              title: "Routine " + type.toLowerCase() + " inspection",
              intervalDays: 30,
              nextDue: addDays(businessDate(), 7),
              assignee: user.userId,
              checklist: [
                "Inspect for wear and leaks",
                "Check connections",
                "Record measurements",
              ],
            }),
          ),
        );
        statements.push(
          insert(workspace, "manual", {
            assetId: aid,
            title: name + " · sample inspection guide",
            text: "SAMPLE GUIDE — replace with the manufacturer documentation.\n\nInspection: record temperature, vibration and visible condition before starting work.\n\nEscalation: abnormal readings require assessment by a qualified technician. Follow your facility isolation and lockout procedures.\n\nCompletion: record repair notes and measurements, then submit for manager verification.",
          }),
        );
      }
      statements.push(
        audit(
          workspace,
          actor,
          "Sample workspace loaded",
          workspace,
          "Six sample assets and simulated readings.",
        ),
      );
      await db().batch(statements);
      return json({ ok: true });
    }
    if (b.action === "generate") {
      if (!manager) throw new Error("Forbidden");
      const all = (
        await db()
          .prepare("SELECT * FROM records WHERE workspace=?")
          .bind(workspace)
          .all()
      ).results as any[];
      const active = all.filter(
        (r) => r.kind === "order" && JSON.parse(r.data).status !== "Done",
      );
      let created = 0;
      const insertPositions:number[]=[];
      const statements = [];
      const today = businessDate();
      for (const r of all) {
        const d = JSON.parse(r.data);
        const sensor =
          r.kind === "sensor" &&
          ["Critical", "High", "Offline", "Stale"].includes(
            condition(d).severity,
          );
        const plan = r.kind === "plan" && d.enabled && d.nextDue <= today;
        if (!sensor && !plan) continue;
        if (active.some((o) => JSON.parse(o.data).sourceId === r.id)) continue;
        const source = sensor ? "Condition" : "Preventive";
        const oid = `auto-${r.id}-${sensor ? d.recorded : d.nextDue}`;
        const exists = all.some((o) => o.id === oid);
        if (exists) continue;
        const order = schemas.order.parse({
          assetId: d.assetId,
          title: sensor ? condition(d).severity + " · " + d.name : d.title,
          description: sensor
            ? condition(d).reason
            : "Scheduled preventive maintenance",
          priority:
            sensor && condition(d).severity === "Critical"
              ? "Critical"
              : sensor
                ? "High"
                : "Medium",
          due: today,
          assignee: d.assignee || "",
          source,
          sourceId: r.id,
          checklist: (
            d.checklist || ["Inspect and record condition", "Verify operation"]
          ).map((text: string) => ({ text, done: false })),
        });
        insertPositions.push(statements.length);
        statements.push(
          insert(workspace, "order", order, oid, true),
          db().prepare('INSERT INTO events(id,workspace,actor,action,target,detail,created) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id(),workspace,actor,'Work order generated',oid,source+': '+order.title,now()),
        );
        if (plan) {
          const nextDue = addDays(today, d.intervalDays);
          statements.push(
            db()
              .prepare(
                "UPDATE records SET data=?,updated=?,version=version+1 WHERE id=? AND workspace=?",
              )
              .bind(JSON.stringify({ ...d, nextDue }), now(), r.id, workspace),
          );
        }
        created++;
      }
      if (statements.length) {const results=await db().batch(statements);created=insertPositions.reduce((sum,pos)=>sum+Number(results[pos].meta.changes||0),0);}
      return json({ created });
    }
    throw new Error("Unknown action.");
  } catch (e) {
    return fail(e);
  }
}
function sensorUpdate(old: Record<string, any>, value: unknown) {
  return schemas.sensor.parse({
    ...old,
    value: z.number().finite().parse(value),
    recorded: now(),
    connected: true,
  });
}
