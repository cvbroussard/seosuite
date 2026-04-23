/**
 * Migration 049: Products table for pricing/plan management.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("049: Products table...");

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      tagline TEXT,
      price TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT '/month',
      features TEXT[] NOT NULL DEFAULT '{}',
      cta_text TEXT NOT NULL DEFAULT 'Start 14-day trial',
      cta_href TEXT,
      highlight BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      stripe_price_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + products table");

  // Seed the 3 existing plans
  await sql`
    INSERT INTO products (name, tagline, price, frequency, features, cta_text, cta_href, highlight, sort_order)
    VALUES
    (
      'Growth',
      'Your content engine, running.',
      '$99',
      '/month',
      ARRAY['10 blog posts per month', '4 topic clusters', '5 personas (Cast of Characters)', 'Monthly SEO audit', '1 site (channel)', 'All 8 platforms', 'AI brand playbook', 'Autopilot publishing'],
      'Start 14-day trial',
      NULL,
      false,
      1
    ),
    (
      'Authority',
      'Own your category.',
      '$219',
      '/month',
      ARRAY['Unlimited blog posts', 'All topic clusters', 'Unlimited personas', 'Weekly SEO audit', 'Up to 5 sites (channels)', 'All 8 platforms', 'AI brand playbook', 'Manual scheduling control', 'Blog import with redirect preservation'],
      'Start 14-day trial',
      NULL,
      true,
      2
    ),
    (
      'Enterprise',
      'Scale across clients and locations.',
      'Custom',
      '',
      ARRAY['Everything in Authority', 'Unlimited sites (channels)', 'Multi-brand management', 'Dedicated brand playbook per client', 'Agency dashboard', 'Priority support + SLA', 'Custom integrations', 'SSO / team access controls', 'Dedicated account manager'],
      'Talk to us',
      '/contact',
      false,
      3
    )
    ON CONFLICT DO NOTHING
  `;
  console.log("  + seeded 3 plans");

  console.log("\n049: Done.");
}

migrate().catch((err) => { console.error(err); process.exit(1); });
