CREATE TABLE `import_failure` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`error_code` text NOT NULL,
	`error_message` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_attempt_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_failure_url_idx` ON `import_failure` (`url`);