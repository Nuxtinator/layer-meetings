import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// A meeting: when it happened, where, who may see it, and its pasted
// transcript. `visibility` is 'org' (everyone with meetings.read) or
// 'private' (the creator, its user participants and meetings admins).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('meetings')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('starts_at', 'timestamptz', col => col.notNull())
    .addColumn('location', 'text')
    .addColumn('visibility', 'text', col => col.notNull())
    .addColumn('transcript', 'text')
    .addColumn('created_by', 'uuid', col => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('meetings_visibility_check', sql`visibility in ('org', 'private')`)
    .execute()

  await db.schema.createIndex('idx_meetings_starts_at').on('meetings').column('starts_at').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('meetings').ifExists().execute()
}
