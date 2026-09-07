/**
 * Fails closed when the database is absent.
 *
 * Every route on the sweep reads Postgres. Without a connection the pages
 * render an error boundary or an empty shell, and a sweep over empty shells
 * passes while proving nothing -- the exact vacuous-gate shape this repo has
 * caught repeatedly. A `skipIf` here would be worse than no gate: it would go
 * green and be believed.
 */
export default function globalSetup(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. The viewport sweep renders real pages against ' +
        'real data; without a database every route degrades to an empty shell ' +
        'and the sweep would pass having tested nothing. Set DATABASE_URL ' +
        '(locally: export DATABASE_URL="$(pass show neon/database-url)").',
    );
  }
}
