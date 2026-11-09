CREATE TABLE family_requests (
  id uuid PRIMARY KEY,
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  information jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  revision uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  review_note text NOT NULL DEFAULT '',
  family_id uuid REFERENCES families(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX family_requests_one_pending ON family_requests(submitted_by) WHERE status='pending';
CREATE INDEX family_requests_status_idx ON family_requests(status,created_at);
ALTER TABLE family_requests ENABLE ROW LEVEL SECURITY;
