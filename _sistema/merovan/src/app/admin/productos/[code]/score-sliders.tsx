"use client";

import { useState } from "react";
import { CRITERIA, type Scores, scorePasses } from "@/lib/domain/product";

// Live scorecard: the total and pass/fail update while the sliders move.
export function ScoreSliders({ initial, disabled }: { initial: Scores; disabled: boolean }) {
  const [scores, setScores] = useState<Scores>(initial);
  const { total, passes, reasons } = scorePasses(scores);

  return (
    <div className="space-y-3">
      {CRITERIA.map((c) => (
        <label key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm sm:grid-cols-[180px_1fr_auto]">
          <span>
            <span className="font-medium">{c.label}</span>
            <span className="block text-xs text-muted sm:hidden">{c.hint}</span>
          </span>
          <input
            type="range" min={0} max={5} step={1} name={c.key} disabled={disabled}
            value={scores[c.key] ?? 0}
            onChange={(e) => setScores({ ...scores, [c.key]: Number(e.target.value) })}
            className="col-span-2 accent-[var(--gold)] sm:col-span-1" title={c.hint}
          />
          <span className="w-6 text-right font-semibold tabular-nums">{scores[c.key] ?? 0}</span>
        </label>
      ))}
      <div className={`rounded-md border px-3 py-2 text-sm ${passes ? "border-ok text-ok" : "border-danger text-danger"}`}>
        <strong className="tabular-nums">{total}/40</strong> · {passes ? "Pasa a validación" : reasons.join(" · ")}
      </div>
    </div>
  );
}
