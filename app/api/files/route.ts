import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
export const dynamic = "force-dynamic";
const reply = (error: string, status: number) =>
  Response.json({ error }, { status });
async function access(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return null;
  const workspace = new URL(req.url).searchParams.get("workspace");
  if (!workspace || !env.DB) return null;
  const member = await env.DB.prepare(
    "SELECT role FROM members WHERE workspace=? AND user=?",
  )
    .bind(workspace, user.userId)
    .first<{ role: string }>();
  return member ? { user, workspace, role: member.role } : null;
}
export async function GET(req: Request) {
  const c = await access(req);
  if (!c) return reply("Forbidden", 403);
  const key = new URL(req.url).searchParams.get("key");
  if (!key?.startsWith(c.workspace + "/") || !env.BUCKET)
    return reply("Not found", 404);
  const object = await env.BUCKET.get(key);
  if (!object) return reply("Not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition":
        'attachment; filename="' +
        encodeURIComponent(key.split("/").pop() || "attachment") +
        '"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
export async function POST(req: Request) {
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== new URL(req.url).origin
  )
    return reply("Forbidden", 403);
  const c = await access(req);
  if (!c || c.role === "viewer") return reply("Forbidden", 403);
  if (!env.BUCKET || !env.DB) return reply("File storage unavailable", 503);
  if (Number(req.headers.get("content-length") || 0) > 6 * 1024 * 1024)
    return reply("Maximum file size is 5 MB", 413);
  const form = await req.formData();
  const file = form.get("file");
  const target = String(form.get("target") || "");
  if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
    return reply("Choose a file up to 5 MB", 400);
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "text/plain",
    ].includes(file.type)
  )
    return reply("Use JPEG, PNG, WebP, PDF or plain text", 400);
  const r = await env.DB.prepare(
    "SELECT kind,data FROM records WHERE id=? AND workspace=?",
  )
    .bind(target, c.workspace)
    .first<{ kind: string; data: string }>();
  if (!r) return reply("Record not found", 404);
  if (
    c.role === "technician" &&
    (r.kind !== "order" || JSON.parse(r.data).assignee !== c.user.userId)
  )
    return reply("Only upload evidence to your assigned work", 403);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const key = c.workspace + "/" + crypto.randomUUID() + "/" + safe;
  await env.BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  const id = crypto.randomUUID(),
    time = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO records(id,workspace,kind,data,version,created,updated) VALUES(?,?,?,?,1,?,?)",
      ).bind(
        id,
        c.workspace,
        "attachment",
        JSON.stringify({
          target,
          key,
          name: file.name,
          type: file.type,
          size: file.size,
        }),
        time,
        time,
      ),
      env.DB.prepare(
        "INSERT INTO events(id,workspace,actor,action,target,detail,created) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        c.workspace,
        c.user.displayName,
        "Attachment uploaded",
        target,
        file.name,
        time,
      ),
    ]);
  } catch {
    await env.BUCKET.delete(key);
    return reply("Could not save attachment metadata", 500);
  }
  return Response.json({ id, key });
}
