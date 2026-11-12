CREATE TABLE `source_sheets` (
	`site` text NOT NULL,
	`source_id` text NOT NULL,
	`checked_at` integer NOT NULL,
	`snapshot` text NOT NULL,
	`changes` text,
	PRIMARY KEY(`site`, `source_id`)
);
