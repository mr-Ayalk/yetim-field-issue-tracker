import { getRepository } from "@/lib/server/get-repository";
import { readContext, toResponse, unexpected } from "@/lib/server/http";
import { resetDemoData } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return toResponse(await resetDemoData(getRepository(), readContext(request)));
  } catch (error) {
    return unexpected(error);
  }
}
