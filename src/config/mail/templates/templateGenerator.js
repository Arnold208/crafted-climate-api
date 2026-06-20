/**
 * CraftedClimate — Professional Email Template Generator
 *
 * Brand Identity: Deep Green (#1F6B2E), Inter/Segoe UI fonts.
 * Logo embedded via CID attachment (works in all major email clients).
 * All footer links resolved from {{appUrl}} template variable.
 *
 * IMPORTANT: ctaText and ctaUrl are SEPARATE string parameters.
 * Never pass an object as ctaText.
 */

const primaryColor      = '#1F6B2E'; // CraftedClimate Deep Green
const accentColor       = '#4CAF50'; // Action Green
const backgroundColor   = '#F0F4F1'; // Soft green-tinted light bg
const cardColor         = '#FFFFFF';
const textColor         = '#1C2A1E'; // Near-black green-tinted
const mutedText         = '#5A6860';
const borderColor       = '#D6E4DA';
const logoSrc           = 'cid:cc_logo'; // CID for Nodemailer inline attachment

/**
 * Generates the full HTML email.
 *
 * @param {string} heading        - Card headline (e.g. "Sensor Offline Warning")
 * @param {string} bodyContent    - Main HTML body content (use info-box, info-row classes)
 * @param {string} [ctaText]      - Button label text (e.g. "View Dashboard")
 * @param {string} [ctaUrl]       - Button URL (e.g. "https://app.craftedclimate.com/devices/...")
 * @returns {string}
 */
const generateTemplateHtml = (heading, bodyContent, ctaText, ctaUrl) => {
  return `<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${heading}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* ── Reset ─────────────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      background-color: ${backgroundColor};
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 15px; line-height: 1.65;
      color: ${textColor};
      -webkit-font-smoothing: antialiased;
    }
    a { color: ${primaryColor}; text-decoration: none; }

    /* ── Outer wrapper ────────────────────────────────────────────────────── */
    .email-wrapper { width: 100%; background-color: ${backgroundColor}; padding: 40px 16px; }
    .email-container { max-width: 600px; margin: 0 auto; }

    /* ── Logo header ─────────────────────────────────────────────────────── */
    .logo-header { text-align: center; padding-bottom: 24px; }
    .logo-img { max-height: 44px; width: auto; display: inline-block; }

    /* ── Severity banner (coloured top stripe) ───────────────────────────── */
    .severity-banner {
      border-radius: 10px 10px 0 0;
      padding: 12px 32px;
      font-size: 11px; font-weight: 700;
      letter-spacing: 1.5px; text-transform: uppercase;
      color: #fff;
    }
    .severity-info     { background: ${primaryColor}; }
    .severity-warning  { background: #E67E22; }
    .severity-critical { background: #C0392B; }
    .severity-severe   { background: #7B241C; }

    /* ── Main card ───────────────────────────────────────────────────────── */
    .content-card {
      background-color: ${cardColor};
      border-radius: 0 0 10px 10px;
      padding: 36px 40px 40px;
      border: 1px solid ${borderColor};
      border-top: none;
      box-shadow: 0 4px 24px rgba(31,107,46,0.08);
    }

    /* ── Heading ─────────────────────────────────────────────────────────── */
    .card-heading {
      font-size: 22px; font-weight: 700;
      color: ${primaryColor};
      margin: 0 0 20px;
      line-height: 1.3;
    }

    /* ── Body typography ─────────────────────────────────────────────────── */
    p { margin: 0 0 16px; color: ${textColor}; }
    strong { font-weight: 600; color: #0f1f12; }
    .muted { color: ${mutedText}; font-size: 13px; }

    /* ── Info table ──────────────────────────────────────────────────────── */
    .info-box {
      background: #F5FBF6;
      border: 1px solid ${borderColor};
      border-radius: 8px;
      padding: 8px 0;
      margin: 20px 0 24px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 20px;
      border-bottom: 1px solid #EBF3ED;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label {
      font-size: 12px; font-weight: 600;
      color: ${mutedText};
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .info-value { font-weight: 600; color: ${textColor}; font-size: 14px; }

    /* ── Batch health pill ───────────────────────────────────────────────── */
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 12px; font-weight: 600;
    }
    .badge-ok      { background: #E8F5E9; color: #1B5E20; }
    .badge-warn    { background: #FFF3E0; color: #E65100; }
    .badge-error   { background: #FFEBEE; color: #B71C1C; }

    /* ── Divider ─────────────────────────────────────────────────────────── */
    .divider { border: none; border-top: 1px solid ${borderColor}; margin: 24px 0; }

    /* ── CTA Button ──────────────────────────────────────────────────────── */
    .btn-container { text-align: center; margin: 32px 0 4px; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, ${primaryColor} 0%, #2E8B57 100%);
      color: #FFFFFF !important;
      padding: 14px 36px;
      border-radius: 50px;
      font-size: 15px; font-weight: 600;
      letter-spacing: 0.2px;
      text-decoration: none;
      box-shadow: 0 4px 16px rgba(31,107,46,0.28);
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .footer {
      text-align: center;
      padding-top: 28px;
      color: ${mutedText};
      font-size: 12px;
    }
    .footer-brand {
      font-size: 14px; font-weight: 700;
      color: ${primaryColor};
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 6px;
    }
    .footer a { color: ${mutedText}; margin: 0 8px; }
    .footer a:hover { color: ${primaryColor}; }
    .footer-divider { color: #ccc; }

    /* ── Responsive ─────────────────────────────────────────────────────── */
    @media only screen and (max-width: 620px) {
      .content-card { padding: 24px 20px 28px; }
      .card-heading { font-size: 19px; }
      .info-row { flex-direction: column; align-items: flex-start; gap: 2px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">

      <!-- Logo -->
      <div class="logo-header">
        <img src="${logoSrc}" alt="CraftedClimate" class="logo-img">
      </div>

      <!-- Main Card -->
      <div class="content-card">
        <h1 class="card-heading">${heading}</h1>

        <div class="email-body">
          ${bodyContent}
        </div>

        ${ctaText && ctaUrl ? `
        <div class="btn-container">
          <a href="${ctaUrl}" class="btn">${ctaText}</a>
        </div>
        ` : ''}
      </div>

      <!-- Footer -->
      <div class="footer">
        <span class="footer-brand">CraftedClimate</span>
        <p>Environmental Intelligence Platform</p>
        <p>
          <a href="{{appUrl}}/dashboard">Dashboard</a>
          <span class="footer-divider">&bull;</span>
          <a href="{{appUrl}}/support">Support</a>
          <span class="footer-divider">&bull;</span>
          <a href="{{appUrl}}/privacy">Privacy Policy</a>
        </p>
        <p style="color: #bbb; margin-top: 8px;">
          &copy; {{currentYear}} CraftedClimate. All rights reserved.<br>
          This is an automated system notification from your device network.
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
};

module.exports = { generateTemplateHtml };
