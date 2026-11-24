import { auditLog, getDb } from "@listgate/db";

/** Records who did what. Shown in the admin's Activity page. Never throws. */
export async function audit(e: {
  actor?: { id: string; name: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  agencyId?: string | null;
  data?: Record<string, unknown>;
}) {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({
      actorUserId: e.actor?.id ?? null,
      actorLabel: e.actor?.name ?? "System",
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      agencyId: e.agencyId ?? null,
      data: e.data ?? null,
    });
  } catch (err) {
    console.error("[audit]", err);
  }
}
