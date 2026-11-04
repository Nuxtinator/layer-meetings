import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Action items from a meeting. The assignee is always a user participant of
// the meeting (or nobody); done is derived from `done_at`.
export async function up(db: Kysely<unknown>): Promise<void> {
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

  await db.schema.createIndex('idx_meetings_todos_meeting').on('meetings_todos').column('meeting_id').execute()
  await sql`
    CREATE INDEX idx_meetings_todos_assignee_open
      ON meetings_todos (assignee_user_id)
      WHERE done_at IS NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('meetings_todos').ifExists().execute()
}
