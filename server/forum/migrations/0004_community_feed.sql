-- Existing contributions remain in Buenas prácticas with their original IDs.
ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT 'practice'
  CHECK (category IN ('community', 'agenda', 'discussion', 'practice'));
ALTER TABLE posts ADD COLUMN official INTEGER NOT NULL DEFAULT 0 CHECK (official IN (0, 1));
ALTER TABLE posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));

CREATE TABLE post_likes (
  post_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, visitor_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX posts_parent_status ON posts (parent_id, status);
CREATE UNIQUE INDEX one_featured_discussion ON posts(pinned) WHERE pinned = 1;
