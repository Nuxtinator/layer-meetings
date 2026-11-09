import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Finds a meeting's tasks by their `meeting` ref. The record kernel's table is
// still `crm_records` when this runs before `records_001` (which renames it,
// index included), `records_entries` otherwise.
export async function up(db: Kysely<unknown>): Promise<void> {
  const { rows } = await sql<{ name: string }>`
    select coalesce(to_regclass('records_entries'), to_regclass('crm_records'))::text as name
  `.execute(db)
  const table = rows[0]?.name
  if (!table) throw new Error('meetings_009 needs the records layer: no records_entries or crm_records table')
  await sql`
    create index if not exists meetings_task_meeting_idx on ${sql.table(table)} ((data->>'meeting'))
      where record_type = 'task'
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists meetings_task_meeting_idx`.execute(db)
}
