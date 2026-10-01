import { getRepository } from "@/lib/server/get-repository";
import { demoFaultResponse, demoTimeout, readContext, readJson, toResponse, unexpected } from "@/lib/server/http";
import { syncOperations } from "@/lib/server/sync-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const fault = demoFaultResponse(request);
    if (fault) return fault;
    const timeout = await demoTimeout(request);
    if (timeout) return timeout;
    return toResponse(await syncOperations(getRepository(), await readJson(request), readContext(request)));
  } catch (error) {
    return unexpected(error);
  }
}
