"use strict";

/**
 * Crafted Climate — Cross-platform transactional email templates
 *
 * Design goals:
 * - Email-client-safe HTML: table layout, inline CSS, no JavaScript, no CSS Grid/Flexbox.
 * - Seven category renderers reused by all email events.
 * - Severity/outcome-aware colours instead of one rigid layout.
 * - CID logo attachment for reliable server-side delivery with Nodemailer.
 * - Escapes user-controlled values to reduce HTML-injection risk.
 * - Produces HTML and plain-text alternatives.
 *
 * Usage:
 *   const { createEmailPayload } = require('./craftedClimateEmailTemplates');
 *   const mail = createEmailPayload({
 *     type: 'alert.deviceOfflineCritical',
 *     to: 'owner@example.com',
 *     vars: { nickname: 'Terra Node 04', dashboardUrl: 'https://...' }
 *   });
 *   await transporter.sendMail(mail);
 */

const path = require("path");
const fs = require("fs");

function resolveLogoFilePath() {
  const candidates = [
    process.env.EMAIL_LOGO_PATH,
    // Email-optimised version (43 KB) — preferred for embedding
    path.join(process.cwd(), "src", "config", "mail", "logo", "splash.png"),
    // Full-size raw file
    path.join(process.cwd(), "src", "config", "storage", "image", "cc_logo_raw.png"),
    // Legacy / alternate locations
    path.join(process.cwd(), "src", "assets", "cc_logo_raw.png"),
    path.join(process.cwd(), "src", "assets", "images", "cc_logo_raw.png"),
    path.join(process.cwd(), "assets", "cc_logo_raw.png"),
    path.join(__dirname, "cc_logo_raw.png"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[1];
}

/**
 * Resolve logo as a base64 data URI at startup so it embeds directly in the
 * <img src> attribute. This ensures the logo renders in web-based email clients
 * (Yahoo Mail, Gmail) that block CID attachments by default.
 * Falls back gracefully if the file cannot be read.
 */
function resolveLogoDataUri() {
  try {
    const logoPath = resolveLogoFilePath();
    if (!logoPath || !fs.existsSync(logoPath)) return null;
    const ext = path.extname(logoPath).toLowerCase();
    const mimeMap = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp" };
    const mime = mimeMap[ext] || "image/png";
    const data = fs.readFileSync(logoPath).toString("base64");
    return `data:${mime};base64,${data}`;
  } catch (_) {
    return null;
  }
}

// Resolved once at startup — avoids repeated disk reads per email
const LOGO_DATA_URI = resolveLogoDataUri();

const BRAND = Object.freeze({
  name: "Crafted Climate",
  trademarkName: "Crafted Climate™",
  from: `"${process.env.EMAIL_FROM_NAME || 'Crafted Climate'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SENDER || 'noreply@craftedclimate.org'}>`,
  primary: "#006838",
  action: "#35752D",
  success: "#4CAF50",
  surface: "#FFFFFF",
  divider: "#F2F2F2",
  warning: "#FBC02D",
  text: "#1F2937",
  mutedText: "#667085",
  supportEmail: process.env.SUPPORT_EMAIL || "support@craftedclimate.org",
  websiteUrl: process.env.WEBSITE_URL || "https://craftedclimate.org",
  appUrl: process.env.APP_URL || "https://app.craftedclimate.org",
  privacyUrl: process.env.PRIVACY_URL || "https://craftedclimate.org/privacy",
  termsUrl: process.env.TERMS_URL || "https://craftedclimate.org/terms",
  address: process.env.COMPANY_ADDRESS || "Accra, Ghana",
  logoCid: "crafted-climate-logo",
  logoPath: resolveLogoFilePath(),
  logoUrl: process.env.EMAIL_LOGO_URL || "https://console.craftedclimate.co/cc_logo_raw.png",
});

const THEMES = Object.freeze({
  brand: {
    accent: "#006838",
    accentText: "#FFFFFF",
    soft: "#EAF7F0",
    border: "#B9E1C8",
    label: "UPDATE",
  },
  success: {
    accent: "#2E7D32",
    accentText: "#FFFFFF",
    soft: "#ECF8EE",
    border: "#B7DFBB",
    label: "CONFIRMED",
  },
  info: {
    accent: "#1769AA",
    accentText: "#FFFFFF",
    soft: "#EBF5FC",
    border: "#B7D9EF",
    label: "INFORMATION",
  },
  pending: {
    accent: "#8A6D1D",
    accentText: "#FFFFFF",
    soft: "#FFF9E6",
    border: "#F2D98B",
    label: "PENDING REVIEW",
  },
  warning: {
    accent: "#B76600",
    accentText: "#FFFFFF",
    soft: "#FFF6E5",
    border: "#F3C77A",
    label: "WARNING",
  },
  critical: {
    accent: "#C62828",
    accentText: "#FFFFFF",
    soft: "#FFF0F0",
    border: "#F2B8B8",
    label: "CRITICAL",
  },
  severe: {
    accent: "#7F1D1D",
    accentText: "#FFFFFF",
    soft: "#FCEBEC",
    border: "#DFA8AA",
    label: "SEVERE OUTAGE",
  },
  rejected: {
    accent: "#A33A2B",
    accentText: "#FFFFFF",
    soft: "#FFF1EF",
    border: "#E8B8B1",
    label: "ACTION NEEDED",
  },
  security: {
    accent: "#27364A",
    accentText: "#FFFFFF",
    soft: "#F0F3F7",
    border: "#CBD3DD",
    label: "SECURITY",
  },
  neutral: {
    accent: "#475467",
    accentText: "#FFFFFF",
    soft: "#F6F7F9",
    border: "#D9DEE5",
    label: "NOTICE",
  },
});

const CATEGORY_EMAIL_TYPES = Object.freeze({
  auth: Object.freeze([
    "auth.otp",
    "auth.welcomeGoogle",
    "auth.welcomeDb",
    "auth.backofficeMfa",
  ]),
  admin: Object.freeze([
    "admin.passwordResetRequest",
    "admin.passwordResetApproved",
    "admin.forceUserPasswordReset",
  ]),
  alerts: Object.freeze([
    "alert.deviceOfflineWarning",
    "alert.deviceOfflineCritical",
    "alert.deviceOfflineSevere",
  ]),
  notifications: Object.freeze([
    "notification.generic",
    "notification.digest",
  ]),
  organization: Object.freeze([
    "org.verificationSubmitted",
    "org.verificationApproved",
    "org.verificationRejected",
    "org.partnerSubmitted",
    "org.partnerApproved",
    "org.partnerRejected",
    "org.partnerRevoked",
    "org.typeChangeSubmitted",
    "org.typeChangeApproved",
    "org.typeChangeRejected",
    "org.creationApproved",
    "org.creationRejected",
    "org.invitation",
  ]),
  collaboration: Object.freeze(["collaboration.deviceAdded"]),
  subscription: Object.freeze([
    "subscription.expiry3",
    "subscription.expiry2",
    "subscription.expiry1",
    "subscription.graceStarted",
    "subscription.grace2",
    "subscription.grace1",
    "subscription.downgraded",
  ]),
});

const SUPPORTED_EMAIL_TYPES = Object.freeze(
  Object.values(CATEGORY_EMAIL_TYPES).flat()
);

const EMAIL_ALIASES = Object.freeze({
  "auth.welcomeGoogle": "auth.welcome",
  "auth.welcomeDb": "auth.welcome",
});

const DB_SLUG_TO_TYPE = Object.freeze({
  "welcome-email": "auth.welcome",
  "password-reset": "admin.forceUserPasswordReset",
  "device-offline-warning": "alert.deviceOfflineWarning",
  "device-offline-critical": "alert.deviceOfflineCritical",
  "device-offline-severe": "alert.deviceOfflineSevere",
});

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(value = "") {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function safeUrl(value, fallback = "#") {
  if (!value) return fallback;
  try {
    const parsed = new URL(String(value));
    if (["https:", "http:", "mailto:"].includes(parsed.protocol)) return parsed.toString();
  } catch (_) {
    return fallback;
  }
  return fallback;
}

function safeEmail(value, fallback = BRAND.supportEmail) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : fallback;
}

function formatDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.EMAIL_TIMEZONE || "Africa/Accra",
  }).format(date);
}

/**
 * Converts a location value (string, JSON string, or object) into a clean
 * human-readable string like "Accra, Greater Accra, Ghana".
 * Raw lat/lng values are intentionally omitted — they are not useful in emails.
 */
function formatLocation(location) {
  if (!location) return "Not provided";
  let loc = location;
  if (typeof loc === "string") {
    const trimmed = loc.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { loc = JSON.parse(trimmed); } catch (_) { return trimmed; }
    } else {
      return trimmed; // already a plain string
    }
  }
  if (typeof loc !== "object" || loc === null) return String(location);

  // Build from most-specific to least-specific — street optional (can be very long)
  const parts = [
    loc.street,
    loc.city || loc.municipality || loc.municipalitySubdivision,
    loc.region,
    loc.country,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Not provided";
}

function resolveLogoSrc(vars = {}) {
  // 1. Explicit URL passed by caller (highest priority)
  if (vars.logoUrl) return safeUrl(vars.logoUrl, `cid:${BRAND.logoCid}`);
  // 2. Env-configured public URL (own CDN — reliable, keeps email size small)
  if (BRAND.logoUrl) return safeUrl(BRAND.logoUrl, `cid:${BRAND.logoCid}`);
  // 3. Base64 data URI — fallback when no URL is configured
  //    Works in all clients without external loading but increases email size
  if (LOGO_DATA_URI) return LOGO_DATA_URI;
  // 4. CID fallback for desktop clients (Outlook, Thunderbird)
  return `cid:${BRAND.logoCid}`;
}

function renderPreheader(preheader) {
  return `<div style="display:none;font-size:1px;color:#FFFFFF;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(
    preheader || "A message from Crafted Climate"
  )}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`;
}

function renderButton({ label, url, theme, width = 240 }) {
  if (!label || !url) return "";
  const safeHref = escapeHtml(safeUrl(url));
  const safeLabel = escapeHtml(label);
  const fill = theme.accent;

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px 0;">
      <tr>
        <td align="left" style="border-radius:8px;background:${fill};mso-padding-alt:0;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:46px;v-text-anchor:middle;width:${width}px;" arcsize="14%" stroke="f" fillcolor="${fill}">
            <w:anchorlock/>
            <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${safeHref}" target="_blank" style="background:${fill};border:1px solid ${fill};border-radius:8px;color:#FFFFFF;display:inline-block;font-family:Poppins,Arial,sans-serif;font-size:15px;font-weight:600;line-height:46px;text-align:center;text-decoration:none;width:${width}px;-webkit-text-size-adjust:none;">${safeLabel}</a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>`;
}

function renderMetaRows(rows = []) {
  const validRows = rows.filter((row) => row && row.label && row.value !== undefined && row.value !== null && String(row.value) !== "");
  if (!validRows.length) return "";

  const body = validRows
    .map(
      ({ label, value }) => `
      <tr>
        <td class="stack-label" width="42%" valign="top" style="padding:11px 14px;border-bottom:1px solid #EAECF0;color:#667085;font-family:Poppins,Arial,sans-serif;font-size:11px;font-weight:600;line-height:17px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;">${escapeHtml(label)}</td>
        <td class="stack-value" width="58%" valign="top" style="padding:11px 14px;border-bottom:1px solid #EAECF0;color:#1F2937;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:21px;word-break:break-word;">${escapeHtml(String(value))}</td>
      </tr>`
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;border:1px solid #EAECF0;border-radius:10px;border-collapse:separate;overflow:hidden;background:#FFFFFF;">
      ${body}
    </table>`;
}

function renderNotice(notice, theme) {
  if (!notice || !notice.text) return "";
  const noticeTheme = THEMES[notice.theme] || theme;
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0;border-collapse:separate;">
      <tr>
        <td style="border-left:5px solid ${noticeTheme.accent};background:${noticeTheme.soft};padding:14px 16px;border-radius:6px;color:#344054;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:22px;">
          ${notice.title ? `<strong style="display:block;color:${noticeTheme.accent};font-family:Poppins,Arial,sans-serif;font-size:13px;line-height:20px;margin-bottom:3px;">${escapeHtml(notice.title)}</strong>` : ""}
          ${nl2br(notice.text)}
        </td>
      </tr>
    </table>`;
}

function renderList(items = [], theme = THEMES.brand) {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0 20px 0;">
      ${list
        .map(
          (item) => `
        <tr>
          <td width="22" valign="top" style="padding:5px 0;color:${theme.accent};font-family:Arial,sans-serif;font-size:16px;line-height:22px;">&#8226;</td>
          <td valign="top" style="padding:5px 0;color:#344054;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:22px;">${escapeHtml(item)}</td>
        </tr>`
        )
        .join("")}
    </table>`;
}

function renderDigestItems(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return `<p style="margin:0;color:#667085;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:22px;">No notification details were supplied.</p>`;
  }

  const typeTheme = {
    alert: THEMES.critical,
    warning: THEMES.warning,
    success: THEMES.success,
    info: THEMES.info,
    neutral: THEMES.neutral,
  };

  return items
    .map((item) => {
      const theme = typeTheme[item.type] || THEMES.neutral;
      return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;border:1px solid ${theme.border};border-radius:10px;border-collapse:separate;background:#FFFFFF;">
          <tr>
            <td width="8" style="width:8px;background:${theme.accent};border-radius:10px 0 0 10px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="padding:15px 16px;">
              <div style="color:#101828;font-family:Poppins,Arial,sans-serif;font-size:14px;font-weight:600;line-height:21px;">${escapeHtml(item.title || "Notification")}</div>
              ${item.message ? `<div style="margin-top:4px;color:#475467;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:20px;">${nl2br(item.message)}</div>` : ""}
              ${item.timestamp ? `<div style="margin-top:7px;color:#98A2B3;font-family:Inter,Arial,sans-serif;font-size:11px;line-height:17px;">${escapeHtml(formatDate(item.timestamp))}</div>` : ""}
            </td>
          </tr>
        </table>`;
    })
    .join("");
}

function renderFooter({ recipientEmail, preferencesUrl, transactional = true }) {
  const supportEmail = safeEmail(BRAND.supportEmail);
  const preferenceLink = preferencesUrl
    ? `<span style="color:#D0D5DD;">&nbsp;&nbsp;|&nbsp;&nbsp;</span><a href="${safeUrl(preferencesUrl)}" style="color:#475467;text-decoration:underline;">Manage email preferences</a>`
    : "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7F8FA;border-top:1px solid #EAECF0;">
      <tr>
        <td style="padding:26px 28px 22px 28px;text-align:center;">
          <div style="color:#006838;font-family:Poppins,Arial,sans-serif;font-size:15px;font-weight:600;line-height:22px;">${escapeHtml(BRAND.trademarkName)}</div>
          <div style="margin-top:5px;color:#667085;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:19px;">Environmental intelligence for healthier, more sustainable communities.</div>
          <div style="margin-top:12px;color:#475467;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:20px;">
            <a href="mailto:${supportEmail}" style="color:#006838;text-decoration:none;">${escapeHtml(supportEmail)}</a>
            <span style="color:#D0D5DD;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
            <a href="${safeUrl(BRAND.websiteUrl)}" style="color:#006838;text-decoration:none;">craftedclimate.org</a>
            <span style="color:#D0D5DD;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
            ${escapeHtml(BRAND.address)}
          </div>
          <div style="margin-top:9px;color:#667085;font-family:Inter,Arial,sans-serif;font-size:11px;line-height:18px;">
            <a href="${safeUrl(BRAND.privacyUrl)}" style="color:#475467;text-decoration:underline;">Privacy</a>
            <span style="color:#D0D5DD;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
            <a href="${safeUrl(BRAND.termsUrl)}" style="color:#475467;text-decoration:underline;">Terms</a>
            ${preferenceLink}
          </div>
          ${recipientEmail ? `<div style="margin-top:12px;color:#98A2B3;font-family:Inter,Arial,sans-serif;font-size:10px;line-height:16px;">Sent to ${escapeHtml(recipientEmail)}${transactional ? " because this message relates to your account, device, organization, or subscription." : "."}</div>` : ""}
          <div style="margin-top:6px;color:#98A2B3;font-family:Inter,Arial,sans-serif;font-size:10px;line-height:16px;">&copy; ${new Date().getFullYear()} Crafted Climate. All rights reserved.</div>
        </td>
      </tr>
    </table>`;
}

function renderLayout({
  theme = THEMES.brand,
  preheader,
  eyebrow,
  heading,
  intro,
  bodyHtml = "",
  metaRows = [],
  notice,
  action,
  recipientName,
  recipientEmail,
  preferencesUrl,
  transactional = true,
  logoSrc,
}) {
  const greeting = recipientName ? `Hello ${escapeHtml(recipientName)},` : "Hello,";
  const headerLogoSrc = logoSrc || `cid:${BRAND.logoCid}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(heading || BRAND.name)}</title>
  <!-- Core styles are inline. This small block is only for responsive stacking and Outlook-safe resets. -->
  <style>
    html, body { margin:0 !important; padding:0 !important; width:100% !important; background:#F2F4F7 !important; }
    table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }
    @media screen and (max-width: 640px) {
      .email-shell { width:100% !important; max-width:100% !important; }
      .mobile-pad { padding-left:20px !important; padding-right:20px !important; }
      .stack-label, .stack-value { display:block !important; width:100% !important; box-sizing:border-box !important; }
      .stack-label { padding-bottom:2px !important; border-bottom:0 !important; }
      .stack-value { padding-top:2px !important; }
      .mobile-full { width:100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F2F4F7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${renderPreheader(preheader)}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F2F4F7;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:640px;max-width:640px;background:#FFFFFF;border:1px solid #E4E7EC;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(16,24,40,.06);">
          <tr>
            <td style="height:8px;background:${theme.accent};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 22px 28px;background:#FFFFFF;border-bottom:1px solid #EAECF0;text-align:center;">
              <img src="${escapeHtml(headerLogoSrc)}" width="160" alt="Crafted Climate" style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto;">
              <div style="margin-top:10px;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:18px;color:#667085;letter-spacing:.2px;">Connected environmental intelligence</div>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:30px 36px 34px 36px;background:#FFFFFF;">
              <div style="display:inline-block;padding:5px 10px;border-radius:999px;background:${theme.soft};border:1px solid ${theme.border};color:${theme.accent};font-family:Poppins,Arial,sans-serif;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.55px;text-transform:uppercase;">${escapeHtml(eyebrow || theme.label)}</div>
              <h1 style="margin:16px 0 12px 0;color:#101828;font-family:Oswald,'Arial Narrow',Arial,sans-serif;font-size:30px;font-weight:700;line-height:38px;letter-spacing:.1px;">${escapeHtml(heading)}</h1>
              <p style="margin:0 0 16px 0;color:#344054;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:24px;">${greeting}</p>
              ${intro ? `<p style="margin:0 0 16px 0;color:#344054;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:24px;">${nl2br(intro)}</p>` : ""}
              ${renderNotice(notice, theme)}
              ${bodyHtml}
              ${renderMetaRows(metaRows)}
              ${action ? renderButton({ ...action, theme }) : ""}
              <p style="margin:22px 0 0 0;color:#667085;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:21px;">Need help? Contact <a href="mailto:${safeEmail(BRAND.supportEmail)}" style="color:#006838;text-decoration:underline;">${escapeHtml(BRAND.supportEmail)}</a>.</p>
            </td>
          </tr>
          <tr>
            <td>${renderFooter({ recipientEmail, preferencesUrl, transactional })}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderOtpBox(code, expiresIn) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;border-collapse:separate;">
      <tr>
        <td align="center" style="padding:22px 16px;background:#F8FAF9;border:1px solid #CCE3D5;border-radius:12px;">
          <div style="color:#667085;font-family:Poppins,Arial,sans-serif;font-size:11px;font-weight:600;line-height:17px;letter-spacing:.6px;text-transform:uppercase;">Verification code</div>
          <div style="margin-top:8px;color:#006838;font-family:Inter,Consolas,'Courier New',monospace;font-size:34px;font-weight:700;line-height:42px;letter-spacing:8px;">${escapeHtml(code || "------")}</div>
          <div style="margin-top:8px;color:#667085;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:18px;">Expires in ${escapeHtml(expiresIn || "10 minutes")}</div>
        </td>
      </tr>
    </table>`;
}

function renderAuthEmail(type, vars) {
  const common = {
    recipientName: firstNonEmpty(vars.userName, vars.firstName),
    recipientEmail: vars.recipientEmail,
    logoSrc: resolveLogoSrc(vars),
    transactional: true,
  };

  if (type === "auth.otp") {
    const context = vars.context || "Account verification";
    return {
      subject: `Crafted Climate — ${context}`,
      html: renderLayout({
        ...common,
        theme: THEMES.brand,
        preheader: `Your Crafted Climate verification code is ${vars.otp || vars.code || "ready"}.`,
        eyebrow: "Identity verification",
        heading: context,
        intro: "Use the code below to continue. For your security, do not share this code with anyone.",
        bodyHtml: renderOtpBox(vars.otp || vars.code, vars.expiresIn),
        notice: {
          theme: "security",
          title: "Security note",
          text: "Crafted Climate support will never ask you to send this code by email, phone, or chat.",
        },
      }),
    };
  }

  if (type === "auth.backofficeMfa") {
    return {
      subject: "Crafted Climate — Backoffice verification code",
      html: renderLayout({
        ...common,
        theme: THEMES.security,
        preheader: "Your backoffice multi-factor authentication code.",
        eyebrow: "Backoffice security",
        heading: "Confirm your sign-in",
        intro: "Enter this one-time code to complete your backoffice sign-in.",
        bodyHtml: renderOtpBox(vars.otp || vars.code, vars.expiresIn || "5 minutes"),
        notice: {
          theme: "security",
          title: "Did not request this?",
          text: "Do not use the code. Change your password and contact the platform administrator immediately.",
        },
      }),
    };
  }

  return {
    subject: `Welcome to Crafted Climate${vars.userName ? `, ${vars.userName}` : ""}`,
    html: renderLayout({
      ...common,
      theme: THEMES.brand,
      preheader: "Your Crafted Climate account is ready.",
      eyebrow: "Welcome",
      heading: "Your environmental intelligence journey starts here",
      intro: "Your Crafted Climate account is ready. You can now connect devices, monitor environmental conditions, receive alerts, and collaborate with your team.",
      bodyHtml: renderList(
        [
          "Set up your profile and notification preferences.",
          "Register or connect your first environmental sensor.",
          "Invite trusted collaborators when you are ready.",
        ],
        THEMES.brand
      ),
      action: {
        label: vars.ctaLabel || "Open Crafted Climate",
        url: vars.dashboardUrl || BRAND.appUrl,
      },
      notice: vars.accountType
        ? { theme: "info", title: "Account type", text: vars.accountType }
        : undefined,
    }),
  };
}

function renderAdminEmail(type, vars) {
  const common = {
    recipientName: firstNonEmpty(vars.adminName, vars.userName),
    recipientEmail: vars.recipientEmail,
    logoSrc: resolveLogoSrc(vars),
    transactional: true,
    theme: THEMES.security,
  };

  if (type === "admin.passwordResetRequest") {
    return {
      subject: "Crafted Climate — Admin password reset approval required",
      html: renderLayout({
        ...common,
        preheader: "An administrator password reset request needs review.",
        eyebrow: "Admin approval required",
        heading: "Review a backoffice password reset",
        intro: "A backoffice administrator has requested a password reset. Review the request before approving it.",
        metaRows: [
          { label: "Administrator", value: vars.requestingAdminName || vars.requestingAdminEmail },
          { label: "Requested", value: formatDate(vars.requestedAt) },
          { label: "IP address", value: vars.ipAddress },
          { label: "Request ID", value: vars.requestId },
        ],
        notice: {
          theme: "warning",
          title: "Verify independently",
          text: "Confirm the request through an approved internal channel before granting access.",
        },
        action: { label: "Review reset request", url: vars.reviewUrl },
      }),
    };
  }

  if (type === "admin.passwordResetApproved") {
    return {
      subject: "Crafted Climate — Backoffice password reset approved",
      html: renderLayout({
        ...common,
        preheader: "Your backoffice password reset has been approved.",
        eyebrow: "Reset approved",
        heading: "Create a new backoffice password",
        intro: "Your password reset request has been approved. Use the secure link below to create a new password.",
        notice: {
          theme: "security",
          title: "Time-limited link",
          text: `This link expires ${vars.expiresAt ? `on ${formatDate(vars.expiresAt)}` : `in ${vars.expiresIn || "30 minutes"}`}. It can only be used once.`,
        },
        action: { label: "Reset backoffice password", url: vars.resetUrl },
      }),
    };
  }

  return {
    subject: vars.subject || "Crafted Climate — Password reset required",
    html: renderLayout({
      ...common,
      preheader: "An administrator requires you to reset your password.",
      eyebrow: "Account security",
      heading: "Reset your Crafted Climate password",
      intro: "An administrator has required a password reset for your account. Create a new password before continuing.",
      notice: vars.reason
        ? { theme: "warning", title: "Reason", text: vars.reason }
        : { theme: "security", title: "Protect your account", text: "Use a strong password you have not used on another service." },
      action: { label: "Create new password", url: vars.resetUrl },
      metaRows: [{ label: "Link expires", value: vars.expiresAt ? formatDate(vars.expiresAt) : vars.expiresIn }],
    }),
  };
}

function alertTheme(type) {
  if (type === "alert.deviceOfflineSevere") return THEMES.severe;
  if (type === "alert.deviceOfflineCritical") return THEMES.critical;
  return THEMES.warning;
}

function renderAlertEmail(type, vars) {
  const theme = alertTheme(type);
  const nickname = vars.nickname || "Your sensor";
  const duration = vars.durationFormatted || "an extended period";
  const severity = type.endsWith("Severe") ? "Severe" : type.endsWith("Critical") ? "Critical" : "Warning";

  const subjects = {
    "alert.deviceOfflineWarning": `Sensor alert: ${nickname} has been offline for ${duration}`,
    "alert.deviceOfflineCritical": `Critical: ${nickname} offline for ${duration} — action required`,
    "alert.deviceOfflineSevere": `Severe outage: ${nickname} — ${duration} without data`,
  };

  const actionText =
    severity === "Warning"
      ? "Check the device power source, connectivity, and installation environment when practical."
      : severity === "Critical"
        ? "Inspect the device as soon as possible to prevent a prolonged data gap."
        : "Immediate field or remote intervention is recommended. Treat this as a service-impacting outage.";

  return {
    subject: subjects[type],
    html: renderLayout({
      theme,
      logoSrc: resolveLogoSrc(vars),
      recipientName: vars.userName,
      recipientEmail: vars.recipientEmail,
      preheader: `${severity} device alert for ${nickname}.`,
      eyebrow: `${severity} device alert`,
      heading: `${nickname} is offline`,
      intro: `Crafted Climate has not received data from this device for ${duration}.`,
      notice: { theme: severity.toLowerCase(), title: "Recommended response", text: actionText },
      metaRows: [
        { label: "Device", value: nickname },
        { label: "Device ID", value: vars.devid },
        { label: "Model", value: vars.deviceModel },
        { label: "Last seen", value: formatDate(vars.lastSeen) },
        { label: "Location", value: formatLocation(vars.location) },
        { label: "Offline duration", value: duration },
        { label: "Batch health", value: vars.batchHealth },
      ],
      action: { label: "View device diagnostics", url: vars.dashboardUrl || BRAND.appUrl },
      transactional: true,
    }),
  };
}

function renderNotificationEmail(type, vars) {
  const preferencesUrl = vars.preferencesUrl;

  if (type === "notification.digest") {
    const frequency = vars.frequency || "notification";
    const count = vars.count ?? (Array.isArray(vars.items) ? vars.items.length : 0);
    return {
      subject: `Your ${frequency} digest — ${count} notification${Number(count) === 1 ? "" : "s"}`,
      html: renderLayout({
        theme: THEMES.info,
        logoSrc: resolveLogoSrc(vars),
        recipientName: vars.userName,
        recipientEmail: vars.recipientEmail,
        preferencesUrl,
        transactional: false,
        preheader: `${count} Crafted Climate notifications in your ${frequency} digest.`,
        eyebrow: `${frequency} digest`,
        heading: "Here is what changed",
        intro: `You have ${count} notification${Number(count) === 1 ? "" : "s"} in this ${frequency} summary.`,
        bodyHtml: renderDigestItems(vars.items),
        action: { label: "Open notification centre", url: vars.notificationsUrl || BRAND.appUrl },
      }),
    };
  }

  const theme = THEMES[vars.theme] || THEMES.info;
  return {
    subject: vars.title || "Crafted Climate notification",
    html: renderLayout({
      theme,
      logoSrc: resolveLogoSrc(vars),
      recipientName: vars.userName,
      recipientEmail: vars.recipientEmail,
      preferencesUrl,
      transactional: vars.transactional !== false,
      preheader: vars.preheader || vars.message || vars.title,
      eyebrow: vars.category || "Notification",
      heading: vars.title || "You have a new notification",
      intro: vars.message || "There is a new update in your Crafted Climate account.",
      notice: vars.notice,
      action: vars.actionUrl
        ? { label: vars.actionLabel || "View update", url: vars.actionUrl }
        : undefined,
      metaRows: Array.isArray(vars.metaRows) ? vars.metaRows : [],
    }),
  };
}

function organizationTypeConfig(type, vars) {
  const orgName = vars.orgName || "your organization";
  const configs = {
    "org.verificationSubmitted": {
      subject: `Business verification submitted — ${orgName}`,
      theme: THEMES.pending,
      eyebrow: "Verification submitted",
      heading: "Your verification is under review",
      intro: `We received the business verification submission for ${orgName}.`,
      notice: { theme: "pending", title: "What happens next", text: "Our team will review the submitted information and contact you if additional evidence is required." },
    },
    "org.verificationApproved": {
      subject: `Business verification approved — ${orgName}`,
      theme: THEMES.success,
      eyebrow: "Verification approved",
      heading: `${orgName} is now verified`,
      intro: "Your business verification has been approved. Verified organization features are now available.",
    },
    "org.verificationRejected": {
      subject: `Business verification update — ${orgName}`,
      theme: THEMES.rejected,
      eyebrow: "Verification update",
      heading: "Your verification needs attention",
      intro: `The verification request for ${orgName} could not be approved in its current form.`,
      notice: { theme: "rejected", title: "Review feedback", text: vars.reason || "Review the feedback and resubmit the required information." },
    },
    "org.partnerSubmitted": {
      subject: `Partner application submitted — ${orgName}`,
      theme: THEMES.pending,
      eyebrow: "Application submitted",
      heading: "Your partnership application is under review",
      intro: `We received the Crafted Climate partner application for ${orgName}.`,
    },
    "org.partnerApproved": {
      subject: `Partner application approved — ${orgName}`,
      theme: THEMES.success,
      eyebrow: "Partnership approved",
      heading: `Welcome to the Crafted Climate partner network`,
      intro: `${orgName} has been approved as a Crafted Climate partner.`,
    },
    "org.partnerRejected": {
      subject: `Partner application update — ${orgName}`,
      theme: THEMES.rejected,
      eyebrow: "Application update",
      heading: "Your partnership application needs attention",
      intro: `The partnership application for ${orgName} was not approved at this time.`,
      notice: { theme: "rejected", title: "Review outcome", text: vars.reason || "Contact support for clarification or submit a revised application when eligible." },
    },
    "org.partnerRevoked": {
      subject: `Partner status update — ${orgName}`,
      theme: THEMES.critical,
      eyebrow: "Partner status changed",
      heading: "Partner status has been revoked",
      intro: `${orgName} no longer has active Crafted Climate partner status.`,
      notice: { theme: "critical", title: "Reason", text: vars.reason || "Contact support for details about this status change." },
    },
    "org.typeChangeSubmitted": {
      subject: `Organization type change request — ${orgName}`,
      theme: THEMES.pending,
      eyebrow: "Request submitted",
      heading: "Your organization type change is under review",
      intro: `We received a request to change the organization type for ${orgName}.`,
    },
    "org.typeChangeApproved": {
      subject: `Type change approved — ${orgName}`,
      theme: THEMES.success,
      eyebrow: "Change approved",
      heading: "Organization type updated",
      intro: `${orgName} has been updated to ${vars.newType || "the approved organization type"}.`,
    },
    "org.typeChangeRejected": {
      subject: `Type change request update — ${orgName}`,
      theme: THEMES.rejected,
      eyebrow: "Request update",
      heading: "Organization type change not approved",
      intro: `The requested organization type change for ${orgName} was not approved.`,
      notice: { theme: "rejected", title: "Review feedback", text: vars.reason || "Review the eligibility requirements before submitting another request." },
    },
    "org.creationApproved": {
      subject: `Organization created — ${orgName}`,
      theme: THEMES.success,
      eyebrow: "Organization approved",
      heading: `${orgName} is ready`,
      intro: "Your organization creation request has been approved. You can now manage members, devices, and shared environmental data.",
    },
    "org.creationRejected": {
      subject: `Organization creation update — ${orgName}`,
      theme: THEMES.rejected,
      eyebrow: "Creation request update",
      heading: "Organization creation not approved",
      intro: `The creation request for ${orgName} was not approved in its current form.`,
      notice: { theme: "rejected", title: "Review feedback", text: vars.reason || "Correct the highlighted information and submit a new request." },
    },
  };
  return configs[type];
}

function renderOrganizationEmail(type, vars) {
  const orgName = vars.orgName || "your organization";

  if (type === "org.invitation") {
    const isNewUser = vars.invitationMode === "new_user" || vars.isNewUser === true;
    const actionUrl = isNewUser ? vars.signupUrl : vars.acceptUrl;
    return {
      subject: `Invitation to join ${orgName} on Crafted Climate`,
      html: renderLayout({
        theme: THEMES.brand,
        logoSrc: resolveLogoSrc(vars),
        recipientName: vars.inviteeName,
        recipientEmail: vars.recipientEmail,
        preheader: `You have been invited to join ${orgName}.`,
        eyebrow: "Organization invitation",
        heading: `Join ${orgName} on Crafted Climate`,
        intro: `${vars.inviterName || "An organization administrator"} invited you to join ${orgName}${vars.role ? ` as ${vars.role}` : ""}.`,
        bodyHtml: renderList(
          [
            "Collaborate on environmental monitoring activities.",
            "Access organization devices and data according to your role.",
            "Receive alerts and operational updates permitted by the organization.",
          ],
          THEMES.brand
        ),
        notice: {
          theme: "info",
          title: "Invitation expiry",
          text: `This invitation expires ${vars.expiresAt ? `on ${formatDate(vars.expiresAt)}` : "in 48 hours"}.`,
        },
        action: {
          label: isNewUser ? "Create account and join" : "Accept invitation",
          url: actionUrl,
        },
      }),
    };
  }

  const config = organizationTypeConfig(type, vars);
  if (!config) throw new Error(`Unsupported organization email type: ${type}`);

  return {
    subject: config.subject,
    html: renderLayout({
      theme: config.theme,
      logoSrc: resolveLogoSrc(vars),
      recipientName: vars.userName,
      recipientEmail: vars.recipientEmail,
      preheader: config.heading,
      eyebrow: config.eyebrow,
      heading: config.heading,
      intro: config.intro,
      notice: config.notice,
      metaRows: [
        { label: "Organization", value: orgName },
        { label: "Current type", value: vars.currentType },
        { label: "Requested type", value: vars.requestedType },
        { label: "New type", value: vars.newType },
        { label: "Submitted", value: vars.submittedAt ? formatDate(vars.submittedAt) : undefined },
        { label: "Reviewed", value: vars.reviewedAt ? formatDate(vars.reviewedAt) : undefined },
        { label: "Reference", value: vars.referenceId },
      ],
      action: vars.actionUrl
        ? { label: vars.actionLabel || "Open organization", url: vars.actionUrl }
        : undefined,
    }),
  };
}

function renderCollaborationEmail(type, vars) {
  if (type !== "collaboration.deviceAdded") {
    throw new Error(`Unsupported collaboration email type: ${type}`);
  }

  const deviceName = vars.devName || vars.nickname || "a device";
  return {
    subject: `Added as collaborator on ${deviceName}`,
    html: renderLayout({
      theme: THEMES.info,
      logoSrc: resolveLogoSrc(vars),
      recipientName: vars.collaboratorName,
      recipientEmail: vars.recipientEmail,
      preheader: `You now have collaborator access to ${deviceName}.`,
      eyebrow: "Device collaboration",
      heading: `You can now collaborate on ${deviceName}`,
      intro: `${vars.addedBy || "A device owner"} added you as a collaborator on this Crafted Climate device.`,
      metaRows: [
        { label: "Device", value: deviceName },
        { label: "Device ID", value: vars.devid },
        { label: "Role", value: vars.role },
        { label: "Location", value: vars.location },
      ],
      bodyHtml: vars.permissions?.length
        ? `<p style="margin:18px 0 8px 0;color:#101828;font-family:Poppins,Arial,sans-serif;font-size:14px;font-weight:600;line-height:21px;">Your permissions</p>${renderList(vars.permissions, THEMES.info)}`
        : "",
      notice: {
        theme: "info",
        title: "Access control",
        text: "Your access is limited to the permissions assigned by the device owner or organization administrator.",
      },
      action: { label: "Open device", url: vars.deviceUrl || vars.dashboardUrl || BRAND.appUrl },
    }),
  };
}

function subscriptionConfig(type, vars) {
  const planName = vars.planName || "Crafted Climate";
  const renewalLabel = vars.ctaLabel || "Renew subscription";
  const configs = {
    "subscription.expiry3": {
      subject: `Your ${planName} subscription expires in 3 days`,
      theme: THEMES.brand,
      eyebrow: "Renewal reminder",
      heading: "Your subscription expires in 3 days",
      intro: `Renew ${planName} to keep your current monitoring, data, and collaboration features active.`,
      actionLabel: renewalLabel,
    },
    "subscription.expiry2": {
      subject: `Your ${planName} subscription expires in 2 days`,
      theme: THEMES.warning,
      eyebrow: "Renewal approaching",
      heading: "Two days remain on your subscription",
      intro: `Your ${planName} subscription is close to expiry. Renew now to avoid entering the grace period.`,
      actionLabel: renewalLabel,
    },
    "subscription.expiry1": {
      subject: `Your ${planName} subscription expires tomorrow`,
      theme: THEMES.critical,
      eyebrow: "Last renewal reminder",
      heading: "Your subscription expires tomorrow",
      intro: `Renew ${planName} today to avoid service restrictions and possible data-access changes.`,
      actionLabel: renewalLabel,
    },
    "subscription.graceStarted": {
      subject: `Your ${planName} subscription has expired — grace period started`,
      theme: THEMES.brand,
      eyebrow: "Grace period active",
      heading: "Your grace period has started",
      intro: `Your ${planName} subscription has expired, but your account is temporarily in a grace period.`,
      actionLabel: renewalLabel,
    },
    "subscription.grace2": {
      subject: `Grace period: 2 days remaining to renew ${planName}`,
      theme: THEMES.warning,
      eyebrow: "Grace period ending",
      heading: "Two grace-period days remain",
      intro: `Renew ${planName} before the grace period ends to retain your current plan features.`,
      actionLabel: renewalLabel,
    },
    "subscription.grace1": {
      subject: "Final day: Grace period ends tomorrow",
      theme: THEMES.critical,
      eyebrow: "Final grace-period notice",
      heading: "Your grace period ends tomorrow",
      intro: `Renew ${planName} now to prevent automatic downgrade to the Freemium plan.`,
      actionLabel: renewalLabel,
    },
    "subscription.downgraded": {
      subject: "Account downgraded to Freemium plan",
      theme: THEMES.neutral,
      eyebrow: "Plan changed",
      heading: "Your account is now on Freemium",
      intro: "The grace period ended without renewal, so your account has been moved to the Freemium plan.",
      actionLabel: vars.ctaLabel || "Review plan options",
    },
  };
  return configs[type];
}

function renderSubscriptionEmail(type, vars) {
  const config = subscriptionConfig(type, vars);
  if (!config) throw new Error(`Unsupported subscription email type: ${type}`);

  return {
    subject: config.subject,
    html: renderLayout({
      theme: config.theme,
      logoSrc: resolveLogoSrc(vars),
      recipientName: vars.userName,
      recipientEmail: vars.recipientEmail,
      preferencesUrl: vars.preferencesUrl,
      transactional: true,
      preheader: config.heading,
      eyebrow: config.eyebrow,
      heading: config.heading,
      intro: config.intro,
      notice:
        type === "subscription.downgraded"
          ? {
              theme: "neutral",
              title: "What changes",
              text: vars.downgradeSummary || "Some premium monitoring, collaboration, retention, or reporting features may now be limited.",
            }
          : {
              theme: config.theme === THEMES.critical ? "critical" : config.theme === THEMES.warning ? "warning" : "info",
              title: "Protect service continuity",
              text: "Renewing before the deadline helps prevent interruptions to alerts, reporting, device collaboration, and data access.",
            },
      metaRows: [
        { label: "Plan", value: vars.planName },
        { label: "Expiry date", value: vars.expiryDate ? formatDate(vars.expiryDate) : undefined },
        { label: "Grace period ends", value: vars.graceEndsAt ? formatDate(vars.graceEndsAt) : undefined },
        { label: "Billing account", value: vars.billingAccount },
      ],
      action: { label: config.actionLabel, url: vars.renewalUrl || vars.billingUrl || BRAND.appUrl },
    }),
  };
}

function normalizeType(type) {
  return EMAIL_ALIASES[type] || type;
}

function renderByCategory(type, vars = {}) {
  const normalized = normalizeType(type);
  const category = normalized.split(".")[0];

  switch (category) {
    case "auth":
      return renderAuthEmail(normalized, vars);
    case "admin":
      return renderAdminEmail(normalized, vars);
    case "alert":
      return renderAlertEmail(normalized, vars);
    case "notification":
      return renderNotificationEmail(normalized, vars);
    case "org":
      return renderOrganizationEmail(normalized, vars);
    case "collaboration":
      return renderCollaborationEmail(normalized, vars);
    case "subscription":
      return renderSubscriptionEmail(normalized, vars);
    default:
      throw new Error(`Unsupported email category for type: ${type}`);
  }
}

function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getLogoAttachment() {
  return {
    filename: path.basename(BRAND.logoPath),
    path: BRAND.logoPath,
    cid: BRAND.logoCid,
    contentDisposition: "inline",
  };
}

/**
 * Returns a complete Nodemailer payload.
 * `vars.recipientEmail` is automatically populated from `to` for footer display.
 */
function createEmailPayload({ type, to, vars = {}, from = BRAND.from, replyTo } = {}) {
  if (!type) throw new Error("createEmailPayload requires an email type.");
  if (!to) throw new Error("createEmailPayload requires a recipient in `to`.");

  const recipientEmail = Array.isArray(to) ? to.join(", ") : String(to);
  const rendered = renderByCategory(type, { ...vars, recipientEmail: vars.recipientEmail || recipientEmail });
  const useCidLogo = !vars.logoUrl && !BRAND.logoUrl;
  const headers = {
    "X-Entity-Ref-ID": vars.messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    "X-Crafted-Climate-Template": normalizeType(type),
  };

  if (vars.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${safeUrl(vars.unsubscribeUrl)}>`;
    if (vars.oneClickUnsubscribe === true) {
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
  }

  return {
    from,
    to,
    replyTo: replyTo || vars.replyTo || BRAND.supportEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text || htmlToText(rendered.html),
    attachments: useCidLogo ? [getLogoAttachment()] : [],
    headers,
  };
}

/**
 * Helpful for your DB-template service:
 * - Seed `password-reset`; it is referenced by production code.
 * - Point both existing welcome triggers to `auth.welcome`.
 * - Dynamic `{category}-notification` slugs can render `notification.generic`.
 */
function typeFromDbSlug(slug) {
  if (!slug) return null;
  if (DB_SLUG_TO_TYPE[slug]) return DB_SLUG_TO_TYPE[slug];
  if (slug.endsWith("-notification")) return "notification.generic";
  return null;
}

module.exports = {
  BRAND,
  THEMES,
  DB_SLUG_TO_TYPE,
  EMAIL_ALIASES,
  CATEGORY_EMAIL_TYPES,
  SUPPORTED_EMAIL_TYPES,
  createEmailPayload,
  renderByCategory,
  renderLayout,
  getLogoAttachment,
  typeFromDbSlug,
  escapeHtml,
  safeUrl,
};
