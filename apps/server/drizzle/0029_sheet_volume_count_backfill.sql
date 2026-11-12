-- Tomes parus des fiches déjà lues : ceux de leurs valeurs de référence.
UPDATE `source_sheets` SET `volume_count` = json_extract(`snapshot`, '$.Tomes') WHERE `volume_count` IS NULL;
