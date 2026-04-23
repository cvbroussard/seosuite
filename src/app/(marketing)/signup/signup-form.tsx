"use client";

import { useState, useCallback } from "react";

interface Props {
  productId: string;
  productName: string;
  skipTrial: boolean;
}

export function SignupForm({ productId, productName, skipTrial }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const saveLead = useCallback(async (fields: Record<string, unknown>) => {
    if (!fields.email && !email) return;
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: (fields.email as string) || email,
          name: (fields.name as string) || name || null,
          phone: (fields.phone as string) || phone || null,
          product_id: productId,
          is_trial: !skipTrial,
          source: "signup",
        }),
      });
    } catch { /* silent */ }
  }, [email, name, phone, productId, skipTrial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setLoading(true);

    // Update lead status
    await saveLead({ email, name, phone });

    // Create checkout session
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          skip_trial: skipTrial,
          customer_email: email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="su-form">
      <div className="su-field">
        <label htmlFor="su-email">Work email</label>
        <input
          id="su-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          onBlur={() => { if (email) saveLead({ email }); }}
          placeholder="you@yourbusiness.com"
          autoComplete="email"
        />
      </div>

      <div className="su-field">
        <label htmlFor="su-name">Full name</label>
        <input
          id="su-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name && email) saveLead({ email, name }); }}
          placeholder="John Smith"
          autoComplete="name"
        />
      </div>

      <div className="su-field">
        <label htmlFor="su-phone">Phone <span className="su-optional">(optional)</span></label>
        <input
          id="su-phone"
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onBlur={() => { if (phone && email) saveLead({ email, phone }); }}
          placeholder="(412) 555-0123"
          autoComplete="tel"
        />
      </div>

      <button type="submit" disabled={loading || !email} className="su-submit">
        {loading ? "Redirecting to checkout..." : skipTrial ? `Subscribe to ${productName}` : "Continue to payment"}
      </button>

      <style dangerouslySetInnerHTML={{ __html: formStyles }} />
    </form>
  );
}

const formStyles = `
  .su-form { display: flex; flex-direction: column; gap: 20px; }

  .su-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }
  .su-optional { font-weight: 400; color: #9ca3af; }

  .su-field input {
    width: 100%;
    padding: 12px 14px;
    font-size: 15px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #fff;
    color: #1a1a1a;
    transition: border-color 0.15s;
  }
  .su-field input:focus {
    outline: none;
    border-color: #1a1a1a;
    box-shadow: 0 0 0 3px rgba(26,26,26,0.05);
  }
  .su-field input::placeholder { color: #9ca3af; }

  .su-submit {
    width: 100%;
    padding: 14px;
    font-size: 15px;
    font-weight: 600;
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 4px;
  }
  .su-submit:hover { background: #333; }
  .su-submit:disabled { opacity: 0.5; cursor: not-allowed; }
`;
