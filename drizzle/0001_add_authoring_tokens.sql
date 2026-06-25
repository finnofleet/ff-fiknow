-- Robust gegen Alt-Schema-Leichen aus früherem db:push (Tokens sind
-- wegwerfbar → kein Datenverlust). Auf migrations-verwalteten Prod-DBs
-- (verstande.ch, fiknow) existiert die Tabelle nicht, DROP IF EXISTS ist no-op.
DROP TABLE IF EXISTS "authoring_tokens" CASCADE;
--> statement-breakpoint
CREATE TABLE "authoring_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "authoring_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "authoring_tokens" ENABLE ROW LEVEL SECURITY;