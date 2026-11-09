-- Reconcile historical spelling differences. Keep linked accounts and conflicting birthdays.
WITH ranked AS (
  SELECT p.id,p.user_id,row_number() OVER (
    PARTITION BY p.family_id,p.relationship,
      regexp_replace(translate(lower(trim(coalesce(u.name,p.name))),
        'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g'),
      CASE WHEN p.user_id IS NOT NULL THEN u.birthday ELSE p.birthday END
    ORDER BY (p.user_id IS NOT NULL) DESC,p.id
  ) AS position
  FROM family_people p LEFT JOIN users u ON u.id=p.user_id
)
DELETE FROM family_people p USING ranked r WHERE p.id=r.id AND r.position>1 AND r.user_id IS NULL;
