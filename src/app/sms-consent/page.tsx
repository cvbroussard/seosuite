export const metadata = {
  title: "SMS Consent — TracPost",
};

export default function SmsConsentPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1>SMS Messaging Consent</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Last updated: April 2, 2026</p>

      <div className="space-y-6 leading-relaxed text-foreground/80">
        <section>
          <h2 className="mb-2">How SMS Consent Works</h2>
          <p>
            TracPost sends SMS messages only when explicitly initiated by a business
            owner through the TracPost dashboard. End users cannot self-subscribe to
            receive text messages from TracPost.
          </p>
        </section>

        <section>
          <h2 className="mb-2">Opt-In Process</h2>
          <p>
            A business owner signs into the TracPost web dashboard at{" "}
            <a href="https://studio.tracpost.com" className="text-accent hover:underline">
              studio.tracpost.com
            </a>{" "}
            and navigates to <strong>Team</strong> management. From there, the owner:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Enters the team member&apos;s name, email, and phone number</li>
            <li>Assigns a role (Manager or Capture)</li>
            <li>Selects &quot;SMS&quot; or &quot;Both&quot; as the invite delivery method</li>
            <li>Clicks the send button to deliver a one-time sign-in link via text message</li>
          </ol>
          <p className="mt-2">
            Only the authenticated business owner can initiate SMS messages. Team members
            receive messages because their employer has added them to the platform.
          </p>
        </section>

        <section>
          <h2 className="mb-2">Types of Messages</h2>
          <p>TracPost sends the following types of SMS messages:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Sign-in links</strong> — One-time authentication links for accessing the TracPost dashboard or mobile app</li>
            <li><strong>Platform notifications</strong> — Alerts about published content, new reviews, or items requiring attention</li>
          </ul>
          <p className="mt-2">
            TracPost does not send marketing messages, promotional content, or messages
            to anyone who has not been explicitly added by a business owner.
          </p>
        </section>

        <section>
          <h2 className="mb-2">Message Frequency</h2>
          <p>
            Message frequency varies. Sign-in links are sent only when requested by the
            business owner. Platform notifications depend on account activity, typically
            1-5 messages per week.
          </p>
        </section>

        <section>
          <h2 className="mb-2">Opt-Out</h2>
          <p>
            Reply <strong>STOP</strong> to any TracPost message to opt out of all future
            SMS communications. You can also ask your business owner to remove your phone
            number from the Team settings in the TracPost dashboard.
          </p>
        </section>

        <section>
          <h2 className="mb-2">Help</h2>
          <p>
            Reply <strong>HELP</strong> to any message for support information, or
            contact us at{" "}
            <a href="mailto:support@tracpost.com" className="text-accent hover:underline">
              support@tracpost.com
            </a>.
          </p>
        </section>

        <section>
          <h2 className="mb-2">Message &amp; Data Rates</h2>
          <p>
            Message and data rates may apply. TracPost does not charge for SMS messages,
            but your carrier&apos;s standard messaging rates apply.
          </p>
        </section>

        <section>
          <h2 className="mb-2">Related Policies</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>
            </li>
            <li>
              <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
