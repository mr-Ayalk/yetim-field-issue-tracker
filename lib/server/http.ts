import { NextResponse } from "next/server";
import { parseRoleHeader } from "@/lib/domain/validation";
import type { Result } from "@/lib/domain/types";
import type { RequestContext } from "@/lib/server/report-service";

export function readContext(request: Request): RequestContext {
  const actor = request.headers.get("x-yetim-actor")?.replace(/[\r\n]/g, "").trim() ?? "";
  return {
    role: parseRoleHeader(request.headers.get("x-yetim-role")),
    actorName: actor.slice(0, 80) || "Field officer",
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function toResponse<T>(result: Result<T>, successStatus = 200): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    result.meta ? { data: result.data, meta: result.meta } : { data: result.data },
    { status: successStatus },
  );
}

export function unexpected(error: unknown): NextResponse {
  console.error("[yetim] request failed", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL",
        message: "Something went wrong on the server. Reports saved on this device are still here.",
      },
    },
    { status: 500 },
  );
}

export function demoFaultResponse(request: Request): NextResponse | null {
  if (process.env.YETIM_DEMO_MODE === "false") return null;
  const fault = request.headers.get("x-yetim-fault");
  if (fault === "503") {
    return NextResponse.json(
      {
        error: {
          code: "SYNC_NETWORK_ERROR",
          message: "Simulated service unavailable. Nothing was written.",
          details: { simulated: true },
        },
      },
      { status: 503 },
    );
  }
  if (fault === "validation") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Simulated validation failure. Nothing was written.",
          details: { simulated: true, fields: { description: "Simulated rejection." } },
        },
      },
      { status: 422 },
    );
  }
  return null;
}

export async function demoTimeout(request: Request): Promise<NextResponse | null> {
  if (process.env.YETIM_DEMO_MODE === "false") return null;
  if (request.headers.get("x-yetim-fault") !== "timeout") return null;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 20_000);
    request.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return NextResponse.json(
    {
      error: {
        code: "SYNC_NETWORK_ERROR",
        message: "Simulated timeout. Nothing was written.",
        details: { simulated: true },
      },
    },
    { status: 503 },
  );
}
