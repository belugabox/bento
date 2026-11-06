CREATE TABLE `genres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_name_unique` ON `genres` (`name`);--> statement-breakpoint
ALTER TABLE `draft_statuses` ADD `format` text;--> statement-breakpoint
ALTER TABLE `draft_statuses` ADD `audience` text;--> statement-breakpoint
ALTER TABLE `series` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `series` ADD `format` text;--> statement-breakpoint
ALTER TABLE `series` ADD `audience` text;--> statement-breakpoint
-- Liste de départ des genres.
INSERT INTO `genres` (`name`, `aliases`) VALUES
	('Action', '[]'),
	('Aventure', '["Adventure"]'),
	('Comédie', '["Humour","Parodie","Comedy"]'),
	('Drame', '["Emotion","Tragique","Tragédie","Drama"]'),
	('Fantastique', '["Surnaturel","Supernatural"]'),
	('Fantasy', '["Heroic fantasy","Dark fantasy","Fantasy épique"]'),
	('Horreur', '["Horror","Gore","Épouvante"]'),
	('Thriller', '["Suspense","Techno-thriller","Thriller psychologique"]'),
	('Policier', '["Polar","Enquête","Crime","Détective"]'),
	('Mystère', '["Mystery"]'),
	('Romance', '["Romantique","Romance"]'),
	('Science-fiction', '["SF","Sci-fi","Mecha","Cyberpunk","Space opera"]'),
	('Sport', '["Sports"]'),
	('Tranche de vie', '["Slice of life"]'),
	('Historique', '["Histoire","Historical"]'),
	('Arts martiaux', '["Martial arts"]'),
	('Psychologique', '["Psychological","Philosophique"]'),
	('Gastronomie', '["Cuisine","Culinaire","Cooking"]'),
	('Musique', '["Music"]'),
	('École', '["School life","Scolaire","School"]');