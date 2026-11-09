-- Families follow the same private-API access model as users and the other tables.
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_people ENABLE ROW LEVEL SECURITY;
