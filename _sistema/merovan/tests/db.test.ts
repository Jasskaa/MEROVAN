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
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb, raw_app_meta_data jsonb, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  for (const f of readdirSync(join(root, "migrations")).sort()) {
    if (f.includes("storage")) continue; // Supabase-only
    await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  }
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select on all tables in schema public to anon, authenticated;
    grant insert, update, delete on all tables in schema public to authenticated;
    insert into auth.users (id, raw_user_meta_data) values ('${OWNER}', '{"full_name": "Owner"}');
  `);
  // Open sign-up is closed after the first owner; the owner invites people with a role.
  await expect(db.exec(`insert into auth.users (id) values ('${MARKETING}')`)).rejects.toThrow(/registro está cerrado/);
  await db.exec(`
    insert into auth.users (id, raw_user_meta_data, raw_app_meta_data)
      values ('${MARKETING}', '{"full_name": "Marketing"}', '{"merovan_role": "marketing"}');
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

  it("gives invited users the role chosen by the owner", async () => {
    const { rows } = await db.query<{ role: string }>(`select role from profiles where id = '${MARKETING}'`);
    expect(rows[0].role).toBe("marketing");
  });

  it("generates the next human-readable code", async () => {
    const { rows } = await db.query<{ c: string }>("select next_code('PRD') as c");
    expect(rows[0].c).toBe("PRD-0003");
  });

  it("blocks publishing-ready status without an approved sample", async () => {
    await expect(
      db.exec("update products set status = 'listo_para_publicar' where code = 'PRD-0002'"),
    ).rejects.toThrow(/muestra aprobada/);
  });

  it("blocks progress with a legal red flag and flags the product", async () => {
    await db.exec(`update products set legal_checks = '{"marca": "rojo"}' where code = 'PRD-0002'`);
    await expect(db.exec("update products set status = 'validando_proveedor' where code = 'PRD-0002'")).rejects.toThrow(/Bandera roja/);
    const { rows } = await db.query<{ f: boolean }>("select legal_red_flag as f from products where code = 'PRD-0002'");
    expect(rows[0].f).toBe(true);
    await db.exec("update products set status = 'descartado' where code = 'PRD-0002'"); // discarding is always allowed
  });

  it("requires a backup supplier to scale", async () => {
    await db.exec(`
      insert into samples (code, product_id, supplier_id, status)
      select 'MUE-0001', p.id, s.id, 'aprobada' from products p, suppliers s where p.code = 'PRD-0001' and s.code = 'PRV-0001';
    `);
    await expect(db.exec("update products set status = 'escalando' where code = 'PRD-0001'")).rejects.toThrow(/respaldo/);
  });

  describe("store RPCs", () => {
    const SID = "test-session-000000000001";
    const variant = async () =>
      (await db.query<{ id: string }>("select id from product_variants where sku = 'ORG-3'")).rows[0].id;

    it("adds to cart as an anonymous visitor, capped at 20 units", async () => {
      const v = await variant();
      const [first] = await as<{ n: number }>("anon", null, `select cart_set('${SID}', '${v}', 2, true) as n`);
      expect(first.n).toBe(2);
      const [capped] = await as<{ n: number }>("anon", null, `select cart_set('${SID}', '${v}', 50, true) as n`);
      expect(capped.n).toBe(20);
      await as("anon", null, `select cart_set('${SID}', '${v}', 2)`);
    });

    it("refuses products that are not published", async () => {
      await db.exec(`insert into product_variants (product_id, sku, stock)
                     select id, 'LAMP-1', 5 from products where code = 'PRD-0002'`);
      const v = (await db.query<{ id: string }>("select id from product_variants where sku = 'LAMP-1'")).rows[0].id;
      await expect(as("anon", null, `select cart_set('${SID}', '${v}', 1, true)`)).rejects.toThrow(/no disponible/);
    });

    it("creates the order with database prices, VAT and cost snapshot", async () => {
      const [{ id }] = await as<{ id: string }>("anon", null, `select checkout_create_order('${SID}') as id`);
      const { rows } = await db.query<{ total_cents: number; vat_cents: number; status: string }>(
        `select total_cents, vat_cents, status from orders where id = '${id}'`);
      // 2 × 19,95 € = 39,90 € ; VAT included at 21 %: 3990 × 0.21 / 1.21 = 692.48 → 692
      expect(rows[0]).toEqual({ total_cents: 3990, vat_cents: 692, status: "pendiente_pago" });
      const items = await db.query<{ unit_cost_cents: number }>(`select unit_cost_cents from order_items where order_id = '${id}'`);
      expect(items.rows[0].unit_cost_cents).toBe(740); // 4,50 € product + 2,90 € shipping
    });

    it("marks the order paid once, decrements stock and closes the cart", async () => {
      const { rows: [o] } = await db.query<{ id: string }>("select id from orders where status = 'pendiente_pago'");
      await db.exec(`select mark_order_paid('${o.id}', 'cs_test', 'a@example.com', 'Ana', 'ES')`);
      await db.exec(`select mark_order_paid('${o.id}', 'cs_test', 'a@example.com', 'Ana', 'ES')`); // duplicate webhook
      const stock = await db.query<{ stock: number }>("select stock from product_variants where sku = 'ORG-3'");
      expect(stock.rows[0].stock).toBe(98);
      const cart = await db.query<{ status: string }>(`select status from carts where session_id = '${SID}'`);
      expect(cart.rows[0].status).toBe("convertido");
    });

    it("anonymous visitors cannot mark orders as paid", async () => {
      await expect(as("anon", null, "select mark_order_paid(gen_random_uuid(), 'x', 'x', 'x', 'ES')")).rejects.toThrow(/permission denied/);
    });

    it("tracks a product view", async () => {
      await as("anon", null, `select track_view('${SID}', '/p/organizador-de-cables', 'organizador-de-cables')`);
      const { rows } = await db.query<{ n: number }>("select count(product_id)::int as n from page_views");
      expect(rows[0].n).toBe(1);
    });
  });
});

