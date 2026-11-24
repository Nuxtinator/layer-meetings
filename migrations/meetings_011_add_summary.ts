import type { Kysely } from 'kysely'

// A one-line summary that tells a meeting apart in the list, written by a
// person or drafted by AI.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('meetings')
    .addColumn('summary', 'text')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('meetings').dropColumn('summary').execute()
}
