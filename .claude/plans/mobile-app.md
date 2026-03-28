# TracPost Studio — Mobile App Plan

## Core Identity

Two words: **Capture + Engagement**

The mobile app is the subscriber's only required touchpoint with TracPost. Everything else happens behind the curtain. The app serves two purposes:
1. **Capture** — subscriber is the eyes on the ground, only they can point the camera
2. **Engagement** — customer interactions need a human voice with timely responses

## Stack

- **Expo (React Native)** — shares TypeScript with the web app, single codebase for both platforms
- **Android-first development** — APK sideloading for rapid dev/test cycles, no TestFlight approval wait
- **iOS production polish** — same codebase, TestFlight for beta, App Store for production
- **Auth** — QR/SMS/email invite token → device-bound session in SecureStore (no email/password)
- **Push** — Expo Push Notifications (already wired — `sendPushNotification` exists)

---

## Multi-User & Team

### User Roles

| Role | Capture | Inbox | Activity | Approve | Description |
|------|---------|-------|----------|---------|-------------|
| **Owner** | ✓ | ✓ | ✓ | ✓ | Full access. The subscriber. Always "All Sites". |
| **Engagement** | — | ✓ | ✓ | — | Office manager handling reviews/comments. |
| **Capture** | ✓ | — | ✓ | — | Crew member taking job site photos. |

### Site Scoping

Each team member is scoped to either **All Sites** or a **specific site**.

| Scope | Behavior |
|-------|----------|
| **All Sites** | Site picker visible. Captures tagged with selected site. Inbox shows all sites. |
| **Specific Site** | No site picker. Captures auto-tagged to their site. Inbox filtered to their site. |

Owner is always All Sites (not configurable). Other roles default to All Sites but can be scoped per site by the owner.

**Tier gating:**

| Plan | Mobile Users | Site Scoping |
|------|-------------|-------------|
| Growth ($99/mo) | 1 (owner only) | N/A (1 site, 1 user) |
| Authority ($219/mo) | Up to 5 | Available (up to 5 sites) |
| Enterprise (future) | Unlimited | Available + custom roles |

Growth subscribers see the Mobile App page with only their own QR code and settings — no "Add User" button. Authority subscribers see the full team management grid with the "Add User" action (shows "2 of 5" limit).

### Team Management

**Web — `/dashboard/mobile-app` (account-level, not site-specific):**

- Settings accordion (shared for all users in V1)
- Team grid with accordion rows
- "Add User" button with plan limit indicator
- Each row: name, role, site scope, status, last active
- Expanded pane: edit role, edit site scope, QR code, invite link, Send SMS, Revoke

**Mobile — Owner role only, under Profile:**

- Team list (name, role, status)
- "+ Invite" → name + phone + role + site scope → sends SMS
- Tap member → view status, revoke access
- No editing role/scope from mobile — web only

### Auth Flow (QR Invite)

```
Owner opens /dashboard/mobile-app
  → Clicks "Add team member"
  → Enters name, role, site scope (All Sites or specific), delivery method
  → Invite generated encoding: tracpost-studio://invite/{token}
    Token resolves to team_member record: subscriber_id, site_id, role

Team member receives invite (QR scan, SMS tap, or email click)
  → App installs from App Store (or opens if installed)
  → Deep link triggers auto-auth
  → Device-bound session created in SecureStore
  → App opens to role-appropriate home screen
  → If site-scoped: no site picker, everything filtered to their site
  → If all sites: site picker available
```

**Owner's first install:** Same flow — the Mobile App web page shows "Your QR code" with full-access token.

**Security:**
- Invite token: one-time use, expires in 48 hours
- Device session: long-lived, stored in SecureStore, revocable from web
- Revoking access on web invalidates all device sessions for that user
- No email/password ever — auth is QR-based only

### Database

```sql
CREATE TABLE team_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id         UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  site_id               UUID REFERENCES sites(id) ON DELETE CASCADE, -- NULL = all sites
  name                  TEXT NOT NULL,
  email                 TEXT, -- optional, for email invites
  phone                 TEXT, -- optional, for SMS invites
  role                  TEXT NOT NULL, -- 'owner', 'engagement', 'capture'
  invite_token          TEXT UNIQUE,
  invite_method         TEXT, -- 'qr', 'sms', or 'email'
  invite_expires        TIMESTAMPTZ,
  invite_consumed       BOOLEAN DEFAULT false,
  device_token          TEXT, -- push notification token (Expo)
  session_token_hash    TEXT UNIQUE, -- SHA256 hash of device session token
  session_issued_at     TIMESTAMPTZ, -- for rotation policy
  last_active_at        TIMESTAMPTZ,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### Invite Delivery Methods

**QR code (in-person):**
Owner shows QR on their screen or prints it. Team member scans → app installs/opens → auto-authenticated. Best for: standing next to the person.

**SMS invite (default for mobile):**
Owner enters name + phone number + role. Twilio sends:
> "Carl invited you to TracPost Studio for Epicurious Kitchens. Tap to get started: https://tracpost.com/invite/{token}"

Universal link → opens App Store if not installed, deep links into app if installed → auto-authenticated. Best for: crew members in the field. The invite lands on the same device that will use the app — zero friction.

**Email invite (fallback):**
Owner enters name + email + role. System sends branded email:
> "You've been invited to TracPost Studio for Epicurious Kitchens"
> [Open TracPost Studio] ← universal link with invite token
> "Download on the App Store" ← fallback

Best for: office staff, people who prefer email.

**All three methods use the same token and auth flow** — only the delivery channel differs. `invite_method` tracks which was used.

### Token Lifecycle

```
INVITE (one-time):
  Owner creates invite (QR or email)
    → invite_token generated (crypto random, 32 bytes, base64url)
    → invite_expires = NOW() + 48 hours
    → invite_consumed = false

ACTIVATION (one-time):
  Team member scans QR or clicks email link
    → App validates: token exists AND not expired AND not consumed
    → Mark invite_consumed = true
    → Generate device session token (crypto random, 64 bytes)
    → Store SHA256 hash in team_members.session_token_hash
    → Store session_issued_at = NOW()
    → Store raw token in device SecureStore
    → Device is authenticated

EVERY API CALL:
  App sends: Authorization: Bearer {device_session_token}
    → Server: SHA256(token) → match against team_members.session_token_hash
    → Check: is_active = true
    → Check: session not expired (rotation policy)
    → If valid → proceed with role-based access
    → If invalid → 401 → app shows "Session expired" → scan new QR

TOKEN ROTATION (90-day):
  On each app launch:
    → If session_issued_at > 90 days ago:
      → App calls /api/auth/mobile/rotate with current token
      → Server generates new token, updates hash + session_issued_at
      → App stores new token in SecureStore
    → If app not opened for 90 days:
      → Next launch: rotation endpoint rejects (too stale)
      → 401 → "Please scan a new invite QR code"
      → Owner generates new QR from web
```

### Revocation

| Trigger | Who | Action | Effect |
|---------|-----|--------|--------|
| Owner removes team member | Tenant (web) | `is_active = false` | Next API call → 401 → app locks |
| Owner revokes specific device | Tenant (web) | `session_token_hash = NULL` | Immediate lockout on next call |
| Owner clicks "Revoke all" | Tenant (web) | All team_members sessions nulled | Everyone rescans |
| Phone lost/stolen | Tenant (web) | Revoke that member's session | Immediate lockout |
| Subscriber cancels account | Platform | All team_members deactivated | All devices lock |
| Platform suspends subscriber | Platform | All sessions invalidated | All devices lock |
| 90 days inactive | Automatic | Rotation rejects stale token | Must rescan QR |

### Recovery

Owner loses phone → logs into web (email + password) → Mobile App page → revoke old device → scan new QR.

Team member loses phone → tells owner → owner revokes on web → sends new email invite or shows new QR.

No web access AND no phone → support ticket → platform admin re-issues invite.

---

## Web Settings Page — `/dashboard/mobile-app`

All mobile configuration lives on the web. The app reads settings via API.

### Sections

**1. Download & Invite**
- Owner's QR code (always visible, regeneratable)
- Team members list with role badges, last active, device status
- "Add team member" → name + role + delivery method (QR / SMS / email)
- Revoke button per member
- Regenerate invite for expired/unconsumed invites

**2. Auto-Response Rules**
- **Auto-handle compliments** (toggle, default OFF)
  - When ON: AI responds to positive comments/reactions automatically
  - Subscriber sees auto-handled items in a separate tab
- **Draft responses to questions** (always ON, not toggleable)
  - AI drafts, human approves — never auto-send
- **Alert on negative sentiment** (always ON, not toggleable)
  - Push notification + red flag in inbox — never auto-respond
- **Auto-response tone** — select from playbook tones

**3. Notification Preferences**
- Pipeline results (assets triaged, posts published) — toggle
- New reviews — toggle (default ON, can't turn off for negative)
- New comments — toggle
- Veto window alerts — toggle
- Blog posts published — toggle

**4. Capture Settings**
- Default content pillar (dropdown from site pillars)
- Video max duration (15s / 30s / 60s / unlimited)
- Watermark (future — toggle)

**5. Veto Window**
- Hours before publish to alert (0 = no veto, 2, 4, 8, 24)
- Default: 4 hours

---

## App Screens

### 1. Capture (Home Screen)

The app opens to the camera. Camera first, always.

Role required: **Owner** or **Capture**

**Camera view:**
- Full-screen camera preview
- Shutter button (photo) + hold for video
- Switch front/back camera
- Flash toggle
- Gallery picker (bottom-left)

**Post-capture:**
- Preview of captured photo/video
- Context note input (large, prominent)
- Voice memo button → transcribes to context note via Whisper API
- "Upload" button → sends to media_assets, closes to camera
- "Retake" button

**Batch mode:**
- Capture multiple photos in sequence without stopping
- Swipe through captured batch, add notes per photo
- "Upload all" button

**Key behaviors:**
- Upload happens in background — subscriber doesn't wait
- Push notification when upload completes: "3 assets uploaded — pipeline processing"
- Offline support: queue uploads when no connection, sync when back online
- Pending upload count badge on capture tab

### 2. Inbox (Engagement Hub)

Unified inbox — all platforms, one stream. AI-triaged for calm.

Role required: **Owner** or **Engagement**

**Three-tab structure (Podium-inspired):**

```
[ Needs You (3) ]  [ Auto-handled ]  [ All ]
```

- **Needs You** (default view): Only items requiring human response. 3-5 items, not 20.
- **Auto-handled**: AI-responded items (if auto-handle enabled). Grayed, review-only.
- **All**: Everything chronological. Full picture.

**Inbox list (Sprout pattern):**
- Each row: avatar with platform badge (bottom-right, 16px), name, text preview, timestamp
- Type differentiation:
  - **Comment**: speech bubble icon, neutral styling
  - **Review**: star rating prominently displayed, color-coded (green 4-5★, yellow 3★, red 1-2★)
  - **DM**: lock icon, subtle background tint
  - **Mention**: @ icon
- Unread: bold text, dot indicator
- Response time indicator (yellow > 5min, red > 15min) for items in "Needs You"

**Swipe gestures (Front/Sprout pattern):**
- Swipe right → **archive/complete** (green) — marks as handled
- Swipe left → **flag/escalate** (yellow) — push to owner if engagement role, or mark priority
- Tap → open detail with AI draft

**Reply composer (universal pattern):**
- Bottom sheet slides up (half screen, expandable)
- AI-drafted response pre-populated
- Tone selector: three chips — **Professional** | **Friendly** | **Empathetic**
- "Regenerate" button (sparkle icon)
- Edit freely → "Send" button
- For reviews: star rating displayed above composer, AI calibrated to rating

**Review-specific UX (Birdeye pattern):**
- Star rating large and color-coded at top
- Time since posted (freshness matters for SEO)
- Source platform logo prominent (Google vs Facebook response norms differ)
- AI calibration by rating:
  - 5★: grateful, reference something specific from the review
  - 3-4★: appreciative, acknowledge concern, offer improvement
  - 1-2★: empathetic, apologize, offer to resolve offline with contact info

**DM handling:**
- Conversation thread view (iMessage-style)
- AI-suggested replies based on context
- Quick reply chips: "Thanks!", "I'll get back to you", "See our website"
- Platform badge on each message bubble showing source

**AI triage classification (runs during inbox sync):**

| Category | Criteria | Action |
|----------|----------|--------|
| **Auto-handle** | Positive sentiment, no question, common pattern ("love it!", emoji-only, "great work") | AI responds if opt-in enabled |
| **Needs voice** | Contains question, mentions pricing/booking/availability, asks for specifics | AI drafts, waits for approval |
| **Urgent** | Negative sentiment (1-2★ review, complaint keywords), potential lead | Push notification, red flag, no auto-response ever |

### 3. Activity (Pipeline Feed)

Read-only feed showing the machine at work. Same data as web right aside.

Role required: **All roles**

- Published posts with platform icon + caption preview
- Scheduled posts with date/time
- Triaged assets with context note
- Blog posts published with title
- New reviews received
- Team member uploads ("John uploaded 3 photos")

**Behaviors:**
- Pull-to-refresh
- Tap published post → deep link to platform
- Tap review → jumps to inbox detail
- Skeleton loading states (shimmer cards)

### 4. Approve (Veto Queue)

Posts approaching their scheduled publish time.

Role required: **Owner** only

- Cards: scheduled time, platform icon, caption, attached media thumbnail
- Swipe right → approve (green checkmark)
- Swipe left → reject (red X)
- Tap → edit caption inline before approving
- Only shows posts within `veto_window_hours` before `scheduled_at`
- Haptic feedback on swipe actions

**Empty state:** "Nothing to review — autopilot is handling it ✓"

**Badge:** Tab shows count only when items exist in the window.

### 5. Profile (Minimal)

Accessible via avatar in top-right corner of any screen. Not a tab.

- User name + role badge
- Site picker (for multi-site subscribers, owner role only)
- Hub page link (opens in browser)
- Link to web dashboard
- Sign out

No settings in the app — "Manage settings on the web" link.

---

## Navigation

Bottom tab bar. Tabs shown based on role:

**Owner:**
```
[ Capture ]  [ Inbox (3) ]  [ Activity ]  [ Approve (1) ]
```

**Engagement:**
```
[ Inbox (3) ]  [ Activity ]
```

**Capture:**
```
[ Capture ]  [ Activity ]
```

Profile avatar in top-right corner on every screen.

---

## Push Notifications

Already wired (`sendPushNotification` in pipeline). Configurable per user on the web settings page.

| Trigger | Title | Body | Action | Roles |
|---------|-------|------|--------|-------|
| Assets triaged | "Content ready" | "3 assets processed — 2 scheduled" | Open Activity | All |
| Post published | "Published to Instagram" | Caption preview | Deep link to post | Owner, Engagement |
| New review | "New 5★ review" | Reviewer name + preview | Open Inbox detail | Owner, Engagement |
| New comment | "Comment on your post" | Commenter + preview | Open Inbox detail | Owner, Engagement |
| New DM | "Message from {name}" | Preview | Open Inbox thread | Owner, Engagement |
| Negative review | "⚠️ 1★ review" | Reviewer + preview | Open Inbox detail | Owner, Engagement (always on) |
| Veto window | "Review before publishing" | "2 posts in 4 hours" | Open Approve | Owner |
| Blog post live | "Blog post published" | Title | Open hub page | Owner |
| Pipeline error | "Publishing failed" | Platform + error | Open Activity | Owner |
| Team upload | "{Name} uploaded 3 photos" | Context note preview | Open Activity | Owner |

---

## Offline Support

**Capture:** Photos/videos + context notes saved to local queue. Badge shows pending count. Syncs automatically when connection returns. Works fully offline.

**Inbox:** Last 50 items cached from last sync. Composed responses queued locally, sent when back online. Banner: "You're offline — responses will send when connected."

**Activity:** Cached from last sync. Pull-to-refresh when online.

**Approve:** Cached from last sync. Approvals/rejections queued, synced when online.

---

## AI-Powered Responses

### Comment Response
```
You are responding to a comment on {platform} for {siteName}.
Brand tone: {playbook tone}
Comment: "{comment.text}"
Original post: "{post.caption}"

Write a brief, authentic response. Keep it under {maxLength} chars.
Be warm, professional, and conversational.
```

### Review Response (rating-aware)
```
You are responding to a {rating}★ review on {platform} for {siteName}.
Brand tone: {playbook tone}
Review: "{review.body}"
Reviewer: {review.reviewer_name}

5★: Genuine gratitude, reference something specific.
3-4★: Thank them, acknowledge concern, offer improvement.
1-2★: Empathize, apologize, offer to resolve offline.

Under 500 characters. Professional.
```

### Auto-Handle Classification
```
Classify this social media interaction:

Comment: "{text}"
Platform: {platform}
On post about: "{post.caption}"

Categories:
- AUTO_HANDLE: Positive sentiment, no question, generic praise, emoji-only
- NEEDS_VOICE: Contains question, mentions pricing/scheduling/availability, requests info
- URGENT: Negative sentiment, complaint, dissatisfaction, potential PR issue

Return ONLY the category name.
```

---

## What's NOT in the App

- Brand playbook (web only)
- Settings / site configuration (web Mobile App page)
- Account management (billing, cancel, delete)
- Connection management (OAuth is browser-based)
- SEO dashboard
- Blog management / editing
- Analytics deep dives
- Admin / provisioning
- Team member management (web only)
- Spotlight kiosk management (separate web page)

---

## Data Flow

```
CAPTURE:
  Team member captures photo on job site
    → Upload to R2 via /api/upload/presign
    → Register asset via /api/assets (tagged with team_member_id)
    → Push to owner: "{Name} uploaded 3 photos"
    → Pipeline cron (15 min): triage → slots → captions
    → Push: "content ready"

PUBLISH:
  Veto window (configurable hours before scheduled_at)
    → Push to owner: "Review before publishing"
    → Owner approves/rejects in Approve tab
    → Or: veto window expires, publishes automatically

  Post publishes
    → Push: "Published to Instagram"
    → Appears in Activity feed

ENGAGEMENT:
  Inbox sync pulls comments/reviews/DMs from all platforms
    → AI classifies each: AUTO_HANDLE / NEEDS_VOICE / URGENT
    → AUTO_HANDLE (if enabled): AI responds, moves to Auto-handled tab
    → NEEDS_VOICE: AI drafts response, appears in "Needs You" tab
    → URGENT: Push notification (always), red flag in inbox, no auto-response
    → Team member opens Inbox → sees draft → edits → sends
```

---

## Build Phases

### Phase 1: Foundation + Capture MVP
- Expo project setup, navigation, auth
- QR invite flow (web page + deep link handler)
- Camera screen (photo + video)
- Context note input + voice memo
- Upload to existing API endpoints
- Background upload + offline queue
- Push notifications (pipeline results)
- Team member table + basic role check
- **Effort:** 2-3 weeks

### Phase 2: Inbox + AI Responses
- Unified inbox feed (three tabs: Needs You / Auto-handled / All)
- AI triage classification (auto/needs voice/urgent)
- Platform badge on avatar pattern
- Review rating color coding
- Bottom sheet reply composer
- AI-drafted responses with tone selector + regenerate
- Swipe gestures (archive/flag)
- Auto-handle opt-in (reads from web settings)
- Send response via platform API
- Push notifications (reviews/comments/DMs)
- **Effort:** 2-3 weeks

### Phase 3: Activity + Approve
- Activity feed (read-only, matches web right aside)
- Approve/reject queue with swipe gestures + haptic
- Caption editing before approve
- Veto window configuration (reads from web settings)
- **Effort:** 1-2 weeks

### Phase 4: Web Settings Page
- `/dashboard/mobile-app` page
- QR code generation (owner + team invites)
- Team member list with role management
- Auto-response rules toggles
- Notification preferences
- Capture settings + veto window
- **Effort:** 1 week

### Phase 5: Polish + Multi-User
- Role-based navigation (different tabs per role)
- Team upload attribution ("John uploaded 3 photos")
- Offline resilience (inbox cache, response queue)
- Batch capture mode
- DM handling with thread view
- Device management (revoke sessions)
- Multi-site picker (owner role)
- **Effort:** 2 weeks

---

## Design References

- **Sprout Social** — best unified inbox layout (platform badge, type pills, swipe gestures)
- **Podium** — best "AI-handled vs needs human" segmentation, conversation-centric model
- **Birdeye** — best review-specific UX (rating color coding, source prominence, freshness indicator)
- **Front** — best swipe/triage mechanics (configurable, SLA timers)

## TestFlight / Distribution

- Android: APK sideloading for dev/test → Play Store internal testing → production
- iOS: TestFlight for beta → App Store submission
- App Store listing: "TracPost Studio — Capture content, your marketing department handles the rest"
- Category: Business / Marketing
