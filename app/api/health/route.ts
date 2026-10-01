import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/domain/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    data: {
      status: "ok",
      service: "yetim",
      version: APP_VERSION,
      time: new Date().toISOString(),
    },
  });
}
