import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Who took part: a team member (user_id) or an outside guest (name, optional
// email). A user appears at most once per meeting.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('meetings_participants')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('meeting_id', 'uuid', col => col.notNull().references('meetings.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.references('users.id').onDelete('cascade'))
    .addColumn('name', 'text')
    .addColumn('email', 'text')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('meetings_participants_user_or_name', sql`(user_id is not null) <> (name is not null)`)
    .execute()

  await db.schema.createIndex('idx_meetings_participants_meeting').on('meetings_participants').column('meeting_id').execute()
  await sql`
    CREATE UNIQUE INDEX idx_meetings_participants_user
      ON meetings_participants (meeting_id, user_id)
      WHERE user_id IS NOT NULL
  `.execute(db)
  await db.schema.createIndex('idx_meetings_participants_user_lookup').on('meetings_participants').column('user_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('meetings_participants').ifExists().execute()
}
