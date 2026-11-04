import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/admin";
import { dailyRoutine } from "@/lib/jobs";

// Called once a day by the scheduler (Vercel Cron sends "Authorization: Bearer $CRON_SECRET").
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  const results = await dailyRoutine(db, "cron", db);
  return NextResponse.json({ ok: true, results });
}
