import { prisma } from "@/lib/prisma";

export interface CreateAuditLogParams {
  clubId?: string | null;
  who: string;
  role: "TREASURER" | "MEMBER" | "SYSTEM";
  action: string;
  target: string;
  details?: Record<string, unknown> | string;
}

/**
 * Append-only audit logger.
 * STRICT SECURITY INVARIANT: No update or delete code path exists for AuditLog.
 */
export async function appendAuditLog(params: CreateAuditLogParams) {
  try {
    const detailsStr =
      typeof params.details === "object"
        ? JSON.stringify(params.details)
        : params.details || null;

    return await prisma.auditLog.create({
      data: {
        clubId: params.clubId || null,
        who: params.who,
        role: params.role,
        action: params.action,
        target: params.target,
        details: detailsStr,
      },
    });
  } catch (err) {
    console.error("[AUDIT LOG ERROR] Failed to append audit log:", err);
    // Audit log failures should not crash user operations, but log alert
    return null;
  }
}
