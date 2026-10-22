/**
 * Transactional email for Starship app auth (invites, password resets).
 *
 * Resend over plain `fetch` — no npm dependency. When `RESEND_API_KEY` is
 * absent the mailer does not fail: it logs the link and reports
 * `delivered: false` so callers can surface the link to the admin instead.
 * That keeps inviting people working before the sending domain is verified.
 */
import process from "node:process";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Starship <noreply@beenex.org>";
const SEND_TIMEOUT_MS = 10_000;

export function isMailerConfigured(env = process.env) {
  return Boolean(String(env.RESEND_API_KEY ?? "").trim());
}

function getFrom(env = process.env) {
  return String(env.AUTH_EMAIL_FROM ?? "").trim() || DEFAULT_FROM;
}

/**
 * Send one email. Never throws: a transport failure is reported as
 * `{ delivered: false, error }` so an invite still succeeds with a link the
 * admin can pass along by hand.
 */
export async function sendMail({ to, subject, text, html }, env = process.env) {
  const apiKey = String(env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    console.warn(
      `[mailer] RESEND_API_KEY unset — not sending "${subject}" to ${to}`,
    );
    return { delivered: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFrom(env),
        to: [to],
        subject,
        text,
        ...(html ? { html } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      console.error(
        `[mailer] Resend rejected "${subject}" to ${to}: ${response.status} ${detail}`,
      );
      return { delivered: false, reason: `http_${response.status}`, detail };
    }

    const body = await response.json().catch(() => ({}));
    return { delivered: true, id: body?.id ?? null };
  } catch (err) {
    const reason = err?.name === "AbortError" ? "timeout" : "network";
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, err);
    return { delivered: false, reason, detail: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

function layout({ heading, body, action }) {
  const button = action
    ? `<p style="margin:28px 0"><a href="${action.href}" style="background:#1f6feb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${action.label}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c2024">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<h1 style="margin:0 0 16px;font-size:20px">${heading}</h1>
${body}
${button}
<p style="color:#6b7280;font-size:13px;margin-top:28px">If you were not expecting this email you can ignore it.</p>
</div></body></html>`;
}

export async function sendInviteEmail(
  { to, inviteUrl, invitedBy, expiresInHours },
  env = process.env,
) {
  const who = invitedBy ? ` by ${invitedBy}` : "";
  return sendMail(
    {
      to,
      subject: "You have been invited to Starship",
      text: [
        `You have been invited${who} to Starship.`,
        "",
        `Set your password and sign in: ${inviteUrl}`,
        "",
        `This link expires in ${expiresInHours} hours. You can also sign in with Google using this email address.`,
      ].join("\n"),
      html: layout({
        heading: "You have been invited to Starship",
        body: `<p style="margin:0;line-height:1.6">You have been invited${who}. Set a password to finish, or sign in with Google using this address.</p>
<p style="color:#6b7280;font-size:13px;margin:16px 0 0">This link expires in ${expiresInHours} hours.</p>`,
        action: { href: inviteUrl, label: "Set your password" },
      }),
    },
    env,
  );
}

export async function sendPasswordResetEmail(
  { to, resetUrl, expiresInHours },
  env = process.env,
) {
  return sendMail(
    {
      to,
      subject: "Reset your Starship password",
      text: [
        "A password reset was requested for your Starship account.",
        "",
        `Reset it here: ${resetUrl}`,
        "",
        `This link expires in ${expiresInHours} hours.`,
      ].join("\n"),
      html: layout({
        heading: "Reset your Starship password",
        body: `<p style="margin:0;line-height:1.6">A password reset was requested for your account.</p>
<p style="color:#6b7280;font-size:13px;margin:16px 0 0">This link expires in ${expiresInHours} hours.</p>`,
        action: { href: resetUrl, label: "Choose a new password" },
      }),
    },
    env,
  );
}
