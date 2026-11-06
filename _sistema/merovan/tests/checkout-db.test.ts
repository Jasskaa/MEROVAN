// Regressions for REVISION-MEROVAN-PARA-CLAUDE.md (06/11/2026): payment retries, stock reservations,
// shipping address and payment confirmation. Isolated embedded Postgres (PGlite) built from the
// migrations + seed; nothing touches the real database or Stripe.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const root = join(__dirname, "..", "supabase");
const db = new PGlite();
const OWNER = "00000000-0000-0000-0000-000000000001";
const MARKETING = "00000000-0000-0000-0000-000000000002";
let variant = "";
let n = 0;

async function as<T>(role: "anon" | "authenticated", uid: string | null, sql: string) {
  await db.exec(`set role ${role}; select set_config('test.uid', '${uid ?? ""}', false);`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role;");
  }
}
const one = async <T>(sql: string) => (await db.query<T>(sql)).rows[0];
const stock = async () => (await one<{ s: number }>(`select stock as s from product_variants where id = '${variant}'`)).s;
const newSession = () => `test-session-${String(++n).padStart(12, "0")}`;
const addToCart = (sid: string, qty: number) => as("anon", null, `select cart_set('${sid}', '${variant}', ${qty})`);
type Prep = { order_id: string; reused: boolean; stripe_session_id: string | null; superseded: string[] };
const prepare = async (sid: string) => (await as<Prep>("anon", null, `select * from checkout_prepare('${sid}')`))[0];
const confirm = async (order: string, session: string | null, amount: number | null, ship = "null") =>
  (await one<{ r: string }>(`select confirm_order_payment('${order}', ${session ? `'${session}'` : "null"}, 'pi_${session ?? "x"}',
     ${amount ?? "null"}, 'eur', 'cliente@example.com', 'Cliente', ${ship}::jsonb) as r`)).r;
const total = async (order: string) => (await one<{ t: number }>(`select total_cents as t from orders where id = '${order}'`)).t;
const status = async (order: string) => (await one<{ s: string }>(`select status as s from orders where id = '${order}'`))?.s;

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb, raw_app_meta_data jsonb, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  for (const f of readdirSync(join(root, "migrations")).sort()) {
    if (f.includes("storage")) continue;
    await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  }
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select on all tables in schema public to anon, authenticated;
    grant insert, update, delete on all tables in schema public to authenticated;
    insert into auth.users (id, raw_user_meta_data) values ('${OWNER}', '{"full_name": "Owner"}');
    insert into auth.users (id, raw_user_meta_data, raw_app_meta_data) values ('${MARKETING}', '{}', '{"merovan_role": "marketing"}');
  `);
  variant = (await one<{ id: string }>("select id from product_variants where sku = 'ORG-3'")).id;
}, 60_000);

beforeEach(async () => {
  await db.exec(`update product_variants set stock = 10 where id = '${variant}'`);
});

describe("1 · retrying the payment", () => {
  it("a second attempt reuses the same order instead of deleting it", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    const b = await prepare(sid); // double click / second tab / retry
    expect(b.order_id).toBe(a.order_id);
    expect(b.reused).toBe(true);
    expect(await stock()).toBe(9); // reserved once, not twice
    expect(await confirm(a.order_id, "cs_retry_1", await total(a.order_id))).toBe("pagado");
    expect(await status(a.order_id)).toBe("pagado");
  });

  it("recovers a failure between creating the order and saving the Stripe session", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    // The app crashed after Stripe answered: nothing attached. The retry gets the same order
    // (and, with the stable idempotency key, Stripe returns the same session).
    const b = await prepare(sid);
    expect(b).toMatchObject({ order_id: a.order_id, reused: true, stripe_session_id: null });
    await db.exec(`select checkout_attach_session('${a.order_id}', 'cs_partial_1', 'https://checkout.stripe.test/1')`);
    const c = await prepare(sid);
    expect(c).toMatchObject({ order_id: a.order_id, reused: true, stripe_session_id: "cs_partial_1" });
    // A second, different session can never overwrite the saved one.
    const [{ ok }] = (await db.query<{ ok: boolean }>(`select checkout_attach_session('${a.order_id}', 'cs_other', 'x') as ok`)).rows;
    expect(ok).toBe(false);
  });

  it("a changed cart cancels (not deletes) the old order, frees its stock and returns its session to close", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    await db.exec(`select checkout_attach_session('${a.order_id}', 'cs_old_1', 'u')`);
    await addToCart(sid, 2);
    const b = await prepare(sid);
    expect(b.order_id).not.toBe(a.order_id);
    expect(b.superseded).toEqual(["cs_old_1"]);
    expect(await status(a.order_id)).toBe("cancelado");
    expect(await stock()).toBe(8); // 1 released, 2 reserved
  });

  it("the old session paid anyway (it was completing): applied if stock allows, never lost silently", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    await db.exec(`select checkout_attach_session('${a.order_id}', 'cs_late_1', 'u')`);
    await addToCart(sid, 3);
    await prepare(sid);
    expect(await confirm(a.order_id, "cs_late_1", await total(a.order_id))).toBe("pagado");
    expect(await stock()).toBe(6); // 3 reserved by the new order + 1 sold by the old one
  });

  it("webhook for an order that does not exist is recorded, and the legacy function no longer ignores it", async () => {
    const ghost = "11111111-1111-1111-1111-111111111111";
    expect(await confirm(ghost, "cs_ghost_1", 1000)).toBe("pedido_inexistente");
    const ev = await one<{ outcome: string }>("select outcome from payment_events where event_ref = 'cs_ghost_1'");
    expect(ev.outcome).toBe("pedido_inexistente");
    await expect(db.exec(`select mark_order_paid('${ghost}', 'pi_x', 'a@example.com', 'A', 'ES')`)).rejects.toThrow(/Pago no aplicado/);
  });

  it("duplicate webhooks are idempotent and stock is taken only once", async () => {
    const sid = newSession();
    await addToCart(sid, 2);
    const a = await prepare(sid);
    const t = await total(a.order_id);
    expect(await confirm(a.order_id, "cs_dup_1", t)).toBe("pagado");
    expect(await confirm(a.order_id, "cs_dup_1", t)).toBe("ya_pagado");
    expect(await stock()).toBe(8);
    // A different, second payment for the same order is flagged for refund, not swallowed.
    expect(await confirm(a.order_id, "cs_dup_2", t)).toBe("pago_duplicado");
  });

  it("rejects wrong amount, wrong currency and a session that is not the order's", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    await db.exec(`select checkout_attach_session('${a.order_id}', 'cs_val_1', 'u')`);
    expect(await confirm(a.order_id, "cs_val_1", 1)).toBe("importe_no_coincide");
    expect(await one<{ r: string }>(`select confirm_order_payment('${a.order_id}', 'cs_val_1', 'pi', ${await total(a.order_id)}, 'usd', null, null, null) as r`))
      .toEqual({ r: "importe_no_coincide" });
    expect(await confirm(a.order_id, "cs_val_other", await total(a.order_id))).toBe("sesion_no_coincide");
    expect(await status(a.order_id)).toBe("pendiente_pago");
  });

  it("only one pending order per cart can exist, whatever process creates it", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    const cart = (await one<{ c: string }>(`select cart_id as c from orders where id = '${a.order_id}'`)).c;
    await expect(db.exec(`insert into orders (cart_id, status) values ('${cart}', 'pendiente_pago')`)).rejects.toThrow(/orders_one_pending_per_cart/);
  });
});

describe("2 · stock reservations", () => {
  it("two buyers, one unit: the second cannot start paying", async () => {
    await db.exec(`update product_variants set stock = 1 where id = '${variant}'`);
    const s1 = newSession(), s2 = newSession();
    await addToCart(s1, 1);
    await addToCart(s2, 1); // both carts accepted while the unit was free
    const a = await prepare(s1);
    await expect(prepare(s2)).rejects.toThrow(/No queda stock/);
    expect(await confirm(a.order_id, "cs_last_1", await total(a.order_id))).toBe("pagado");
    expect(await stock()).toBe(0);
    expect(await one<{ n: number }>(`select count(*)::int as n from orders o join carts c on c.id = o.cart_id where c.session_id = '${s2}'`)).toEqual({ n: 0 });
  });

  it("an expired reservation is released once, even if released repeatedly", async () => {
    const sid = newSession();
    await addToCart(sid, 3);
    const a = await prepare(sid);
    expect(await stock()).toBe(7);
    await db.exec(`update orders set reserved_until = now() - interval '1 minute' where id = '${a.order_id}'`);
    expect((await one<{ n: number }>("select release_expired_reservations() as n")).n).toBe(1);
    expect((await one<{ n: number }>("select release_expired_reservations() as n")).n).toBe(0);
    await db.exec(`select release_order_by_session('cs_none')`);
    expect(await stock()).toBe(10);
    expect(await status(a.order_id)).toBe("cancelado");
  });

  it("payment arriving after expiry: accepted if the unit is still free, flagged if someone else took it", async () => {
    await db.exec(`update product_variants set stock = 1 where id = '${variant}'`);
    const s1 = newSession(), s2 = newSession();
    await addToCart(s1, 1);
    const a = await prepare(s1);
    await db.exec(`update orders set reserved_until = now() - interval '1 minute' where id = '${a.order_id}'`);
    await db.exec("select release_expired_reservations()");
    expect(await confirm(a.order_id, "cs_exp_1", await total(a.order_id))).toBe("pagado"); // unit still free
    expect(await stock()).toBe(0);

    await db.exec(`update product_variants set stock = 1 where id = '${variant}'`);
    const s3 = newSession();
    await addToCart(s3, 1);
    const c = await prepare(s3);
    await db.exec(`update orders set reserved_until = now() - interval '1 minute' where id = '${c.order_id}'`);
    await db.exec("select release_expired_reservations()"); // Stripe's expiry webhook / next checkout / daily job
    await addToCart(s2, 1);
    await prepare(s2); // another buyer takes the freed unit
    expect(await confirm(c.order_id, "cs_exp_2", await total(c.order_id))).toBe("sin_stock");
    expect(await status(c.order_id)).toBe("cancelado");
    expect(await stock()).toBe(0); // never negative, never sold twice
    expect((await one<{ outcome: string }>("select outcome from payment_events where event_ref = 'cs_exp_2'")).outcome).toBe("sin_stock");
  });

  it("Stripe's 'session expired' frees the reservation", async () => {
    const sid = newSession();
    await addToCart(sid, 2);
    const a = await prepare(sid);
    await db.exec(`select checkout_attach_session('${a.order_id}', 'cs_expired_evt', 'u')`);
    expect((await one<{ ok: boolean }>("select release_order_by_session('cs_expired_evt') as ok")).ok).toBe(true);
    expect((await one<{ ok: boolean }>("select release_order_by_session('cs_expired_evt') as ok")).ok).toBe(false);
    expect(await stock()).toBe(10);
  });

  it("caps how many reservations can be open at once (abuse through the public site)", async () => {
    await db.exec("update settings set value = to_jsonb((select count(*) from orders where status = 'pendiente_pago' and stock_reserved)::int + 1) where key = 'checkout_max_active_reservations'");
    const s1 = newSession(), s2 = newSession();
    await addToCart(s1, 1);
    await addToCart(s2, 1);
    await prepare(s1);
    await expect(prepare(s2)).rejects.toThrow(/muchos pagos en curso/);
    await db.exec("update settings set value = '200' where key = 'checkout_max_active_reservations'");
  });

  it("orders created before reservations are paid without driving stock negative", async () => {
    await db.exec(`update product_variants set stock = 0 where id = '${variant}'`);
    const { id } = await one<{ id: string }>("insert into orders (status, total_cents) values ('pendiente_pago', 1995) returning id");
    await db.exec(`insert into order_items (order_id, product_id, variant_id, quantity, unit_price_cents)
                   select '${id}', product_id, id, 1, 1995 from product_variants where id = '${variant}'`);
    expect(await confirm(id, "cs_legacy_1", 1995)).toBe("sin_stock");
    expect(await stock()).toBe(0);
  });

  it("the public cannot release, attach or confirm payments", async () => {
    for (const sql of [
      "select release_expired_reservations()",
      "select release_order_by_session('x')",
      "select checkout_attach_session(gen_random_uuid(), 'x', 'x')",
      "select confirm_order_payment(gen_random_uuid(), 'x', 'x', 1, 'eur', null, null, null)",
    ]) await expect(as("anon", null, sql)).rejects.toThrow(/permission denied/);
  });
});

describe("3 · shipping address", () => {
  const ship = `'{"name":"Luis Envío","line1":"Calle Envío 2","line2":"3º B","city":"Valencia","state":"V","postal_code":"46001","country":"ES","phone":"+34600000000"}'`;

  it("stores the full delivery address, readable only by authorised roles and not through order_lines", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    expect(await confirm(a.order_id, "cs_ship_1", await total(a.order_id), ship)).toBe("pagado");
    const o = await one<Record<string, string>>(`select ship_name, ship_line1, ship_line2, ship_city, ship_state, ship_postal_code, ship_phone, shipping_country from orders where id = '${a.order_id}'`);
    expect(o).toEqual({ ship_name: "Luis Envío", ship_line1: "Calle Envío 2", ship_line2: "3º B", ship_city: "Valencia", ship_state: "V", ship_postal_code: "46001", ship_phone: "+34600000000", shipping_country: "ES" });

    const pub = await as<Record<string, unknown>>("anon", null, `select * from order_lines('${a.order_id}')`);
    expect(Object.keys(pub[0]).some((k) => k.startsWith("ship_") || k.includes("email"))).toBe(false);
    expect(await as("authenticated", MARKETING, `select ship_line1 from orders where id = '${a.order_id}'`)).toHaveLength(0);
    expect(await as("authenticated", OWNER, `select ship_line1 from orders where id = '${a.order_id}'`)).toHaveLength(1);
  });

  it("accepts payments without address and old orders without the new columns filled", async () => {
    const sid = newSession();
    await addToCart(sid, 1);
    const a = await prepare(sid);
    expect(await confirm(a.order_id, "cs_noship_1", await total(a.order_id))).toBe("pagado");
    expect(await one(`select ship_line1, shipping_country from orders where id = '${a.order_id}'`)).toEqual({ ship_line1: null, shipping_country: "ES" });
  });

  it("export and anonymisation cover the new columns", async () => {
    const data = (await as<{ d: { pedidos: { envio: { direccion: string } }[] } }>("authenticated", OWNER, "select customer_data('cliente@example.com') as d"))[0].d;
    expect(data.pedidos.some((p) => p.envio.direccion === "Calle Envío 2")).toBe(true);
    await as("authenticated", OWNER, "select anonymize_customer('cliente@example.com')");
    expect(await one<{ n: number }>("select count(*)::int as n from orders where ship_line1 is not null or ship_phone is not null")).toEqual({ n: 0 });
  });
});
