CREATE TABLE "oauth_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- The default privileges from 0001 grant SELECT and INSERT to every future
-- table, which is right as a default: a new table should not become mutable by
-- accident. A token store must be. Strava rotates the refresh token on every
-- refresh, so without UPDATE the app would refresh once, fail to persist the
-- new token, and be locked out at the next expiry with no error until then.
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_tokens TO app_rw;

