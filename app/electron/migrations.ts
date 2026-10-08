import type { DatabaseSync } from "node:sqlite";

/**
 * Schema fix-ups, run once per database in order. The count of applied
 * migrations is stored in PRAGMA user_version, so add new ones at the end.
 */
export const migrations: ((db: DatabaseSync) => void)[] = [
  // 1: baseline. Installs up to 1.2.1 wrote user_version=1 and are already here.
  () => {},
  // 2: give every job a queueOrder; the queue used to patch this on every start.
  (db) => {
    const update = db.prepare("UPDATE jobs SET data=? WHERE id=?");
    for (const row of db.prepare("SELECT id, data FROM jobs").all() as {
      id: string;
      data: string;
    }[])
      try {
        const job = JSON.parse(row.data);
        if (job.queueOrder === undefined && job.createdAt !== undefined)
          update.run(
            JSON.stringify({ ...job, queueOrder: job.createdAt }),
            row.id,
          );
      } catch {
        // An unreadable row is left for the app to report, not for startup to die on.
      }
  },
];

export function migrate(db: DatabaseSync) {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (version >= migrations.length) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let i = version; i < migrations.length; i++) migrations[i](db);
    db.exec(`PRAGMA user_version=${migrations.length}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
