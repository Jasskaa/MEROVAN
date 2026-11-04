// Rebuilds the database from migrations + seed in an embedded Postgres (PGlite)
// and checks the key RLS rules. Supabase's auth schema and roles are stubbed.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(__dirname, "..", "supabase");
const db = new PGlite();

const OWNER = "00000000-0000-0000-0000-000000000001";
const MARKETING = "00000000-0000-0000-0000-000000000002";

async function as<T>(role: "anon" | "authenticated", uid: string | null, sql: string) {
  await db.exec(`set role ${role}; select set_config('test.uid', '${uid ?? ""}', false);`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  for (const f of readdirSync(join(root, "migrations")).sort()) {
    await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  }
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select on all tables in schema public to anon, authenticated;
    grant insert, update, delete on all tables in schema public to authenticated;
    insert into auth.users (id, raw_user_meta_data) values ('${OWNER}', '{"full_name": "Owner"}');
  `);
  // Open sign-up is closed after the first owner: add the rest of the team bypassing the trigger.
  await expect(db.exec(`insert into auth.users (id) values ('${MARKETING}')`)).rejects.toThrow(/registro está cerrado/);
  await db.exec(`
    alter table auth.users disable trigger on_auth_user_created;
    insert into auth.users (id) values ('${MARKETING}');
    insert into profiles (id, full_name, role) values ('${MARKETING}', 'Marketing', 'marketing');
    insert into orders (customer_email, total_cents, status) values ('cliente@example.com', 1995, 'pagado');
  `);
});

describe("database", () => {
  it("builds from migrations and seed", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from products");
    expect(rows[0].n).toBe(2);
  });

  it("makes the first sign-up the owner and confirms it", async () => {
    const { rows } = await db.query<{ role: string; confirmed: boolean }>(
      `select p.role, u.email_confirmed_at is not null as confirmed
       from profiles p join auth.users u using (id) where p.id = '${OWNER}'`,
    );
    expect(rows[0]).toEqual({ role: "owner", confirmed: true });
    expect((await as<{ v: boolean }>("anon", null, "select owner_exists() as v"))[0].v).toBe(true);
  });

  it("anonymous visitors only see published products", async () => {
    const rows = await as<{ code: string }>("anon", null, "select code from products order by code");
    expect(rows.map((r) => r.code)).toEqual(["PRD-0001"]);
  });

  it("marketing cannot read orders (personal data) nor supplier costs", async () => {
    expect(await as("authenticated", MARKETING, "select * from orders")).toHaveLength(0);
    expect(await as("authenticated", MARKETING, "select * from supplier_offers")).toHaveLength(0);
  });

  it("owner reads orders and all products", async () => {
    expect(await as("authenticated", OWNER, "select * from orders")).toHaveLength(1);
    expect(await as("authenticated", OWNER, "select * from products")).toHaveLength(2);
  });

  it("audit log is immutable", async () => {
    await db.exec("insert into audit_log (action, entity) values ('test', 'x')");
    await expect(db.exec("delete from audit_log")).rejects.toThrow(/inmutable/);
  });
});
