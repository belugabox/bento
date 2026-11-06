-- Liste de départ des formats (si la table est vide : 0016 a pu être
-- appliquée sans elle).
INSERT INTO `formats` (`name`, `reading_mode`)
SELECT `name`, `reading_mode` FROM (
	SELECT 'Manga' AS `name`, 'ltr-manga' AS `reading_mode`, 1 AS `rank`
	UNION ALL SELECT 'Manhwa', 'ltr', 2
	UNION ALL SELECT 'Manhua', 'ltr', 3
	UNION ALL SELECT 'Webtoon', 'webtoon', 4
	UNION ALL SELECT 'BD', 'ltr', 5
	UNION ALL SELECT 'Comics', 'ltr', 6
)
WHERE NOT EXISTS (SELECT 1 FROM `formats`)
ORDER BY `rank`;
