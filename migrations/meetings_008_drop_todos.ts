import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// A meeting's action items are `task` records (records layer) linked to the
// meeting through the task's `meeting` ref field.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('meetings_todos').ifExists().execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('meetings_todos')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('meeting_id', 'uuid', col => col.notNull().references('meetings.id').onDelete('cascade'))
    .addColumn('text', 'text', col => col.notNull())
    .addColumn('assignee_user_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('due_date', 'date')
    .addColumn('done_at', 'timestamptz')
    .addColumn('done_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('created_by', 'uuid', col => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
}
