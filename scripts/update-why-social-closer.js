/**
 * Rewrite the closing section of article #5 in the Why Social Matters series
 * to frame TracPost as the active force ending the "pick one platform" era,
 * rather than as a beneficiary of natural evolution.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const SLUG = "you-used-to-pick-one-the-new-math-says-all-of-them";

const NEW_BODY = `In 2018, a contractor I know decided to "do social media right." He picked Facebook. His customers were on Facebook. He posted three times a week, responded to every comment, ran the occasional ad. He was disciplined.

Three years later his organic Facebook reach had collapsed by 80%. The platform changed its algorithm to favor friends-and-family content over business pages. His audience was still there; the platform just stopped showing his posts to them.

He should have been on Instagram too, and Google Business Profile, and probably YouTube. His customers were on those platforms — at least some of them. But he had picked one and committed, because that was the advice everyone gave.

The advice wasn't wrong in 2018. The advice is wrong now. Not because the world quietly drifted into something different. Because we made it wrong.

## Why "pick one platform" used to be right

Three things made multi-platform impossible for small businesses:

**Time.** Each platform demands native fluency. Instagram captions don't work on LinkedIn. TikTok video doesn't translate to Pinterest. Just *cross-posting* the same thing everywhere gets you penalized by the algorithms and ignored by the audience.

**Skill.** Knowing what works on Instagram is different from knowing what works on TikTok. Most small business owners have time to develop intuition for one platform, maybe two.

**Fatigue.** Being active on six platforms means six places to check, six places to respond, six content pipelines, six audiences with different expectations. People burned out and quit altogether.

So the math used to be: one hour per day on one platform > one hour per day spread across six platforms. The compromise was real.

## What we changed

The compromise existed because each platform's content had to be hand-crafted by a human who understood that platform. We removed that requirement.

A single photo of a finished kitchen can become:
- A square Instagram post with a tight, conversational caption
- A vertical Reels video with motion and a hook
- A Facebook post with longer narrative
- A Pinterest pin optimized for "kitchen renovation ideas" search
- A Google Business Profile post tied to your service area
- A TikTok with appropriate sound and pacing
- A LinkedIn post if you're targeting commercial work

That used to require a marketing manager and 90 minutes of effort per asset. We made it one capture and zero minutes of adaptation work.

## The compounded math

Here's what changes when you can be present on all the relevant platforms instead of one:

**Each platform reaches a different slice of your customer base.** Facebook reaches the homeowners who already know you. Instagram reaches the ones who follow contractors visually. Pinterest catches the ones who are planning a future renovation. Google catches the ones who need help today. TikTok catches the next generation forming their first opinions about who they'd hire.

If you're on one of those, you're reaching one slice. If you're on all of them, the slices compound. Not "your audience is 6x bigger" — that's wrong, audiences overlap. But the *moments* you're showing up multiply. The customer who saw your finished bathroom on Instagram, then looked you up on Google when they were ready, is a customer your single-platform competitor never met.

**Each platform's algorithm rewards consistency.** When you post on five platforms but only one has activity, the four quiet ones treat you as inactive. When you post on five and all five are alive, all five reward you with reach. The aggregate effect is greater than the sum.

**Each platform de-risks the others.** Facebook's algorithm changes? You still have Instagram. TikTok gets banned? You still have Pinterest and Google. The contractor who picked Facebook in 2018 is rebuilding from zero. The contractor who's everywhere just lost one channel.

## How we ended the "pick one platform" era

We didn't wait for it to end. We ended it.

TracPost was built with one assertion baked into every line of code: there is no defensible reason a small business should be visible on one platform when their customers are spread across eight. Every excuse that used to apply — time, skill, fatigue, content adaptation cost — we removed.

You capture once: a photo, a video, a moment from a job. The platform takes that capture and produces native content for each platform you're connected to. Instagram gets an Instagram-shaped post. TikTok gets a TikTok-shaped video. Pinterest gets a pin optimized for planning search. Google Business Profile gets a service-area post. Facebook gets the longer-form treatment. Each platform gets what it actually wants.

You no longer choose where to invest your social energy. You invest in *capturing what your business is doing*, and the compounded presence happens automatically.

The "pick one platform" era was a compromise driven by friction. We removed the friction. The era is over. We slammed the door on the way out.

Show up everywhere. The compounded reach is the real reach. The businesses still picking one platform in 2026 aren't being strategic — they're five years late, and their competitors who figured this out are about to leave them in the rearview.`;

(async () => {
  const [tp] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost' LIMIT 1`;
  if (!tp) { console.error("TracPost site not found"); process.exit(1); }

  const result = await sql`
    UPDATE blog_posts
    SET body = ${NEW_BODY}, updated_at = NOW()
    WHERE site_id = ${tp.id} AND slug = ${SLUG}
    RETURNING title
  `;
  if (result.length > 0) {
    console.log(`UPDATED: ${result[0].title}`);
  } else {
    console.log(`NOT FOUND: ${SLUG}`);
  }
})().catch(err => { console.error(err); process.exit(1); });
