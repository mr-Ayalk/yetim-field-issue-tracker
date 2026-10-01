import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/domain/constants";
import { getRepository } from "@/lib/server/get-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = await getRepository().readiness();
  const body = {
    data: {
      status: ready ? "ready" : "not_ready",
      database: ready ? "up" : "down",
      version: APP_VERSION,
      time: new Date().toISOString(),
    },
  };
  return NextResponse.json(body, { status: ready ? 200 : 503 });
}
