import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// The shared notes document of a meeting, edited live by its editors. `ydoc`
// is the Yjs state and the source of truth; `body_md` is a Markdown copy of it
// for reading outside the editor.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('meetings_documents')
    .addColumn('meeting_id', 'uuid', col => col.primaryKey().references('meetings.id').onDelete('cascade'))
    .addColumn('ydoc', 'bytea', col => col.notNull())
    .addColumn('body_md', 'text', col => col.notNull())
    .addColumn('updated_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('meetings_documents').ifExists().execute()
}
