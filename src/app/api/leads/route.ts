import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/leads
 * Body: { email, name?, phone?, product_id, is_trial?, source? }
 * Upserts a lead row — called on each input blur.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, name, phone, product_id, is_trial, source } = body;

  if (!email || !product_id) {
    return NextResponse.json({ error: "email and product_id required" }, { status: 400 });
  }

  await sql`
    INSERT INTO leads (email, name, phone, product_id, is_trial, source)
    VALUES (
      ${email.toLowerCase().trim()},
      ${name || null},
      ${phone || null},
      ${product_id},
      ${is_trial !== undefined ? is_trial : true},
      ${source || null}
    )
    ON CONFLICT (email, product_id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, leads.name),
      phone = COALESCE(EXCLUDED.phone, leads.phone),
      is_trial = EXCLUDED.is_trial,
      source = COALESCE(EXCLUDED.source, leads.source)
  `;

  return NextResponse.json({ ok: true });
}
