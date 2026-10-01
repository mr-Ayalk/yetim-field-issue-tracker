import { getRepository } from "@/lib/server/get-repository";
import { readContext, readJson, toResponse, unexpected } from "@/lib/server/http";
import { changeStatus } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return toResponse(await changeStatus(getRepository(), id, await readJson(request), readContext(request)));
  } catch (error) {
    return unexpected(error);
  }
}
