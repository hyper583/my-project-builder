import { NextResponse } from "next/server";

import { LIMITS } from "@/config/limits";
import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, toUserMessage } from "@/server/errors";
import { ingestDocument, type IngestResult } from "@/server/services/documents/ingest";
import { checkRateLimit } from "@/server/services/rate-limit";

/**
 * Document upload.
 *
 * A route handler rather than a Server Action because file bodies exceed the
 * default action body limit, and streaming multipart is handled natively here.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/documents">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser();
    const projectId = await assertProjectOwnership(id, user);

    await checkRateLimit(`upload:${user.id}`, ...LIMITS.rateLimit.upload);

    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const category = form.get("category");

    if (files.length === 0) {
      throw new AppError("UPLOAD_REJECTED", { message: "No files received" });
    }
    if (files.length > 10) {
      throw new AppError("UPLOAD_REJECTED", { message: "Too many files at once" });
    }

    const results: IngestResult[] = [];
    const failures: Array<{ filename: string; message: string }> = [];

    // Each file succeeds or fails on its own — one bad document must not
    // discard the others in the same batch.
    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        results.push(
          await ingestDocument({
            projectId,
            filename: file.name,
            declaredType: file.type,
            category: typeof category === "string" ? category : null,
            buffer,
          }),
        );
      } catch (error) {
        failures.push({ filename: file.name, message: toUserMessage(error).message });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "document.upload",
        targetType: "project",
        targetId: projectId,
        metadata: { uploaded: results.length, failed: failures.length },
      },
    });

    return NextResponse.json({ ok: true, results, failures });
  } catch (error) {
    const { code, message } = toUserMessage(error);
    const status = code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : code === "RATE_LIMITED" ? 429 : 400;
    return NextResponse.json({ ok: false, code, message }, { status });
  }
}
