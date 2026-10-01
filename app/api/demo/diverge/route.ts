import { getRepository } from "@/lib/server/get-repository";
import { readContext, readJson, toResponse, unexpected } from "@/lib/server/http";
import { divergeForDemo } from "@/lib/server/report-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { clientId?: string } | null;
    return toResponse(
      await divergeForDemo(getRepository(), body?.clientId ?? "", readContext(request)),
    );
  } catch (error) {
    return unexpected(error);
  }
}
