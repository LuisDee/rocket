/**
 * The integration suite fails without a database. It does not skip.
 *
 * A `skipIf` here is how this gate silently becomes vacuous: the run reports
 * green having exercised nothing, and the append-only guards -- the single most
 * important constraint in the project -- go unverified without anyone seeing a
 * red build. Throwing in `globalSetup` makes an absent database a failure.
 */
export default function setup(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set, so the integration suite has nothing to test. ' +
        'This throws rather than skipping on purpose: a skipped suite reports ' +
        'green having verified nothing. Run with the pooled Neon URL, or ' +
        'against a local Postgres 18 with the migrations applied.',
    );
  }
}
