import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Files on a meeting (recordings, slides, handouts), uploaded straight to the
// private bucket. The row id is the id baked into the object key, so a key
// can be claimed by one row only.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('meetings_attachments')
    .addColumn('id', 'uuid', col => col.primaryKey())
    .addColumn('meeting_id', 'uuid', col => col.notNull().references('meetings.id').onDelete('cascade'))
    .addColumn('storage_key', 'text', col => col.notNull().unique())
    .addColumn('filename', 'text', col => col.notNull())
    .addColumn('mime_type', 'text', col => col.notNull())
    .addColumn('size_bytes', 'bigint', col => col.notNull())
    .addColumn('created_by', 'uuid', col => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createIndex('idx_meetings_attachments_meeting').on('meetings_attachments').column('meeting_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('meetings_attachments').ifExists().execute()
}
