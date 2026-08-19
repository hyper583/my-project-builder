import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { toUserMessage } from "@/server/errors";
import { storage } from "@/server/services/storage";

/**
 * Serves an uploaded file.
 *
 * Uploads are stored outside `public/`, so this ownership-checked handler is
 * the only route to them. Content-Disposition is attachment and the content
 * type is the one we detected at upload — never the browser-supplied one — so
 * an uploaded document can never be rendered as active content in our origin.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[id]/documents/[docId]/raw">,
) {
  try {
    const { id, docId } = await ctx.params;
    const user = await requireUser();
    const projectId = await assertProjectOwnership(id, user);

    const document = await prisma.projectDocument.findFirst({
      where: { id: docId, projectId },
      select: { storageKey: true, mimeType: true, originalName: true, sizeBytes: true },
    });
    if (!document) return new Response("Not found", { status: 404 });

    const data = await storage.get(document.storageKey);
    // Allowlist rather than a denylist: quotes, backslashes, control characters
    // and anything else that could break out of the header value are replaced.
    const safeName =
      document.originalName.replace(/[^A-Za-z0-9 ._()-]+/g, "_").slice(0, 200) || "document";

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(document.sizeBytes),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const { code, message } = toUserMessage(error);
    return new Response(message, { status: code === "UNAUTHENTICATED" ? 401 : 404 });
  }
}
