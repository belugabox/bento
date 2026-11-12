CREATE TABLE `source_ratings` (
	`site` text NOT NULL,
	`source_id` text NOT NULL,
	`value` real NOT NULL,
	`count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`site`, `source_id`)
);
