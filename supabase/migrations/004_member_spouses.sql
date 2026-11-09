ALTER TABLE users ADD COLUMN IF NOT EXISTS spouse_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD CONSTRAINT users_spouse_not_self CHECK (spouse_id IS NULL OR spouse_id <> id);
CREATE INDEX IF NOT EXISTS users_spouse_id_idx ON users(spouse_id);
