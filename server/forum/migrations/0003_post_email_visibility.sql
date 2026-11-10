ALTER TABLE posts ADD COLUMN email_public INTEGER NOT NULL DEFAULT 0 CHECK (email_public IN (0, 1));
