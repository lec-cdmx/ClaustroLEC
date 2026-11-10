CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  campus TEXT NOT NULL,
  email TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX posts_status_created ON posts (status, created_at, id);
