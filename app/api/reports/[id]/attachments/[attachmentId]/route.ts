import { NextResponse } from "next/server";
import { getRepository } from "@/lib/server/get-repository";
import { unexpected } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { attachmentId } = await context.params;
    const attachment = await getRepository().getAttachment(attachmentId);
    if (!attachment) {
      return NextResponse.json(
        { error: { code: "REPORT_NOT_FOUND", message: "That image could not be found." } },
        { status: 404 },
      );
    }
    return new NextResponse(Buffer.from(attachment.content), {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.sizeBytes),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return unexpected(error);
  }
}
