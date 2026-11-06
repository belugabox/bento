-- Hors-séries et spéciaux (colonne `kind`) : les tomes qui peuvent en être
-- (champ Format, numéro « HS01 » ou « SP01 », nom de fichier, ou sans
-- numéro) sont relus au prochain scan.
UPDATE `volumes` SET `mtime_ms` = 0
WHERE json_extract(`comic_info`, '$.Format') IS NOT NULL
    OR upper(json_extract(`comic_info`, '$.Number')) LIKE 'HS%'
    OR upper(json_extract(`comic_info`, '$.Number')) LIKE 'SP%'
    OR `file` LIKE '%HS%'
    OR `file` LIKE '%SP%'
    OR `file` LIKE '%hors%s_rie%'
    OR `number` IS NULL;
