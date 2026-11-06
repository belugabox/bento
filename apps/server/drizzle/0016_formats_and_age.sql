CREATE TABLE `formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`reading_mode` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `formats_name_unique` ON `formats` (`name`);--> statement-breakpoint
ALTER TABLE `draft_statuses` ADD `format_id` integer REFERENCES formats(id);--> statement-breakpoint
ALTER TABLE `draft_statuses` ADD `age` integer;--> statement-breakpoint
ALTER TABLE `series` ADD `format_id` integer REFERENCES formats(id);--> statement-breakpoint
ALTER TABLE `series` ADD `age` integer;