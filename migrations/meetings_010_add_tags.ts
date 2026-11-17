import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Free-form labels on a meeting, shared by everyone who can see it.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('meetings')
    .addColumn('tags', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'`))
    .execute()

  await sql`create index if not exists idx_meetings_tags on meetings using gin (tags)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_meetings_tags`.execute(db)
  await db.schema.alterTable('meetings').dropColumn('tags').execute()
}
