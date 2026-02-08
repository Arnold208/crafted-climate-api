/**
 * CrowdSense / CraftedClimate Professional Email Template
 * Visual Identity: Organic Green (#35752D), Oswald (Headers), Poppins (Body)
 * Layout: Card-based, Centered, Responsive.
 * Strict No-Emoji Policy.
 */

const primaryColor = '#35752D'; // Organic Green
const secondaryColor = '#FFFFFF'; // White
const backgroundColor = '#F4F6F8'; // Light Grey/Blue Background
const textColor = '#333333'; // Dark Grey Text
const lightBorderColor = '#E0E0E0'; // Subtle border
const headingFont = "'Oswald', sans-serif";
const bodyFont = "'Poppins', sans-serif";
// Use Content-ID (CID) for reliable embedding in Nodemailer
const logoSrc = 'cid:cc_logo';

/**
 * Generates the full HTML email with the new "Card" design.
 * @param {string} heading - The main headline (e.g. "Device Offline Alert")
 * @param {string} bodyContent - The main text content (HTML allowed)
 * @param {string} [ctaText] - Optional button text
 * @param {string} [ctaUrl] - Optional button URL
 * @returns {string} Full HTML string
 */
const generateTemplateHtml = (heading, bodyContent, ctaText, ctaUrl) => {
  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>${heading}</title>
    <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
      /* Reset & Base */
      body {
        background-color: ${backgroundColor};
        font-family: ${bodyFont};
        font-size: 15px;
        line-height: 1.6;
        color: ${textColor};
        margin: 0;
        padding: 0;
        -webkit-font-smoothing: antialiased;
      }
      
      /* Layout Container */
      .email-wrapper {
        width: 100%;
        background-color: ${backgroundColor};
        padding: 40px 0;
      }
      
      .email-container {
        max-width: 600px;
        margin: 0 auto;
        border-radius: 8px;
        overflow: hidden;
      }

      /* Logo Header */
      .logo-header {
        text-align: center;
        padding-bottom: 20px;
      }
      .logo-img {
        max-height: 50px;
        height: auto;
        /* Fallback if image fails */
        font-family: ${headingFont};
        font-weight: 700;
        color: ${primaryColor};
        font-size: 24px;
        text-decoration: none;
      }

      /* Main Card */
      .content-card {
        background-color: ${secondaryColor};
        padding: 40px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        border: 1px solid ${lightBorderColor};
      }

      /* Typography */
      h1 {
        font-family: ${headingFont};
        color: ${primaryColor};
        font-size: 24px;
        font-weight: 600;
        margin-top: 0;
        margin-bottom: 20px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 2px solid ${primaryColor};
        padding-bottom: 10px;
        display: inline-block;
      }
      
      p {
        margin-bottom: 16px;
      }
      
      strong {
        font-weight: 600;
        color: #1a1a1a;
      }

      /* Data Table / Info Box */
      .info-box {
        background-color: #FAFAFA;
        border: 1px solid ${lightBorderColor};
        border-radius: 4px;
        padding: 15px;
        margin: 20px 0;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #EEEEEE;
      }
      .info-row:last-child {
        border-bottom: none;
      }
      .info-label {
        font-weight: 500;
        color: #666;
        font-size: 13px;
        text-transform: uppercase;
      }
      .info-value {
        font-weight: 600;
        color: #333;
      }

      /* CTA Button */
      .btn-container {
        text-align: center;
        margin: 35px 0 10px 0;
      }
      .btn {
        background-color: ${primaryColor};
        color: #FFFFFF !important;
        padding: 14px 32px;
        text-decoration: none;
        border-radius: 4px;
        font-weight: 500;
        font-size: 15px;
        display: inline-block;
        transition: background-color 0.2s;
        box-shadow: 0 2px 5px rgba(53, 117, 45, 0.2);
      }
      .btn:hover {
        background-color: #2b5e24; /* Darker shade */
      }

      /* Footer */
      .footer {
        text-align: center;
        padding-top: 25px;
        color: #888888;
        font-size: 12px;
      }
      .footer a {
        color: ${primaryColor};
        text-decoration: none;
        margin: 0 5px;
      }
      .footer-logo-text {
        font-family: ${headingFont};
        font-weight: 700;
        color: #666;
        font-size: 16px;
        display: block;
        margin-bottom: 8px;
        letter-spacing: 1px;
      }

      /* Responsive */
      @media only screen and (max-width: 620px) {
        .email-container {
          width: 100% !important;
          border-radius: 0;
        }
        .content-card {
          padding: 25px;
          border-radius: 0;
          border-left: none;
          border-right: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-container">
        
        <!-- Logo Header -->
        <div class="logo-header">
           <img src="${logoSrc}" alt="Crafted Climate" class="logo-img">
        </div>

        <!-- Main Card -->
        <div class="content-card">
          <h1>${heading}</h1>
          
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
          <span class="footer-logo-text">CROWDSENSE</span>
          <p>
            Environmental Intelligence Hub<br>
            Crafted Climate Inc. &bull; Future Energy Lab
          </p>
          <p>
            <a href="#">Support</a> &bull; <a href="#">Dashboard</a> &bull; <a href="#">Privacy</a>
          </p>
          <p style="color: #aaa; margin-top: 10px;">
            This corresponds to a system alert from your device network.
          </p>
        </div>

      </div>
    </div>
  </body>
</html>
  `;
};

module.exports = { generateTemplateHtml };
