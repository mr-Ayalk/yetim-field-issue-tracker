import { getRepository } from "@/lib/server/get-repository";
import { toResponse, unexpected } from "@/lib/server/http";
import { syncStatus } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return toResponse(await syncStatus(getRepository()));
  } catch (error) {
    return unexpected(error);
  }
}
