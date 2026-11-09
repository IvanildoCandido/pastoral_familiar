ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_members jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD CONSTRAINT users_birthday_valid CHECK (
  birthday IS NULL OR (birthday ~ '^[0-9]{2}-[0-9]{2}$' AND to_char(to_date('2000-' || birthday, 'YYYY-MM-DD'), 'MM-DD') = birthday)
);
