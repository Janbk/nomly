ALTER TABLE `recipe` ADD `needs_update_note` text;--> statement-breakpoint
ALTER TABLE `recipe_ingredient` ADD `needs_update` integer DEFAULT false NOT NULL;