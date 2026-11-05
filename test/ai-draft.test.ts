import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDraft } from "../lib/ai-draft.ts";
test("provider draft uses strict structured output and never completes work", async () => {
  const request = async (_url: any, options: any) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.strict, true);
    assert.equal(payload.text.format.schema.additionalProperties, false);
    assert.match(payload.instructions, /Do not invent/);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                title: "Inspect pump seal",
                description: "Reported leak; cause unconfirmed.",
                priority: "High",
                checklist: ["Inspect and document the seal condition"],
              }),
            },
          ],
        },
      ],
    });
  };
  const result = await generateDraft(
    "Pump leaking",
    "test-only-key",
    "test-model",
    request as typeof fetch,
  );
  assert.equal(result.checklist[0].done, false);
  assert.match(result.method, /human review/);
});
test("invalid model output, incomplete responses and provider errors fail safely", async () => {
  await assert.rejects(
    () =>
      generateDraft(
        "Pump leaking",
        "test",
        "test",
        async () => Response.json({ status: "incomplete" }) as any,
      ),
    /incomplete/,
  );
  await assert.rejects(
    () =>
      generateDraft(
        "Pump leaking",
        "test",
        "test",
        async () => new Response("", { status: 429 }) as any,
      ),
    /quota or rate limit/,
  );
  await assert.rejects(() =>
    generateDraft(
      "Pump leaking",
      "test",
      "test",
      async () =>
        Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"title":"bad"}' }],
            },
          ],
        }) as any,
    ),
  );
});
