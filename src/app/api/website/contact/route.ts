import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/website/contact
 * Body: { site_id, name, email, phone, message }
 *
 * Receives contact form submissions from tenant websites.
 * Forwards to the tenant's business_email via Resend.
 *
 * CORS open — called from any tenant domain.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { site_id, name, email, phone, message } = body;

  if (!site_id || !name || !email || !message) {
    return cors(NextResponse.json({ error: "site_id, name, email, message required" }, { status: 400 }));
  }

  const [site] = await sql`
    SELECT name, business_email FROM sites WHERE id = ${site_id} AND is_active = true
  `;
  if (!site) {
    return cors(NextResponse.json({ error: "Site not found" }, { status: 404 }));
  }

  const businessEmail = site.business_email as string;
  if (!businessEmail) {
    return cors(NextResponse.json({ error: "Business email not configured" }, { status: 400 }));
  }

  const siteName = site.name as string;

  const sent = await sendEmail({
    to: businessEmail,
    subject: `New contact from ${name} — ${siteName} website`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="font-size: 18px; margin-bottom: 16px; color: #1a1a1a;">New website contact</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 80px;">From</td>
            <td style="padding: 8px 0; font-weight: 500;">${escape(name)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Email</td>
            <td style="padding: 8px 0;"><a href="mailto:${escape(email)}">${escape(email)}</a></td>
          </tr>
          ${phone ? `<tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Phone</td>
            <td style="padding: 8px 0;"><a href="tel:${escape(phone)}">${escape(phone)}</a></td>
          </tr>` : ""}
        </table>
        <div style="padding: 16px; background: #f9fafb; border-radius: 6px;">
          <p style="font-size: 12px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Message</p>
          <p style="font-size: 15px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${escape(message)}</p>
        </div>
        <p style="font-size: 11px; color: #9ca3af; margin-top: 24px;">
          Submitted via your TracPost-powered website
        </p>
      </div>
    `,
  });

  if (!sent) {
    return cors(NextResponse.json({ error: "Failed to send" }, { status: 500 }));
  }

  return cors(NextResponse.json({ success: true }));
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
