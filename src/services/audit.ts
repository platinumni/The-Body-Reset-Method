// Audit log of admin actions. Append-only: entries are never edited or removed.

export type AuditEntry = {
  actorUserId: number | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  detail?: Record<string, unknown>;
  ip?: string;
};

export async function recordAudit(db: D1Database, e: AuditEntry): Promise<void> {
  await db
    .prepare("INSERT INTO audit_log (actor_user_id, action, target_type, target_id, detail_json, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(
      e.actorUserId,
      e.action,
      e.targetType ?? null,
      e.targetId == null ? null : String(e.targetId),
      e.detail ? JSON.stringify(e.detail) : null,
      e.ip ?? null,
    )
    .run();
}

export type AuditRow = { id: number; actor_user_id: number | null; action: string; target_type: string | null; target_id: string | null; detail_json: string | null; created_at: string };

export async function listAudit(db: D1Database, limit = 100): Promise<AuditRow[]> {
  const { results } = await db.prepare("SELECT id, actor_user_id, action, target_type, target_id, detail_json, created_at FROM audit_log ORDER BY id DESC LIMIT ?1").bind(limit).all<AuditRow>();
  return results;
}
