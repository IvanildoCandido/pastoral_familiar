ALTER TABLE users ADD COLUMN coordinated_sector_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE users SET coordinated_sector_ids=sector_ids WHERE role='subcoordenador';
ALTER TABLE users ADD CONSTRAINT coordinated_membership CHECK (coordinated_sector_ids <@ sector_ids);
ALTER TABLE events ADD COLUMN event_type text NOT NULL DEFAULT 'Encontro';
ALTER TABLE events ADD COLUMN color text NOT NULL DEFAULT '#15803d' CHECK (color ~ '^#[0-9a-fA-F]{6}$');
CREATE TABLE app_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), hero_url text NOT NULL DEFAULT '', logo_url text NOT NULL DEFAULT '');
INSERT INTO app_settings(id) VALUES (true);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
