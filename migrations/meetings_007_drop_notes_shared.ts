import type { Kysely } from 'kysely'

// Personal notes are private to their author; text for everyone goes in the
// meeting's shared document.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('meetings_notes').dropColumn('shared').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('meetings_notes').addColumn('shared', 'boolean', col => col.notNull().defaultTo(false)).execute()
}
