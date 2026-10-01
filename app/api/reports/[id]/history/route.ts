import { getRepository } from "@/lib/server/get-repository";
import { readContext, toResponse, unexpected } from "@/lib/server/http";
import { getHistory } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return toResponse(await getHistory(getRepository(), id, readContext(request)));
  } catch (error) {
    return unexpected(error);
  }
}
