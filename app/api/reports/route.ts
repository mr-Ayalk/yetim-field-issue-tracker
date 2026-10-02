import { getRepository } from "@/lib/server/get-repository";
import { demoFaultResponse, demoTimeout, readContext, readJson, toResponse, unexpected } from "@/lib/server/http";
import { createReport, ensureDemoSeed, listReports } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const repo = getRepository();
    await ensureDemoSeed(repo);
    const url = new URL(request.url);
    const query = Object.fromEntries(
      [...url.searchParams.entries()].filter(([, value]) => value !== ""),
    );
    return toResponse(await listReports(repo, query, readContext(request)));
  } catch (error) {
    return unexpected(error);
  }
}

export async function POST(request: Request) {
  try {
    const fault = demoFaultResponse(request);
    if (fault) return fault;
    const timeout = await demoTimeout(request);
    if (timeout) return timeout;
    const result = await createReport(getRepository(), await readJson(request), readContext(request));
    return toResponse(result, result.ok && !result.meta?.idempotent ? 201 : 200);
  } catch (error) {
    return unexpected(error);
  }
}
