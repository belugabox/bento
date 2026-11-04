CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`oidc_subject` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`max_age_rating` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_subject_unique` ON `users` (`oidc_subject`);