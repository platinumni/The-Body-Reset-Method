// Change history. Before anything editable is changed, its previous version is saved
// here, so the owner can see what changed and put an old version back.

export type EntityType = "lesson" | "product" | "setting";

export type Revision = { id: number; entity_type: EntityType; entity_id: string; snapshot_json: string; note: string | null; actor_user_id: number | null; created_at: string };

export function saveRevisionStmt(db: D1Database, type: EntityType, id: string | number, before: unknown, actor: number | null, note?: string): D1PreparedStatement {
  return db
    .prepare("INSERT INTO revisions (entity_type, entity_id, snapshot_json, note, actor_user_id) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(type, String(id), JSON.stringify(before), note ?? null, actor);
}

export async function listRevisions(db: D1Database, type: EntityType, id: string | number, limit = 50): Promise<Revision[]> {
  const { results } = await db
    .prepare("SELECT * FROM revisions WHERE entity_type = ?1 AND entity_id = ?2 ORDER BY id DESC LIMIT ?3")
    .bind(type, String(id), limit)
    .all<Revision>();
  return results;
}

export async function getRevision(db: D1Database, revisionId: number): Promise<Revision | null> {
  return db.prepare("SELECT * FROM revisions WHERE id = ?1").bind(revisionId).first<Revision>();
}
