"use client";

import { useState } from "react";
import { btn, input } from "@/components/ui";
import { computeMargin, type MarginInput } from "@/lib/domain/margin";
import { eurFloat } from "@/lib/format";

type Key = keyof MarginInput;

const SLIDERS: { key: Key; label: string; min: number; max: number; step: number; pct?: boolean }[] = [
  { key: "priceWithVat", label: "Precio de venta (IVA incl.)", min: 1, max: 150, step: 0.05 },
  { key: "productCost", label: "Coste del producto", min: 0, max: 100, step: 0.05 },
  { key: "shippingCost", label: "Envío", min: 0, max: 30, step: 0.05 },
  { key: "platformCommissionPct", label: "Comisión del canal", min: 0, max: 0.3, step: 0.005, pct: true },
  { key: "returnsProvisionPct", label: "Provisión de devoluciones", min: 0, max: 0.3, step: 0.005, pct: true },
  { key: "otherCosts", label: "Otros costes (embalaje, apps)", min: 0, max: 10, step: 0.05 },
];

const fmt = (v: number, pct?: boolean) => (pct ? `${(v * 100).toFixed(1).replace(".", ",")} %` : eurFloat(v));

export interface Scenario { id: string; name: string; kind: string; inputs: MarginInput }

export function Simulator({
  initial, scenarios, productCode, save, canSave,
}: {
  initial: MarginInput;
  scenarios: Scenario[];
  productCode: string | null;
  save: (formData: FormData) => Promise<void>;
  canSave: boolean;
}) {
  const [v, setV] = useState<MarginInput>(initial);
  const r = computeMargin(v);
  const results = [
    { label: "Precio sin IVA", value: eurFloat(r.priceWithoutVat) },
    { label: "Margen de contribución", value: eurFloat(r.contributionMargin), strong: true, bad: r.contributionMargin <= 0 },
    { label: "Margen %", value: `${(r.marginPct * 100).toFixed(0)} %` },
    { label: "CPA de equilibrio", value: eurFloat(r.breakEvenCpa) },
    { label: "ROAS de equilibrio", value: r.breakEvenRoas?.toString().replace(".", ",") ?? "imposible", strong: true },
    { label: "ROAS objetivo", value: r.targetRoas?.toString().replace(".", ",") ?? "—" },
    { label: "Presupuesto de test", value: eurFloat(r.testBudget) },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        {SLIDERS.map((s) => (
          <label key={s.key} className="block text-sm">
            <span className="flex justify-between"><span>{s.label}</span><strong className="tabular-nums">{fmt(v[s.key], s.pct)}</strong></span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={v[s.key]}
              onChange={(e) => setV({ ...v, [s.key]: Number(e.target.value) })}
              className="w-full accent-[var(--gold)]" />
          </label>
        ))}
        <p className="text-xs text-muted">
          IVA {(v.vatRate * 100).toFixed(0)} % · pasarela {(v.paymentFeePct * 100).toFixed(1)} % + {eurFloat(v.paymentFeeFixed)} ·
          objetivo ×{v.targetRoasFactor} · test ×{v.testBudgetMultiplier} (se cambian en Ajustes)
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <dl className="space-y-2 text-sm">
            {results.map((x) => (
              <div key={x.label} className="flex justify-between">
                <dt className="text-muted">{x.label}</dt>
                <dd className={`tabular-nums ${x.strong ? "text-lg font-semibold" : ""} ${x.bad ? "text-danger" : ""}`}>{x.value}</dd>
              </div>
            ))}
          </dl>
          {r.warnings.map((w) => <p key={w} className="mt-3 rounded-md border border-danger px-2 py-1 text-xs text-danger">{w}</p>)}
        </div>

        {canSave && (
          <form action={save} className="space-y-2 rounded-xl border border-border bg-surface p-5">
            <input type="hidden" name="inputs" value={JSON.stringify(v)} />
            <input type="hidden" name="product" value={productCode ?? ""} />
            <div className="flex gap-2">
              <input name="name" required placeholder="Nombre del escenario" className={`${input} mt-0`} aria-label="Nombre del escenario" />
              <select name="kind" className={`${input} mt-0 w-32`} aria-label="Tipo de escenario">
                <option>base</option><option>pesimista</option><option>optimista</option><option>otro</option>
              </select>
            </div>
            <button className={btn}>Guardar escenario</button>
          </form>
        )}
      </div>

      {scenarios.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-3 font-serif text-xl">Escenarios guardados</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="p-2">Escenario</th><th className="p-2">Precio</th><th className="p-2">Coste+envío</th><th className="p-2">Margen</th><th className="p-2">ROAS eq.</th><th className="p-2">Test</th><th /></tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const sr = computeMargin(s.inputs);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-2">{s.name} <span className="text-xs text-muted">{s.kind}</span></td>
                    <td className="p-2 tabular-nums">{eurFloat(s.inputs.priceWithVat)}</td>
                    <td className="p-2 tabular-nums">{eurFloat(s.inputs.productCost + s.inputs.shippingCost)}</td>
                    <td className={`p-2 tabular-nums ${sr.contributionMargin <= 0 ? "text-danger" : ""}`}>{eurFloat(sr.contributionMargin)}</td>
                    <td className="p-2 tabular-nums">{sr.breakEvenRoas ?? "—"}</td>
                    <td className="p-2 tabular-nums">{eurFloat(sr.testBudget)}</td>
                    <td className="p-2"><button type="button" onClick={() => setV(s.inputs)} className="text-xs text-gold">Cargar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
