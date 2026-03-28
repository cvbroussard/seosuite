# Meta App Review — TracPost Platform

## Overview

TracPost is a managed social media content engine for small businesses (restaurants, contractors, salons, etc.). The platform provisions social accounts, generates brand-aligned content using AI, and publishes automatically across connected platforms.

**Business model:** Platform creates and manages social presence on behalf of subscribers. Subscribers capture content (photos/videos), the platform handles everything else — captions, scheduling, publishing, blog posts, SEO.

**Architecture: BOBO (Business On Behalf Of)**

TracPost uses the Managed Business API / BOBO framework. Each subscriber owns their own Business Manager with their own Pages and Instagram accounts. TracPost is granted agency permissions to manage content publishing and engagement tracking on their behalf.

This model was chosen over the 2-Tier BM approach because:
- No Line of Credit required (organic publishing only, no ad spend)
- Subscriber owns all assets from day one
- Clean offboarding — revoke agency access, subscriber keeps everything
- Recommended by Meta Business support for agency platforms focused on organic social management

**Provisioning workflow:**
1. Tenant manager creates a Business Manager for the subscriber
2. Creates Facebook Page + links Instagram under the subscriber's BM
3. Subscriber's BM grants TracPost agency permissions (Managed Business API)
4. TracPost creates a system user in the subscriber's BM
5. System user token (non-expiring) stored for automated publishing

---

## Permissions Requested

### 1. `business_management` (Advanced Access)

**How it benefits users:** Allows TracPost to accept agency permissions from subscriber Business Managers, create system users for stable API access, and manage Pages/Instagram accounts on the subscriber's behalf — all without requiring the subscriber to understand Meta Business Suite.

**Why it's necessary:** TracPost manages social presence for dozens of independent businesses. Each subscriber's Business Manager grants TracPost agency access via the Managed Business API. System users provide stable, non-expiring tokens that don't depend on any individual's personal Facebook login — critical for a 24/7 autopilot publishing pipeline.

**How the app processes the data:** When a subscriber grants TracPost agency permissions, the platform creates a system user within the subscriber's Business Manager, generates a long-lived token, and encrypts it (AES-256) for storage. This token is used exclusively for content publishing, engagement retrieval, and webhook management. No cross-subscriber data access is possible — each system user is scoped to its own BM.

**What would be lost without it:** TracPost would require each subscriber to manually complete an OAuth flow, maintain their own token refresh cycle (every 60 days), and troubleshoot token expiry issues. This breaks the managed-service model — subscribers are small business owners who don't have the technical knowledge to manage Meta APIs.

### 2. `pages_manage_posts` (Advanced Access)

**How it benefits users:** Enables the autopilot content pipeline — AI-generated, brand-aligned social posts are published to the subscriber's Facebook Page on an optimized schedule without manual intervention.

**Why it's necessary:** TracPost's core value proposition is automated social publishing. Media assets uploaded by the subscriber are triaged for quality, paired with AI-generated captions using the subscriber's brand playbook, scheduled into optimal time slots, and published automatically.

**How the app processes the data:** The pipeline reads the subscriber's brand playbook and media assets from our database, generates a caption via Claude AI, and publishes to the Page via `POST /{page_id}/feed` using the system user token. Published post IDs are stored for engagement tracking. Each subscriber's content is isolated — the system user can only access its own BM's Pages.

### 3. `pages_read_engagement` (Advanced Access)

**How it benefits users:** Subscribers see engagement metrics (likes, comments, shares, reach) in their TracPost dashboard without needing to open Meta Business Suite. The platform uses these metrics to optimize future publishing schedules and content strategy.

**Why it's necessary:** Engagement data feeds the content optimization loop — high-performing post types and time slots are weighted higher in future scheduling. Comment data flows into the subscriber's unified inbox for response management.

**How the app processes the data:** Engagement metrics are synced every 15 minutes via cron. Stored in our `social_posts` table (aggregated metrics) and `inbox_comments` table (individual comments). Data is scoped per subscriber — no cross-subscriber visibility. System user tokens ensure each sync only retrieves data from the subscriber's own Pages.

### 4. `pages_show_list` (Standard Access)

**How it benefits users:** Allows TracPost to discover which Pages are available within a subscriber's Business Manager during the connection flow, presenting them in a clean selector UI.

**Why it's necessary:** Dependency for `pages_manage_posts` and `pages_read_engagement`. Required to enumerate Pages associated with the subscriber's Business Manager after agency permissions are granted.

### 5. `pages_manage_metadata` (Advanced Access)

**How it benefits users:** Allows TracPost to configure Page webhook subscriptions for real-time comment and review notifications, and update Page settings (category, hours, description) from the provisioning workflow using Profile Kit data.

**Why it's necessary:** Webhook subscriptions enable real-time inbox updates instead of polling. Page metadata updates allow the provisioning flow to programmatically set Page details (bio, category, location, website link) after manual creation, using data generated from the subscriber's brand playbook.

### 6. `instagram_basic` (Advanced Access)

**How it benefits users:** Enables TracPost to read the subscriber's Instagram Business profile and media for analytics and content optimization.

**Why it's necessary:** Dependency for `instagram_content_publish`. Required to discover Instagram Business accounts linked to Pages within the subscriber's Business Manager.

### 7. `instagram_content_publish` (Advanced Access)

**How it benefits users:** Enables automated Instagram publishing — feed posts, Reels, and Stories are published on the subscriber's optimized schedule alongside Facebook content.

**Why it's necessary:** Instagram is the highest-priority platform for most TracPost subscribers (visual businesses: restaurants, contractors, salons). Without publishing access, the core autopilot feature cannot function on Instagram.

**How the app processes the data:** Same pipeline as Facebook — media assets are uploaded to the Instagram Content Publishing API container, caption and hashtags are generated from the brand playbook, and the post is published via `POST /{ig_user_id}/media_publish`. Published media IDs are stored for engagement tracking. The system user token scopes access to the subscriber's own Instagram account only.

### 8. `instagram_manage_insights` (Advanced Access)

**How it benefits users:** Subscribers see Instagram performance metrics in their TracPost analytics dashboard. The platform uses these to optimize content strategy and publishing cadence.

**Why it's necessary:** Feeds the same optimization loop as Facebook engagement data. Reach, impressions, and engagement rate inform the slot-filling algorithm that determines which content gets published when.

---

## Screencast Requirements

### Recording Setup
- Resolution: 1080p
- Monitor width: 1440px max
- Language: English UI
- No narration needed (silent OK)
- Show real data flowing through the app (not wireframes/mockups)

### Scenes to Record

**Scene 1: Admin Provisioning (business_management)**
- Show admin dashboard at `/admin/provisioning`
- Show Profile Kit with generated bios, handles, categories per platform
- Show subscriber's BM in Meta Business Suite with agency access granted
- Demonstrate: system user created, Pages visible, token active

**Scene 2: Account Connection (pages_show_list, instagram_basic)**
- Show subscriber dashboard at `/dashboard/accounts`
- Show connected Facebook Page and Instagram account
- Show account metadata (page name, account ID, token status)

**Scene 3: Content Pipeline (pages_manage_posts, instagram_content_publish)**
- Show media upload flow (subscriber uploads job site photos)
- Show AI-generated caption with brand playbook context
- Show scheduled post in calendar view
- Show published post appearing on Facebook Page and Instagram feed

**Scene 4: Engagement Sync (pages_read_engagement, instagram_manage_insights)**
- Show inbox with comments pulled from Facebook/Instagram
- Show analytics dashboard with engagement metrics per post
- Show how metrics influence next scheduling cycle (slot-filling algorithm)

**Scene 5: Webhook & Metadata (pages_manage_metadata)**
- Show real-time comment arriving in inbox via webhook
- Show Page metadata update from provisioning flow (bio, category set programmatically)

---

## Test Credentials for Meta Reviewers

Provide a test account with:
- Email: `meta-review@tracpost.com` (or similar)
- Password: [generate before submission]
- Pre-configured site with brand playbook, connected test Page, sample published posts
- Both admin (`/admin`) and subscriber (`/dashboard`) access
- Working system user token on the test Page

---

## Privacy Policy Checklist

The privacy policy at `https://tracpost.com/privacy` must explicitly cover:

- [ ] Business name and contact details
- [ ] Data collected: Facebook Page content, Instagram media, engagement metrics, comments, profile information, Page metadata
- [ ] How data is used: content optimization, engagement tracking, automated publishing, analytics, profile provisioning
- [ ] How data is stored: encrypted at rest (AES-256), database hosted on Neon (PostgreSQL), US region
- [ ] Data retention: active while subscription is live, 30-day grace after cancellation, hard purge after grace period
- [ ] Data deletion: subscriber can request via Settings → Delete Site; platform confirms via admin review
- [ ] Third-party sharing: none — data is not sold or shared with other subscribers or external parties
- [ ] Meta Platform Terms compliance statement
- [ ] BOBO/agency relationship disclosure: TracPost acts as an authorized agent managing content on behalf of the business owner

---

## Business Verification Documents

Prepare one of:
- Business registration / trade license
- Utility bill in company name
- Tax filing documents
- Bank statement with business name and address

All details (legal name, address spelling) must match exactly what's in Meta Business Settings.

---

## Pre-Submission Checklist

- [ ] Privacy policy live and accessible at tracpost.com/privacy
- [ ] At least 1 successful API call per permission (use Graph API Explorer)
- [ ] Business Manager verified
- [ ] Test user account created with sample data
- [ ] Screencast recorded (5 scenes above)
- [ ] Each permission has unique use case description (no copy-paste)
- [ ] App Settings: app icon, display name, contact email, privacy policy URL all set
- [ ] BOBO / Managed Business API integration tested with at least one subscriber BM

---

## Timeline Estimate

| Step | Duration |
|------|----------|
| Business verification | 1-5 days |
| Privacy policy update | 1 day |
| Record screencasts | 1 day |
| API test calls (1 per permission) | 1 hour |
| Submit App Review | 30 minutes |
| Review cycle 1 | 4-7 days |
| Potential resubmission | +3-5 days per cycle |
| **Total estimate** | **1-3 weeks** |

---

## Key Constraints

### Page Creation
Facebook Pages **cannot** be created via the API. The tenant manager must manually create each Page in Meta Business Suite under the subscriber's BM, then TracPost manages it via agency permissions.

**Workflow:**
1. Tenant manager creates subscriber's BM + Page manually (using Profile Kit for copy-paste)
2. Subscriber's BM grants TracPost agency access
3. TracPost creates system user → generates token → automated publishing begins

### BOBO vs 2-Tier Decision (Confirmed 2026-03-23)
Meta Business support confirmed: 2-Tier BM requires Line of Credit even for organic-only use cases. BOBO / Managed Business API is the recommended path for agency platforms focused on organic social management. No LOC required, subscriber owns all assets, clean separation of concerns.
