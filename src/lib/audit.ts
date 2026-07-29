import type { Prisma } from "@/generated/prisma/client";

export type AuditAction =
  | "created"
  | "saved_draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "voided_resubmitted";

// Shared write path for every attendance-form state change (T-2 / NFR-2 / NFR-4).
// Takes a transaction client so callers can log inside the same transaction as
// the state change itself.
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  params: {
    formId: string;
    action: AuditAction;
    operatorName: string;
    note?: string | null;
  }
) {
  return tx.auditLog.create({
    data: {
      formId: params.formId,
      action: params.action,
      operatorName: params.operatorName,
      note: params.note ?? null,
    },
  });
}
