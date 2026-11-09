CREATE TABLE families (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE family_people (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  relationship text NOT NULL CHECK (relationship IN ('parent','child')),
  name text NOT NULL,
  birthday text,
  CHECK (birthday IS NULL OR (birthday ~ '^[0-9]{2}-[0-9]{2}$' AND to_char(to_date('2000-' || birthday,'YYYY-MM-DD'),'MM-DD')=birthday))
);
CREATE INDEX family_people_family_idx ON family_people(family_id);
-- Keep the original JSON and spouse columns as a backup. Runtime reads the shared family only.
CREATE TEMP TABLE legacy_family_map ON COMMIT DROP AS
SELECT u.id AS user_id,
  CASE WHEN u.status='active' AND s.status='active' AND s.spouse_id=u.id THEN least(u.id::text,s.id::text)::uuid ELSE u.id END AS family_id
FROM users u LEFT JOIN users s ON s.id=u.spouse_id
WHERE jsonb_array_length(u.family_members)>0 OR (u.status='active' AND s.status='active' AND s.spouse_id=u.id);
INSERT INTO families(id,name)
SELECT m.family_id,'Família de ' || min(u.name) FROM legacy_family_map m JOIN users u ON u.id=m.user_id GROUP BY m.family_id;
INSERT INTO family_people(id,family_id,user_id,relationship,name,birthday)
SELECT u.id,m.family_id,u.id,'parent',u.name,u.birthday FROM legacy_family_map m JOIN users u ON u.id=m.user_id;
-- Combine repeated children/spouses only when name, role and birthday agree.
INSERT INTO family_people(id,family_id,relationship,name,birthday)
SELECT (md5(m.family_id::text || ':' || regexp_replace(lower(translate(trim(r->>'name'),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')), '\s+', ' ', 'g') || ':' || (r->>'relationship') || ':' || coalesce(r->>'birthday','')))::uuid,
  m.family_id,CASE WHEN r->>'relationship'='spouse' THEN 'parent' ELSE 'child' END,min(trim(r->>'name')),r->>'birthday'
FROM legacy_family_map m JOIN users u ON u.id=m.user_id CROSS JOIN LATERAL jsonb_array_elements(u.family_members) r
WHERE length(trim(r->>'name'))>=2
GROUP BY m.family_id,regexp_replace(lower(translate(trim(r->>'name'),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')), '\s+', ' ', 'g'),r->>'relationship',r->>'birthday';
