DROP INDEX `users_oidc_subject_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `oidc_subject`;