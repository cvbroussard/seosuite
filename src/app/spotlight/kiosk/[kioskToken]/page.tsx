"use client";

import { useState, useEffect, useCallback } from "react";

interface SpotlightSession {
  id: string;
  session_code: string;
  photo_url: string;
  staff_note: string | null;
}

type KioskState = "idle" | "photo" | "form" | "google" | "thanks";

export default function KioskPage({ params }: { params: Promise<{ kioskToken: string }> }) {
  const [kioskToken, setKioskToken] = useState<string>("");
  const [state, setState] = useState<KioskState>("idle");
  const [session, setSession] = useState<SpotlightSession | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    params.then((p) => setKioskToken(p.kioskToken));
  }, [params]);

  // Poll for pending sessions
  useEffect(() => {
    if (!kioskToken || state !== "idle") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/spotlight/kiosk/pending?kiosk_token=${kioskToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.session) {
            setSession(data.session);
            setState("photo");
          }
        }
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [kioskToken, state]);

  // Auto-transition from photo reveal to form
  useEffect(() => {
    if (state === "photo") {
      const timer = setTimeout(() => setState("form"), 3000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Auto-return to idle from thanks
  useEffect(() => {
    if (state === "thanks") {
      const timer = setTimeout(() => {
        setState("idle");
        setSession(null);
        setRating(5);
        setReviewText("");
        setCustomerName("");
        setCustomerEmail("");
        setConsent(false);
        setGoogleUrl(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const handleSubmit = useCallback(async () => {
    if (!session || !kioskToken) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/spotlight/kiosk/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kiosk_token: kioskToken,
          session_id: session.id,
          star_rating: rating,
          review_text: reviewText || null,
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          photo_consent: consent,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.google_review_url) {
          setGoogleUrl(data.google_review_url);
          setState("google");

          // Track click
          fetch("/api/spotlight/kiosk/google-click", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kiosk_token: kioskToken, session_id: session.id }),
          });

          // Open Google Reviews
          setTimeout(() => {
            window.open(data.google_review_url, "_blank");
            setTimeout(() => setState("thanks"), 3000);
          }, 1500);
        } else {
          setState("thanks");
        }
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }, [session, kioskToken, rating, reviewText, customerName, customerEmail, consent]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      {/* Idle State */}
      {state === "idle" && (
        <div className="text-center">
          <div className="mb-6 text-6xl">*</div>
          <h1 className="text-3xl font-light tracking-wide">Spotlight</h1>
          <p className="mt-3 text-lg text-white/50">Waiting for the next moment...</p>
          <div className="mt-8 h-1 w-24 mx-auto overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full animate-pulse bg-white/30" />
          </div>
        </div>
      )}

      {/* Photo Reveal */}
      {state === "photo" && session && (
        <div className="relative flex h-screen w-full items-center justify-center">
          <img
            src={session.photo_url}
            alt="Spotlight"
            className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl animate-in fade-in zoom-in duration-700"
          />
        </div>
      )}

      {/* Review Form */}
      {state === "form" && session && (
        <div className="w-full max-w-lg px-6">
          {/* Photo thumbnail */}
          {session.photo_url && (
            <div className="mb-6 flex justify-center">
              <img
                src={session.photo_url}
                alt=""
                className="h-32 w-32 rounded-xl object-cover shadow-lg"
              />
            </div>
          )}

          <h2 className="mb-6 text-center text-2xl font-light">Share Your Experience</h2>

          {/* Star Rating */}
          <div className="mb-6 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`text-4xl transition-transform active:scale-110 ${
                  star <= rating ? "text-yellow-400" : "text-white/20"
                }`}
              >
                ★
              </button>
            ))}
          </div>

          {/* Review Text */}
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Tell us about your experience (optional)"
            rows={3}
            className="mb-4 w-full rounded-xl border border-white/20 bg-white/5 p-4 text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
          />

          {/* Name */}
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Your name (optional)"
            className="mb-3 w-full rounded-xl border border-white/20 bg-white/5 p-3 text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
          />

          {/* Email */}
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="Email — we'll send you the photo (optional)"
            className="mb-4 w-full rounded-xl border border-white/20 bg-white/5 p-3 text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
          />

          {/* Consent */}
          <label className="mb-6 flex items-start gap-3 text-sm text-white/60">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded"
            />
            <span>I agree to have my photo shared on social media</span>
          </label>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-xl bg-white py-4 text-lg font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
          >
            {submitting ? "Sharing..." : "Share"}
          </button>
        </div>
      )}

      {/* Google Redirect */}
      {state === "google" && (
        <div className="text-center">
          <div className="mb-4 text-5xl">★</div>
          <h2 className="text-2xl font-light">Opening Google Reviews...</h2>
          <p className="mt-2 text-white/50">Leave your review on Google to help others find us</p>
        </div>
      )}

      {/* Thank You */}
      {state === "thanks" && (
        <div className="text-center">
          <div className="mb-4 text-6xl">✓</div>
          <h2 className="text-3xl font-light">Thank You!</h2>
          <p className="mt-3 text-lg text-white/50">
            {consent ? "You'll be featured on our feed!" : "We appreciate your feedback!"}
          </p>
        </div>
      )}
    </div>
  );
}
