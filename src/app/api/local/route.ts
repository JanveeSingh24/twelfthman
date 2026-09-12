import { callFoundryLocal, FoundryLocalError, getFoundryLocalStatus } from "@/lib/foundry-local-client";
import type { TaskClass } from "@/lib/router";
import { parseLocalJsonRequest } from "@/lib/local-api-guard";

export const dynamic = "force-dynamic";

const TASK_CLASSES: TaskClass[] = ["summarize", "rewrite", "extract", "table", "draft", "reason"];

export async function GET() {
  return Response.json(await getFoundryLocalStatus(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const parsed = await parseLocalJsonRequest(request, 24_576);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  if (typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
    return Response.json({ error: "Local request must be an object." }, { status: 400 });
  }
  const body = parsed.value as { taskClass?: unknown; prompt?: unknown; context?: unknown };
  if (!TASK_CLASSES.includes(body.taskClass as TaskClass)) {
    return Response.json({ error: "Invalid local task class." }, { status: 400 });
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 2_000) {
    return Response.json({ error: "Local prompt must be between 1 and 2000 characters." }, { status: 400 });
  }
  if (typeof body.context !== "string" || !body.context.trim() || body.context.length > 16_000) {
    return Response.json({ error: "Local context must be between 1 and 16000 characters." }, { status: 400 });
  }

  try {
    return Response.json(await callFoundryLocal(body.taskClass as TaskClass, body.prompt, body.context));
  } catch (error) {
    const message = error instanceof FoundryLocalError ? error.message : "Unexpected local model error.";
    return Response.json({ error: message }, { status: 503 });
  }
}