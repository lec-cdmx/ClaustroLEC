// Local SQLite adapter for exercising the exact SQL used by the D1 Worker.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function localDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON');
  const binding = {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const query = args => ({
        bind: (...values) => query(values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value)),
        async all() { return { results: statement.all(...args).map(row => ({ ...row })) }; },
        async first() { const row = statement.get(...args); return row ? { ...row } : null; },
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
      });
      return query([]);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return binding;
}

export function migrate(binding) {
  binding.sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  const directory = new URL('../../server/forum/migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    if (binding.sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name)) continue;
    binding.sqlite.exec('BEGIN');
    try {
      binding.sqlite.exec(readFileSync(new URL(name, directory), 'utf8'));
      binding.sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);
      binding.sqlite.exec('COMMIT');
    } catch (error) { binding.sqlite.exec('ROLLBACK'); throw error; }
  }
}

export function rateLimit(max) {
  const attempts = new Map();
  return { async limit({ key }) {
    const now = Date.now();
    let window = attempts.get(key);
    if (!window || now - window.start >= 60000) { window = { start: now, count: 0 }; attempts.set(key, window); }
    return { success: ++window.count <= max };
  } };
}
