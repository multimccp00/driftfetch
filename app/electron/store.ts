import { DatabaseSync, type StatementSync } from "node:sqlite";
import fs from "node:fs";
import { migrate } from "./migrations";
import type { Job, Settings, SessionInfo, Capture } from "../src/shared";
export class Store {
  db: DatabaseSync;
  recoveredDatabase?: string;
  private statements = new Map<string, StatementSync>();
  constructor(file: string) {
    try {
      this.db = this.open(file);
    } catch (error) {
      if (!/malformed|not a database|file is encrypted/i.test(String(error)))
        throw error;
      const recovered = `${file}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(file, recovered);
        for (const suffix of ["-wal", "-shm"])
          if (fs.existsSync(file + suffix))
            fs.renameSync(file + suffix, recovered + suffix);
      } catch {
        throw error;
      }
      this.recoveredDatabase = recovered;
      this.db = this.open(file);
    }
  }
  private stmt(sql: string) {
    let statement = this.statements.get(sql);
    if (!statement)
      this.statements.set(sql, (statement = this.db.prepare(sql)));
    return statement;
  }
  private open(file: string) {
    const db = new DatabaseSync(file);
    try {
      db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (domain TEXT PRIMARY KEY, data TEXT NOT NULL, secret BLOB);",
      );
      db.exec(
        "CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL)",
      );
      migrate(db);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }
  captures(): Capture[] {
    return (
      this.stmt(
        "SELECT data FROM captures ORDER BY at DESC, rowid DESC LIMIT 100",
      ).all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  saveCapture(capture: Capture) {
    this.stmt("INSERT INTO captures VALUES (?,?,?)").run(
      capture.id,
      capture.at,
      JSON.stringify(capture),
    );
    this.db.exec(
      "DELETE FROM captures WHERE id NOT IN (SELECT id FROM captures ORDER BY at DESC, rowid DESC LIMIT 100)",
    );
  }
  clearCaptures() {
    this.db.exec("DELETE FROM captures");
  }
  jobs(): Job[] {
    return (this.stmt("SELECT data FROM jobs").all() as { data: string }[]).map(
      (r) => JSON.parse(r.data),
    );
  }
  saveJob(job: Job) {
    this.stmt(
      "INSERT INTO jobs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(job.id, JSON.stringify(job));
  }
  removeJob(id: string) {
    this.stmt("DELETE FROM jobs WHERE id=?").run(id);
  }
  settings(defaults: Settings): Settings {
    const row = this.stmt("SELECT data FROM settings WHERE id=1").get() as
      { data: string } | undefined;
    return row ? { ...defaults, ...JSON.parse(row.data) } : defaults;
  }
  saveSettings(settings: Settings) {
    this.stmt(
      "INSERT INTO settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(JSON.stringify(settings));
  }
  sessions(): SessionInfo[] {
    return (
      this.stmt("SELECT data FROM sessions").all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  saveSession(info: SessionInfo, secret?: Buffer) {
    this.stmt(
      "INSERT INTO sessions VALUES (?,?,?) ON CONFLICT(domain) DO UPDATE SET data=excluded.data,secret=excluded.secret",
    ).run(info.domain, JSON.stringify(info), secret ?? null);
  }
  sessionSecret(domain: string): Buffer | undefined {
    const r = this.stmt("SELECT secret FROM sessions WHERE domain=?").get(
      domain,
    ) as { secret: Uint8Array | null } | undefined;
    return r?.secret ? Buffer.from(r.secret) : undefined;
  }
  removeSession(domain: string) {
    this.stmt("DELETE FROM sessions WHERE domain=?").run(domain);
  }
  close() {
    this.statements.clear();
    this.db.close();
  }
  /** One commit (one fsync) for a batch of writes. */
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  restore(settings: Settings, jobs: Job[]) {
    this.transaction(() => {
      this.saveSettings(settings);
      jobs.forEach((job) => this.saveJob(job));
    });
  }
  removeJobs(ids: string[]) {
    this.transaction(() => ids.forEach((id) => this.removeJob(id)));
  }
}
