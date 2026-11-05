-- Execute uma vez no SQL Editor do Supabase, ou com npm run db:migrate.
CREATE TABLE sectors (
  id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT ''
);
CREATE TABLE users (
  id uuid PRIMARY KEY, username text NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash text NOT NULL, name text NOT NULL, phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '', role text NOT NULL CHECK (role IN ('coordenador','subcoordenador','membro')),
  sector_ids uuid[] NOT NULL DEFAULT '{}', status text NOT NULL CHECK (status IN ('active','pending')),
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz
);
CREATE INDEX users_sectors_idx ON users USING gin (sector_ids);
CREATE INDEX users_status_name_idx ON users(status,name);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE events (
  id uuid PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '',
  date text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'), time text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '', sector_id uuid REFERENCES sectors ON DELETE SET NULL,
  escala_open boolean NOT NULL DEFAULT true, slots integer CHECK (slots BETWEEN 1 AND 500),
  roles jsonb NOT NULL DEFAULT '[]', created_by uuid REFERENCES users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_date_time_idx ON events(date,time);
CREATE TABLE rsvps (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('going','not_going')), role_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,user_id)
);
CREATE INDEX rsvps_user_idx ON rsvps(user_id);
CREATE TABLE attendance (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, event_date text NOT NULL,
  marked_by uuid REFERENCES users ON DELETE SET NULL, marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,user_id)
);
CREATE INDEX attendance_user_date_idx ON attendance(user_id,event_date DESC);
-- A API é a única camada de acesso. Nenhuma tabela é exposta a chaves públicas.
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
-- Sem políticas públicas: anon/authenticated não acessam registros pelo Data API.
-- A conexão privada PostgreSQL usada pela API aplica as permissões do aplicativo.
