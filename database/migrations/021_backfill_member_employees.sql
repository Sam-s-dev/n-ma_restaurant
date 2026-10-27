-- =============================================================
-- 021 — Fiches employés des comptes créés avant le lien
--
-- Depuis la migration 020, tout compte créé dans l'équipe naît avec sa
-- fiche employé. Les comptes plus anciens n'en avaient pas : le gérant les
-- voyait dans l'équipe mais pas dans le Personnel, sans salaire ni pointage.
-- On leur crée ici la fiche qui leur manque.
--
-- Le créateur de l'espace n'est pas concerné : c'est le patron, pas un
-- salarié. S'il veut suivre sa propre présence, il rattache son compte à
-- une fiche depuis Paramètres → L'équipe.
--
-- Salaire à zéro : la migration ne peut pas le deviner. Le gérant le
-- complète sur la fiche ; tant qu'il vaut zéro, aucun reste dû n'est calculé.
-- =============================================================

INSERT INTO employees (restaurant_id, full_name, position, phone, hire_date, monthly_salary, user_id)
SELECT u.restaurant_id,
       u.full_name,
       CASE u.role
         WHEN 'manager'     THEN 'Gérant'
         WHEN 'cashier'     THEN 'Caissier'
         WHEN 'storekeeper' THEN 'Magasinier'
       END,
       u.phone,
       u.created_at::date,
       0,
       u.id
  FROM users u
 WHERE NOT u.is_owner
   AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id);
