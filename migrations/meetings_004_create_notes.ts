import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Each user's own notes on a meeting, private to them until `shared`.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('meetings_notes')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('meeting_id', 'uuid', col => col.notNull().references('meetings.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('body_md', 'text', col => col.notNull())
    .addColumn('shared', 'boolean', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('meetings_notes_meeting_user', ['meeting_id', 'user_id'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('meetings_notes').ifExists().execute()
}
