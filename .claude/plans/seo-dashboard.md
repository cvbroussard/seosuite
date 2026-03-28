# SEO Dashboard Plan

## Context

TracPost subscribers need to see that their content engine is producing results. The SEO dashboard closes the loop: playbook → content → visibility → traffic → leads. The subscriber doesn't need web analytics — they need proof that the machine is working.

## Scope

**In scope (TracPost controls the rendering):**
- Blog posts and hub pages — TracPost generates the HTML, meta tags, schema
- Search Console data for playbook search phrases
- GBP search/view/call metrics
- Social post engagement → click-through attribution
- Native analytics on blog/hub pages (no GA dependency)

**Out of scope (external sites):**
- Tenant's marketing website auditing/injection — stays in RetailSpec
- Ecommerce on-page SEO (Product/Category schema) — RetailSpec only
- Google Analytics API integration — future premium feature if needed
- Full technical SEO auditing (crawling, broken links, CWV) — overkill for the subscriber

## Data Sources

### Already collecting (pipeline generates during autopilot)
| Data | Source | Table |
|------|--------|-------|
| Blog post meta (title, description, OG, schema) | Blog generator | `blog_posts` |
| Hub page schema (LocalBusiness JSON-LD) | Schema generator | Generated at render time |
| Content topics with search queries | Playbook auto-generate | `content_topics` |
| Social post engagement (likes, comments, shares) | Inbox sync | `social_posts`, `inbox_comments` |
| GBP insights (views, searches, calls, directions) | GBP sync | `gbp_locations.sync_data` |
| Sitemap + RSS generation | Blog system | Route handlers |
| Playbook language map (search phrases, pain/desire) | Brand intelligence | `sites.brand_playbook` |

### Need to build
| Data | How | Storage |
|------|-----|---------|
| Blog post view counts | Server-side counter on blog render | New `blog_post_views` table or column on `blog_posts` |
| Hub page view counts | Server-side counter on hub render | New `hub_page_views` table or column on `sites` |
| Referral source tracking | Parse `referer` header on blog/hub requests | Store with view count |
| Search Console rankings | Google Search Console API (site verification required) | New `search_rankings` table |
| Content coverage map | Compare `content_topics` to `blog_posts` | Computed at query time |
| Index status per post | Google Indexing API or Search Console | Column on `blog_posts` |

## Dashboard Sections

### 1. SEO Score Card
Top-level health metric. Composite of:
- Meta coverage: % of blog posts with meta_title + meta_description
- Schema coverage: % of posts with valid schema_json
- Content coverage: % of playbook topics with published articles
- Index rate: % of published posts that are indexed (if Search Console connected)

Display: Single score 0-100 with color indicator, breakdown tooltip.

### 2. Content Coverage
Visual map of playbook topics vs published articles.

```
Content Topics (40)          Published (12)     Gap (28)
━━━━━━━━━━━━━━━━━━━━━━━━━━━ 30% covered

culinary_workflow     ████░░░░  3 of 8
chef_kitchen_design   ██░░░░░░  2 of 8
equipment_integration █░░░░░░░  1 of 8
project_showcase      ████░░░░  4 of 8
culinary_lifestyle    ██░░░░░░  2 of 8
```

Each topic row links to the published post or shows "Generate" to queue it.

### 3. Search Visibility
Playbook search phrases with ranking position (requires Search Console).

```
Search Phrase                          Position   Impressions   Clicks
chef kitchen remodel pittsburgh        12         340           28
professional range kitchen renovation  —          —             —
custom kitchen for home chef           8          180           15
```

Without Search Console: show the target phrases from the playbook with "Connect Search Console for ranking data" CTA.

### 4. Blog Performance
Per-post metrics from native analytics.

```
Post                                    Views   Referrals   Published
The Culinary Life Audit                 142     67 organic   Mar 25
Why Counter Height Matters for Chefs    98      34 social    Mar 24
Custom Walnut Islands: A Cook's Guide   76      28 organic   Mar 23
```

### 5. Hub Page Performance
Hub page view count, referral breakdown, social profile clicks.

```
blog.tracpost.com/epicurious-kitchens
Views this month: 234
Sources: organic 45%, social 32%, direct 18%, referral 5%
```

### 6. GBP Insights
From the GBP API sync — no additional integration needed.

```
Google Business Profile — Epicurious Kitchens
Views: 1,240 (last 30 days)
Searches: 890 (direct 340, discovery 550)
Actions: 45 calls, 23 website clicks, 12 direction requests
```

### 7. Social → Traffic Attribution
Which social posts drove clicks to the blog/hub page.

```
Instagram post (Mar 25)    →  34 hub page visits
Pinterest pin (Mar 24)     →  28 blog post visits
Facebook post (Mar 23)     →  12 hub page visits
```

Requires UTM params on published post links (already in the caption generator's CTA links).

## Implementation Phases

### Phase 1: Native Analytics + Content Coverage
- Add view counter middleware to blog/hub page routes
- Store view count + referral source per request
- Build content coverage section (topics vs posts)
- SEO score card (meta/schema coverage)
- **Effort:** 1-2 days

### Phase 2: Blog + Hub Performance Dashboard
- Blog performance table (views, referrals, published date)
- Hub page performance card
- Social → traffic attribution (UTM tracking)
- **Effort:** 1 day

### Phase 3: GBP Insights Section
- Pull from existing `gbp_locations.sync_data`
- Build GBP insights card (views, searches, actions)
- **Effort:** Half day

### Phase 4: Search Console Integration (optional)
- Google Search Console API integration
- Site verification flow
- Search phrase ranking table
- Index status per post
- **Effort:** 2-3 days (includes OAuth + API setup)

## Native Analytics Design

**No external dependencies.** Track views server-side in the blog/hub route handlers.

```typescript
// In blog/[siteSlug]/[articleSlug]/page.tsx
await sql`
  INSERT INTO blog_views (post_id, site_id, referrer, viewed_at)
  VALUES (${post.id}, ${site.siteId}, ${referrer}, NOW())
`;
```

**Table: `blog_views`**
```sql
CREATE TABLE blog_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL,
  referrer    TEXT,
  source      TEXT, -- 'organic', 'social', 'direct', 'referral'
  viewed_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_blog_views_post ON blog_views(post_id, viewed_at DESC);
CREATE INDEX idx_blog_views_site ON blog_views(site_id, viewed_at DESC);
```

**Referrer classification:**
- `google.com`, `bing.com`, `duckduckgo.com` → organic
- `instagram.com`, `facebook.com`, `t.co`, `tiktok.com`, etc. → social
- No referrer → direct
- Everything else → referral

**Hub page views** — same pattern with a `hub_views` table or reuse `blog_views` with a null `post_id`.

## Subscriber View (Curated)

Same philosophy as the brand page — show outputs, hide methodology:

- **"Your content is being found"** — not "SEO audit results"
- **"234 people visited your hub page"** — not "page view analytics"
- **"You rank #8 for 'custom kitchen Pittsburgh'"** — not "SERP position tracking"
- **"28 of 40 topic gaps remain"** — not "content gap analysis"

The subscriber sees proof the engine works. They don't see the SEO machinery.

## Files to Create
- `scripts/migrate-021-blog-views.js` — view tracking table
- `src/app/dashboard/seo/page.tsx` — rewrite with new sections
- `src/app/dashboard/seo/seo-dashboard.tsx` — client component
- `src/lib/seo/view-tracker.ts` — referrer classification + insert
- `src/lib/seo/coverage.ts` — content topics vs blog posts

## Files to Modify
- `src/app/blog/[siteSlug]/[articleSlug]/page.tsx` — add view tracking
- `src/app/blog/[siteSlug]/page.tsx` — add hub view tracking
- `src/lib/pipeline/caption-generator.ts` — ensure UTM params on CTA links
