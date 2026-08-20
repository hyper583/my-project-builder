import { requireUser } from "@/server/dal/session";
import { toUserMessage } from "@/server/errors";
import { readExport } from "@/server/services/export";

/**
 * Serves a finished export.
 *
 * Exports are stored outside `public/`, so this route is the only way to
 * reach one. Ownership is re-checked against the signed-in user rather than
 * trusted from the id in the URL, which means a guessed id returns 404 rather
 * than someone else's document.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/exports/[exportId]">) {
  try {
    const { exportId } = await ctx.params;
    const user = await requireUser();
    const file = await readExport(exportId, user);

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        // The filename is quoted and ASCII-sanitised upstream, so it cannot
        // break out of the header and inject one of its own.
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": String(file.bytes.byteLength),
        // A student's own document should never be cached by a shared proxy.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const { code, message } = toUserMessage(error);
    const status = code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : 400;
    return Response.json({ ok: false, code, message }, { status });
  }
}
