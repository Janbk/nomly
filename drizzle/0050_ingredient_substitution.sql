CREATE TABLE `ingredient_substitution` (
	`from_ingredient_id` integer NOT NULL,
	`to_ingredient_id` integer NOT NULL,
	`uses` integer DEFAULT 1 NOT NULL,
	`last_used_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`from_ingredient_id`, `to_ingredient_id`),
	FOREIGN KEY (`from_ingredient_id`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_ingredient_id`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ingredient_substitution_to_idx` ON `ingredient_substitution` (`to_ingredient_id`);