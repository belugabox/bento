CREATE TABLE `sheet_proposals` (
	`series_id` integer NOT NULL,
	`site` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`series_id`, `site`, `source_id`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sheet_searches` (
	`series_id` integer NOT NULL,
	`site` text NOT NULL,
	`name` text NOT NULL,
	`tried` text NOT NULL,
	`searched_at` integer NOT NULL,
	PRIMARY KEY(`series_id`, `site`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
