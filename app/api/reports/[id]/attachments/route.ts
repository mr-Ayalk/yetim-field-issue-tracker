import { NextResponse } from "next/server";
import { getRepository } from "@/lib/server/get-repository";
import { readContext, readJson, toResponse, unexpected } from "@/lib/server/http";
import { addAttachment, getReport } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const report = await getReport(getRepository(), id, readContext(request));
    if (!report.ok) return toResponse(report);
    const items = await getRepository().listAttachments(report.data.id);
    return NextResponse.json({ data: items });
  } catch (error) {
    return unexpected(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return toResponse(await addAttachment(getRepository(), id, await readJson(request), readContext(request)), 201);
  } catch (error) {
    return unexpected(error);
  }
}
