import { getRepository } from "@/lib/server/get-repository";
import { readContext, readJson, toResponse, unexpected } from "@/lib/server/http";
import { getReport, updateReport } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return toResponse(await getReport(getRepository(), id, readContext(request)));
  } catch (error) {
    return unexpected(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return toResponse(await updateReport(getRepository(), id, await readJson(request), readContext(request)));
  } catch (error) {
    return unexpected(error);
  }
}
