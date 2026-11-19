CREATE TABLE post_images (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),
  data BLOB NOT NULL CHECK (length(data) BETWEEN 1 AND 786432),
  UNIQUE (post_id, position)
);
CREATE INDEX post_images_post ON post_images(post_id);

CREATE TABLE email_subscriptions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'unsubscribed')),
  confirm_hash TEXT,
  confirm_expires_at TEXT,
  unsubscribe_token TEXT NOT NULL,
  last_verification_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (post_id, email)
);
CREATE UNIQUE INDEX subscriptions_confirm ON email_subscriptions(confirm_hash) WHERE confirm_hash IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_unsubscribe ON email_subscriptions(unsubscribe_token);

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES email_subscriptions(id) ON DELETE CASCADE,
  source_post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verification', 'reply')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  UNIQUE (subscription_id, source_post_id, kind)
);
CREATE INDEX outbox_pending ON email_outbox(state, next_attempt_at);
