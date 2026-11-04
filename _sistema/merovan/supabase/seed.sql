-- Example data to test everything without connecting any platform.
-- Platform-dependent values are marked verified = false ("a verificar").

insert into settings (key, value, description, verified, last_reviewed_at) values
  ('vat_default', '0.21', 'IVA general España', true, '2026-11-04'),
  ('tiktok_shop_commission', '0.09', 'Comisión TikTok Shop España desde enero 2026 (verificar en Seller Center)', false, '2026-11-04'),
  ('tiktok_shop_promo_commission', '{"rate": 0.04, "days": 60}', 'Promoción vendedores nuevos (verificar)', false, '2026-11-04'),
  ('payment_fee', '{"pct": 0.014, "fixed_cents": 25}', 'Comisión de pasarela (Stripe tarjetas UE, verificar tarifa contratada)', false, '2026-11-04'),
  ('returns_provision', '0.06', 'Provisión de devoluciones por defecto', true, '2026-11-04'),
  ('target_roas_factor', '1.4', 'ROAS objetivo = equilibrio × factor', true, '2026-11-04'),
  ('test_budget_multiplier', '4', 'Presupuesto de test = multiplicador × CPA de equilibrio', true, '2026-11-04'),
  ('support_sla_hours', '24', 'SLA de respuesta de soporte', true, '2026-11-04');

insert into suppliers (code, name, warehouse_country, platform, reliability, notes) values
  ('PRV-0001', 'Proveedor Ejemplo UE', 'ES', 'ejemplo', 4.0, 'EJEMPLO');

insert into products (code, name, slug, niche, status, publish_status, description, bullets, price_cents, weight_g,
                      gpsr_manufacturer, gpsr_address, gpsr_contact, score)
values
  ('PRD-0001', 'Organizador de cables', 'organizador-de-cables', 'hogar-oficina', 'en_test', 'publicado',
   'Ordena los cables de tu escritorio en segundos. (EJEMPLO)',
   array['Pack de 3', 'Adhesivo sin restos', 'Envío desde España'], 1995, 120,
   'Fabricante Ejemplo S.L.', 'Calle Ejemplo 1, Madrid', 'contacto@example.com', 31),
  ('PRD-0002', 'Lámpara de lectura recargable', 'lampara-de-lectura', 'hogar-oficina', 'candidato', 'borrador',
   'Candidato en validación. (EJEMPLO)', '{}', 2495, 250, null, null, null, 27);

update products set
  score_detail = '{"demanda":4,"visual":5,"problema":4,"margen":3,"competencia":3,"logistica":5,"riesgo_legal":5,"recompra":2}',
  legal_checks = '{"ce":"no_aplica","gpsr":"ok","marca":"ok","cosmetica":"no_aplica","juguetes":"no_aplica","electronica":"no_aplica","salud":"no_aplica","bateria":"no_aplica","plataforma":"ok"}'
where code = 'PRD-0001';

insert into product_variants (product_id, sku, title, stock)
select id, 'ORG-3', 'Pack de 3', 100 from products where code = 'PRD-0001';

insert into supplier_offers (product_id, supplier_id, role, unit_cost_cents, shipping_cents, promised_days)
select p.id, s.id, 'principal', 450, 290, 3
from products p, suppliers s where p.code = 'PRD-0001' and s.code = 'PRV-0001';
