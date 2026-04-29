/**
 * Onboarding route-group layout.
 *
 * Deliberately minimal — no MarketingNav, no MarketingFooter, no
 * marketing chrome at all. The onboarding flow renders its own thin
 * progress bar + centered TracPost logo and nothing else, matching
 * Mercury's pattern of isolating the onboarding experience from
 * the marketing site.
 *
 * Why a separate route group: the marketing layout wraps children in
 * <MarketingNav> + <MarketingFooter>. Those components compete with
 * the wizard's chrome (the nav covers the thin progress bar; the
 * footer pulls focus). Putting /onboarding in its own group escapes
 * the marketing layout entirely while keeping the URLs the same.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="onboarding-shell">{children}</div>;
}
