import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration. Only included by the migrator when the tenancy
// layer is loaded (filename contains `_T<NNN>_`). Adds `org_id` + RLS to every
// meetings table so one org's meetings are isolated from another's.

async function enableTenantScoping(db: Kysely<unknown>, table: string): Promise<void> {
  await sql`
    ALTER TABLE ${sql.ref(table)}
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON ${sql.ref(table)} FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

async function disableTenantScoping(db: Kysely<unknown>, table: string): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON ${sql.ref(table)}`.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} DROP COLUMN org_id`.execute(db)
}

const TABLES = [
  'meetings',
  'meetings_participants',
  'meetings_attachments',
  'meetings_notes',
  'meetings_todos'
] as const

// A table a later regular migration dropped (meetings_todos, by
// meetings_008) is skipped: regular migrations all run before tenancy ones.
async function tableExists(db: Kysely<unknown>, table: string): Promise<boolean> {
  const { rows } = await sql<{ found: boolean }>`select to_regclass(${table}) is not null as found`.execute(db)
  return rows[0]?.found === true
}

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const t of TABLES) {
    if (await tableExists(db, t)) await enableTenantScoping(db, t)
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of [...TABLES].reverse()) {
    if (await tableExists(db, t)) await disableTenantScoping(db, t)
  }
}
