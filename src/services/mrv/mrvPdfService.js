'use strict';
/**
 * mrvPdfService.js — Crafted Climate MRV Monitoring Report PDF Generator
 *
 * Layout strategy:
 *   - Cover page is a full standalone page
 *   - All content sections flow CONTINUOUSLY onto as many pages as needed
 *   - ensureSpace(pts) adds a page only when < pts remain
 *   - Tables paginate by themselves (redraw header on overflow)
 *   - Footers are drawn just before every page break + at document end
 *   - Result: pages are 80–95% full, never empty
 */

const PDFDocument = require('pdfkit');
const https       = require('https');
const http        = require('http');
const { BlobServiceClient } = require('@azure/storage-blob');
const logger      = require('../../utils/logger');

// ─── Brand palette ────────────────────────────────────────────────────────────
const B = {
  green:       '#006838',
  greenDark:   '#004D27',
  greenSoft:   '#E8F5EE',
  greenBorder: '#A8D5B8',
  dark:        '#101828',
  darkMid:     '#344054',
  grey:        '#667085',
  greyLight:   '#D0D5DD',
  border:      '#EAECF0',
  white:       '#FFFFFF',
  bgLight:     '#F9FAFB',
  red:         '#D92D20',
  redSoft:     '#FEF3F2',
  amber:       '#B54708',
  amberSoft:   '#FFFAEB',
  blue:        '#1D4ED8',
};

// ─── Page constants ───────────────────────────────────────────────────────────
const PW   = 595.28;   // A4 width  pts
const PH   = 841.89;   // A4 height pts
const ML   = 48;       // margin left
const MR   = 48;       // margin right
const MT   = 68;       // content top (after header)
const MB   = 50;       // footer height reserved at bottom
const CW   = PW - ML - MR;   // 499.28 usable width
const FOOT = PH - MB;        // y where footer starts

// ─── Logo (fetched once from CDN, cached in memory) ───────────────────────────
let _logoBuf = null;
async function getLogoBuf() {
  if (_logoBuf) return _logoBuf;
  return new Promise((resolve) => {
    const url = process.env.EMAIL_LOGO_URL || 'https://console.craftedclimate.co/cc_logo_raw.png';
    const mod  = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { _logoBuf = Buffer.concat(chunks); resolve(_logoBuf); });
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}
function fmtNum(n, dp = 4) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(dp);
}
function trunc(s, n = 35) {
  if (!s) return '—';
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
function statusColor(s = '') {
  const m = {
    ACTIVE: B.green, ACCEPTED: B.green, OPEN: B.green, MONITORING: B.green,
    VALID: B.green, FINAL: B.green, SUBMITTED: B.greenDark, CALCULATION_COMPLETE: B.green,
    WARNING: B.amber, ACCEPTED_WITH_WARNING: B.amber,
    QUARANTINED: B.red, VOIDED: B.red, CLOSED: B.grey, DRAFT: B.blue,
  };
  return m[s] || B.grey;
}

// ─── Primitive drawing ────────────────────────────────────────────────────────
function fill(doc, x, y, w, h, c)   { doc.save().fillColor(c).rect(x, y, w, h).fill().restore(); }
function stroke(doc, x, y, w, h, c, lw = 0.5) { doc.save().strokeColor(c).lineWidth(lw).rect(x, y, w, h).stroke().restore(); }
function hline(doc, x, y, w, c = B.border, lw = 0.5) { doc.save().strokeColor(c).lineWidth(lw).moveTo(x, y).lineTo(x + w, y).stroke().restore(); }

// ─── Page header ─────────────────────────────────────────────────────────────
function drawHeader(doc, projectName) {
  fill(doc, 0, 0, PW, 5, B.green);
  if (_logoBuf) {
    try { doc.image(_logoBuf, ML, 12, { height: 20 }); } catch (_) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(B.green).text('CRAFTED CLIMATE', ML, 15, { lineBreak: false });
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(B.green).text('CRAFTED CLIMATE', ML, 15, { lineBreak: false });
  }
  doc.font('Helvetica').fontSize(7).fillColor(B.grey)
    .text(trunc(projectName || 'Monitoring Report', 60), 0, 16, { align: 'right', width: PW - MR, lineBreak: false });
  hline(doc, ML, 40, CW, B.border);
}

// ─── Page footer ─────────────────────────────────────────────────────────────
function drawFooter(doc, pageNum, reportId) {
  hline(doc, ML, FOOT, CW, B.border);
  doc.font('Helvetica').fontSize(6.5).fillColor(B.grey)
    .text(`Crafted Climate MRV Engine v1.0  |  Report: ${reportId || '—'}`,
      ML, FOOT + 6, { lineBreak: false });
  doc.text(`Page ${pageNum}`, 0, FOOT + 6, { align: 'right', width: PW - MR, lineBreak: false });
  fill(doc, 0, PH - 7, PW, 7, B.green);
}

// ─── Main generator ───────────────────────────────────────────────────────────
async function generatePdf(reportDoc) {
  const { sections = {}, reportId, sha256, reportVersion, generatedAt, generatedBy } = reportDoc;
  const hdr  = sections.header               || {};
  const devs = sections.deviceInventory       || [];
  const obs  = sections.observationSummary   || {};
  const gap  = sections.dataGapAnalysis       || {};
  const calc = sections.calculationResults    || {};
  const att  = sections.attachmentsManifest   || [];
  const comp = sections.completeness          || {};
  const cals = sections.calibrations          || [];

  await getLogoBuf();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MT, bottom: MB + 15, left: ML, right: MR },
      info: {
        Title:   `MRV Monitoring Report — ${hdr.projectName || ''}`,
        Author:  'Crafted Climate Platform',
        Creator: 'Crafted Climate MRV Engine v1.0',
        Keywords: 'carbon credits, MRV, monitoring, Verra, VM0050',
      },
      autoFirstPage: false,
    });

    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let pageNum = 0;

    // Draw footer on the current page (absolute positioning, saves/restores doc.y)
    function finishPage() {
      const savedY = doc.y;
      drawFooter(doc, pageNum, reportId);
      doc.y = savedY;
    }

    // Start a new page: finish current, add page, draw header, reset y
    function newPage() {
      if (pageNum > 0) finishPage();
      doc.addPage();
      pageNum++;
      drawHeader(doc, hdr.projectName);
      doc.y = MT;
    }

    // Ensure `needed` pts are available before drawing; add page if not
    function need(pts) {
      if (doc.y + pts > FOOT - 10) newPage();
    }

    // ── Inline helpers ────────────────────────────────────────────────────────

    function sectionBadge(num, title, sub) {
      need(sub ? 65 : 50);
      const y = doc.y;
      fill(doc, ML, y, 3, sub ? 28 : 20, B.green);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(B.dark)
        .text(title, ML + 10, y + 2, { width: CW - 10, lineBreak: false });
      doc.y = y + (sub ? 22 : 14);
      if (sub) {
        doc.font('Helvetica').fontSize(8).fillColor(B.grey)
          .text(sub, ML + 10, doc.y);
        doc.moveDown(0.3);
      }
      doc.moveDown(0.5);
      hline(doc, ML, doc.y, CW, B.border);
      doc.moveDown(0.7);
    }

    function divider() {
      need(20);
      doc.moveDown(0.6);
      hline(doc, ML, doc.y, CW, B.greenBorder, 0.8);
      doc.moveDown(0.8);
    }

    function kv(label, value) {
      need(14);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(B.grey)
        .text(label, ML, y, { width: 125, lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(B.dark)
        .text(String(value || '—'), ML + 130, y, { width: CW - 130, lineBreak: false });
      doc.moveDown(0.55);
    }

    function infoBox(rows, color = B.green, bgColor = B.greenSoft, borderColor = B.greenBorder) {
      const rowH = 16, pad = 10;
      const h = rows.length * rowH + pad * 2;
      need(h + 8);
      const y = doc.y;
      fill(doc, ML, y, CW, h, bgColor);
      stroke(doc, ML, y, CW, h, borderColor);
      fill(doc, ML, y, 3, h, color);
      rows.forEach(([k, v], i) => {
        const ry = y + pad + i * rowH;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(B.grey)
          .text(k, ML + 10, ry, { width: 150, lineBreak: false });
        doc.font('Helvetica').fontSize(7.5).fillColor(B.dark)
          .text(String(v || '—'), ML + 165, ry, { width: CW - 175, lineBreak: false });
      });
      doc.y = y + h + 8;
    }

    function bar(pct, label, color = B.green) {
      need(28);
      const y = doc.y;
      const filled = Math.min(Math.max(pct / 100, 0), 1) * CW;
      fill(doc, ML, y, CW, 13, B.border);
      fill(doc, ML, y, filled, 13, color);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(B.white)
        .text(`${pct.toFixed(1)}%`, ML + 5, y + 3, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(B.grey)
        .text(label, ML, y + 16, { lineBreak: false });
      doc.y = y + 28;
    }

    function metricRow(metrics) {
      need(75);
      const n   = metrics.length;
      const mw  = (CW - (n - 1) * 8) / n;
      const mh  = 64;
      const y   = doc.y;
      metrics.forEach((m, i) => {
        const x = ML + i * (mw + 8);
        stroke(doc, x, y, mw, mh, B.border, 0.7);
        fill(doc,   x, y, mw, 3,  m.color || B.green);
        doc.font('Helvetica').fontSize(7).fillColor(B.grey)
          .text(m.label, x + 8, y + 9, { width: mw - 16, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(17).fillColor(B.dark)
          .text(String(m.value ?? '—'), x + 8, y + 20, { width: mw - 16, lineBreak: false });
        if (m.unit) {
          doc.font('Helvetica').fontSize(6.5).fillColor(B.grey)
            .text(m.unit, x + 8, y + 44, { width: mw - 16, lineBreak: false });
        }
      });
      doc.y = y + mh + 10;
    }

    // ── Table with smart pagination ───────────────────────────────────────────
    function table(headers, rows, colWidths, opts = {}) {
      if (!rows.length) {
        need(18);
        doc.font('Helvetica').fontSize(8).fillColor(B.grey).text('No records to display.', ML, doc.y);
        doc.moveDown(0.8);
        return;
      }
      const ROW_H = opts.rowH    || 19;
      const HDR_H = opts.hdrH    || 21;
      const FS    = opts.fontSize || 7.5;
      const TW    = colWidths.reduce((a, b) => a + b, 0);

      function drawTableHeader(y) {
        fill(doc, ML, y, TW, HDR_H, B.green);
        let cx = ML;
        doc.font('Helvetica-Bold').fontSize(FS).fillColor(B.white);
        headers.forEach((h, i) => {
          doc.text(h, cx + 5, y + (HDR_H - FS) / 2 + 1, { width: colWidths[i] - 10, lineBreak: false });
          cx += colWidths[i];
        });
        return y + HDR_H;
      }

      need(HDR_H + ROW_H * 2);
      let y = drawTableHeader(doc.y);

      rows.forEach((row, ri) => {
        if (y + ROW_H > FOOT - 8) {
          doc.y = y;
          newPage();
          y = drawTableHeader(doc.y);
        }
        if (ri % 2 === 0) fill(doc, ML, y, TW, ROW_H, B.bgLight);
        stroke(doc, ML, y, TW, ROW_H, B.border, 0.25);

        doc.font('Helvetica').fontSize(FS).fillColor(B.darkMid);
        let cx = ML;
        row.forEach((cell, ci) => {
          const str = cell == null ? '—' : String(cell);
          if (opts.statusCol === ci) {
            doc.save().font('Helvetica-Bold').fontSize(FS - 0.5).fillColor(statusColor(str))
              .text(str, cx + 5, y + (ROW_H - FS) / 2 + 1, { width: colWidths[ci] - 10, lineBreak: false })
              .restore();
          } else {
            doc.text(trunc(str, Math.floor(colWidths[ci] / 4.2)),
              cx + 5, y + (ROW_H - FS) / 2 + 1, { width: colWidths[ci] - 10, lineBreak: false });
          }
          cx += colWidths[ci];
        });
        y += ROW_H;
      });
      doc.y = y + 8;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER PAGE (full standalone page)
    // ═══════════════════════════════════════════════════════════════════════════
    newPage();
    fill(doc, 0, 0, PW, 8, B.green);  // thicker top stripe

    // Logo centred
    const logoY = 65;
    if (_logoBuf) {
      try { doc.image(_logoBuf, (PW - 190) / 2, logoY, { width: 190 }); }
      catch (_) {
        doc.font('Helvetica-Bold').fontSize(24).fillColor(B.green)
          .text('CRAFTED CLIMATE', 0, logoY + 8, { align: 'center', width: PW });
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(24).fillColor(B.green)
        .text('CRAFTED CLIMATE', 0, logoY + 8, { align: 'center', width: PW });
    }
    doc.font('Helvetica').fontSize(9).fillColor(B.grey)
      .text('Connected environmental intelligence', 0, logoY + 70, { align: 'center', width: PW });

    // Divider & report type
    hline(doc, ML, logoY + 90, CW, B.green, 1.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(B.green)
      .text('M O N I T O R I N G   R E P O R T', 0, logoY + 100, { align: 'center', width: PW, characterSpacing: 1.5 });

    // Project title
    doc.font('Helvetica-Bold').fontSize(22).fillColor(B.dark)
      .text(hdr.projectName || 'Monitoring Report', 0, logoY + 120, { align: 'center', width: PW });

    // Period dates
    const periodStr = `${fmtDate(hdr.periodStart)}  →  ${fmtDate(hdr.periodEnd)}`;
    doc.font('Helvetica').fontSize(11).fillColor(B.darkMid)
      .text(periodStr, 0, logoY + 158, { align: 'center', width: PW });

    // Status pill
    const statusStr  = hdr.periodStatus || '—';
    const statusCol2 = statusColor(statusStr);
    const pillW = doc.widthOfString(statusStr, { size: 8 }) + 20;
    const pillX = (PW - pillW) / 2;
    fill(doc, pillX, logoY + 180, pillW, 18, statusCol2);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(B.white)
      .text(statusStr, pillX + 10, logoY + 184, { lineBreak: false });

    // Meta info block
    const metaY = logoY + 214;
    fill(doc, ML, metaY, CW, 96, B.bgLight);
    stroke(doc, ML, metaY, CW, 96, B.border);
    fill(doc, ML, metaY, 3, 96, B.green);
    const col1x = ML + 18, col2x = ML + CW / 2 + 10;
    const lh = 20;
    [
      ['Methodology', hdr.methodology || 'VM0050'],
      ['Standard',    hdr.standard    || 'Verra VCS v5.0'],
      ['Organisation', hdr.organizationId || '—'],
    ].forEach(([k, v], i) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(B.grey).text(k, col1x, metaY + 10 + i * lh, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(B.dark).text(trunc(v, 28), col1x + 85, metaY + 10 + i * lh, { lineBreak: false });
    });
    [
      ['Report ID', reportId || '—'],
      ['Version',   `v${reportVersion || 1}`],
      ['Project ID', hdr.projectId || '—'],
    ].forEach(([k, v], i) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(B.grey).text(k, col2x, metaY + 10 + i * lh, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(B.dark).text(trunc(v, 28), col2x + 70, metaY + 10 + i * lh, { lineBreak: false });
    });

    // SHA256 block
    const intY = metaY + 115;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(B.grey).text('SHA-256 INTEGRITY HASH', ML, intY);
    doc.font('Courier').fontSize(6.5).fillColor(B.grey).text(sha256 || 'Not computed', ML, intY + 12, { width: CW });

    // Generated at
    doc.font('Helvetica').fontSize(7.5).fillColor(B.grey)
      .text(`Generated: ${fmtDate(generatedAt || new Date())}  •  Crafted Climate MRV Engine v1.0`,
        0, PH - 95, { align: 'center', width: PW });

    finishPage();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTENT PAGES — flowing, continuous layout
    // ═══════════════════════════════════════════════════════════════════════════
    newPage();

    // ── 1. EXECUTIVE SUMMARY ─────────────────────────────────────────────────
    sectionBadge(1, 'Executive Summary',
      `${hdr.projectName || '—'}  |  ${hdr.methodology || 'VM0050'}  |  ${fmtDate(hdr.periodStart)} → ${fmtDate(hdr.periodEnd)}`);

    const total     = obs.total || 0;
    const accepted  = obs.accepted || 0;
    const ar        = parseFloat(obs.acceptanceRate) || (total > 0 ? (accepted / total * 100) : 0);
    const coverage  = parseFloat(gap.coveragePercent) || 0;
    const calcStr   = calc.status === 'NOT_CALCULATED' ? 'Pending sign-off'
      : `${fmtNum(calc.netEmissionReduction_er_tco2e, 4)} tCO2e`;

    metricRow([
      { label: 'Total Observations',  value: total.toLocaleString(),      unit: 'readings collected',     color: B.green },
      { label: 'Acceptance Rate',     value: obs.acceptanceRate || '—',   unit: 'of total readings',      color: ar < 85 ? B.amber : B.green },
      { label: 'Data Coverage',       value: gap.coveragePercent || '—',  unit: 'monitoring period',      color: coverage < 80 ? B.amber : B.green },
      { label: 'Net Emission Reduction', value: calcStr,                  unit: 'tCO2e (VM0050)',         color: B.green },
    ]);

    infoBox([
      ['Project ID',         hdr.projectId || '—'],
      ['Monitoring Period',  hdr.monitoringPeriodId || '—'],
      ['Period Start',       fmtDate(hdr.periodStart)],
      ['Period End',         fmtDate(hdr.periodEnd)],
      ['Period Status',      hdr.periodStatus || '—'],
      ['Active Devices',     devs.length],
      ['Overall Completeness', comp.completenessPercent != null ? `${Number(comp.completenessPercent).toFixed(1)}%` : '—'],
      ['Methodology',        hdr.methodology || 'VM0050 v1.0'],
      ['Standard',           hdr.standard || 'Verra VCS v5.0'],
      ['Report Version',     `v${reportVersion || 1}`],
    ]);

    // ── 2. SENSOR INSTALLATIONS ──────────────────────────────────────────────
    divider();
    sectionBadge(2, 'Sensor Installations',
      `${devs.length} device${devs.length !== 1 ? 's' : ''} registered for this monitoring period`);

    table(
      ['Device ID (AUID)', 'Model', 'Installed', 'Last Calibrated', 'Next Cal Due', 'Status'],
      devs.map(d => [d.auid, d.model, fmtDate(d.installedAt), fmtDate(d.lastCalibration), fmtDate(d.nextCalibrationDue), d.status]),
      [100, 70, 72, 85, 88, 84],
      { statusCol: 5 }
    );

    // Per-device completeness
    if (comp.perDevice && comp.perDevice.length > 0) {
      need(30);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(B.dark).text('Per-Device Completeness', ML, doc.y);
      doc.moveDown(0.4);
      table(
        ['Device ID', 'Expected Readings', 'Received', 'Completeness %'],
        comp.perDevice.map(d => [
          d.auid,
          d.expectedCount ?? '—',
          d.receivedCount ?? '—',
          d.completenessPercent != null ? `${Number(d.completenessPercent).toFixed(1)}%` : '—',
        ]),
        [140, 115, 110, 134],
        { rowH: 18 }
      );
    }

    // ── 3. DATA QUALITY & OBSERVATIONS ───────────────────────────────────────
    divider();
    sectionBadge(3, 'Data Quality & Observations',
      `Acceptance rate: ${obs.acceptanceRate || '—'}  |  Total: ${total.toLocaleString()} readings`);

    const safe = (n) => n || 0;
    table(
      ['Category', 'Count', 'Share of Total'],
      [
        ['Total observations collected',  total,                      '100%'],
        ['Accepted',                      safe(obs.accepted),         `${(safe(obs.accepted) / (total || 1) * 100).toFixed(1)}%`],
        ['Accepted with warning',         safe(obs.acceptedWithWarning), `${(safe(obs.acceptedWithWarning) / (total || 1) * 100).toFixed(1)}%`],
        ['Manually approved',             safe(obs.manuallyApproved), `${(safe(obs.manuallyApproved) / (total || 1) * 100).toFixed(1)}%`],
        ['Quarantined',                   safe(obs.quarantined),      `${(safe(obs.quarantined) / (total || 1) * 100).toFixed(1)}%`],
        ['Voided',                        safe(obs.voided),           `${(safe(obs.voided) / (total || 1) * 100).toFixed(1)}%`],
      ],
      [260, 110, 129],
      { rowH: 18 }
    );

    bar(ar, 'Acceptance Rate', ar < 70 ? B.red : ar < 85 ? B.amber : B.green);

    // Quarantine list
    if (obs.quarantinedObservations && obs.quarantinedObservations.length > 0) {
      need(28);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(B.red).text('Quarantined Observations', ML, doc.y);
      doc.moveDown(0.4);
      table(
        ['Observation ID', 'Device', 'Observed At', 'Reason'],
        obs.quarantinedObservations.slice(0, 50).map(o => [o.observationId, o.auid, fmtDate(o.observedAt), o.flagReason]),
        [135, 80, 90, 194],
        { rowH: 17 }
      );
      if (obs.quarantinedObservations.length > 50) {
        doc.font('Helvetica').fontSize(7).fillColor(B.grey)
          .text(`+ ${obs.quarantinedObservations.length - 50} more — see platform dashboard`, ML, doc.y);
        doc.moveDown(0.6);
      }
    }

    // ── 4. DATA COVERAGE & GAP ANALYSIS ──────────────────────────────────────
    divider();
    sectionBadge(4, 'Data Coverage & Gap Analysis',
      gap.coveragePercent
        ? `${gap.coveragePercent} coverage — ${gap.totalPeriodDays} day period`
        : 'Coverage analysis');

    infoBox([
      ['Total period days',  gap.totalPeriodDays ?? '—'],
      ['Days with data',     gap.daysWithData    ?? '—'],
      ['Gap days',           gap.gapDays         ?? '—'],
      ['Coverage',           gap.coveragePercent || '—'],
    ], coverage < 80 ? B.amber : B.green, coverage < 80 ? B.amberSoft : B.greenSoft, B.greenBorder);

    bar(coverage, 'Period Data Coverage', coverage < 70 ? B.red : coverage < 85 ? B.amber : B.green);

    if (gap.gaps && gap.gaps.length > 0) {
      need(26);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(B.amber)
        .text(`Gap Dates — ${gap.gaps.length} day${gap.gaps.length !== 1 ? 's' : ''} with no data`, ML, doc.y);
      doc.moveDown(0.4);

      const dateW = 78, dateH = 15, perRow = Math.floor(CW / dateW);
      let startY = doc.y;
      gap.gaps.slice(0, 70).forEach((d, i) => {
        need(dateH + 4);
        if (i === 0) startY = doc.y;
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const gx  = ML + col * dateW;
        const gy  = startY + row * dateH;
        fill(doc,   gx, gy, dateW - 3, dateH - 2, B.redSoft);
        stroke(doc, gx, gy, dateW - 3, dateH - 2, '#FECDCA', 0.4);
        doc.font('Courier').fontSize(6.5).fillColor(B.red)
          .text(String(d).slice(0, 10), gx + 4, gy + 4, { lineBreak: false });
      });
      const rows = Math.ceil(Math.min(gap.gaps.length, 70) / perRow);
      doc.y = startY + rows * dateH + 8;
      if (gap.gaps.length > 70) {
        doc.font('Helvetica').fontSize(7).fillColor(B.grey)
          .text(`… and ${gap.gaps.length - 70} more gap dates`, ML, doc.y);
        doc.moveDown(0.6);
      }
    } else if (!gap.gaps || gap.gaps.length === 0) {
      need(22);
      fill(doc, ML, doc.y, CW, 22, B.greenSoft);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(B.green)
        .text('No data gaps detected — full period coverage achieved.', ML + 10, doc.y + 7);
      doc.y += 30;
    }

    // ── 5. CALIBRATION RECORDS ────────────────────────────────────────────────
    divider();
    sectionBadge(5, 'Calibration Records',
      `${cals.length} calibration record${cals.length !== 1 ? 's' : ''}`);

    table(
      ['Device', 'Channel', 'Calibrated', 'Valid From', 'Valid To', 'Accuracy', 'Status'],
      cals.map(c => [c.auid, c.channel, fmtDate(c.calibratedAt), fmtDate(c.validFrom), fmtDate(c.validTo), c.accuracyClass, c.status]),
      [80, 52, 68, 68, 68, 65, 98],
      { statusCol: 6, rowH: 18 }
    );

    const withLab = cals.filter(c => c.laboratory);
    if (withLab.length > 0) {
      need(26);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(B.dark).text('Laboratory Details', ML, doc.y);
      doc.moveDown(0.4);
      withLab.forEach(c => kv(c.auid, `${c.laboratory}${c.traceabilityStandard ? ' | ' + c.traceabilityStandard : ''}`));
    }

    // ── 6. EMISSION CALCULATIONS ──────────────────────────────────────────────
    divider();
    sectionBadge(6, 'Emission Calculations',
      `${calc.methodology || 'VM0050'}  |  ${calc.baselineTier || 'Baseline Tier 1'}`);

    if (calc.status === 'NOT_CALCULATED') {
      need(80);
      const ncy = doc.y;
      fill(doc,   ML, ncy, CW, 72, B.amberSoft);
      stroke(doc, ML, ncy, CW, 72, '#FEC84B', 0.8);
      fill(doc,   ML, ncy, 3,  72, B.amber);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(B.amber)
        .text('Emission Calculations Pending', ML + 12, ncy + 10, { width: CW - 24, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(B.darkMid)
        .text(
          'VM0050 v1.0 implementation is in development. Carbon credit calculations will be ' +
          'unlocked after all 10 methodology sign-off conditions are satisfied and approved by an administrator.',
          ML + 12, ncy + 26, { width: CW - 24 }
        );
      doc.y = ncy + 80;
    } else {
      infoBox([
        ['Methodology',             calc.methodology || 'VM0050'],
        ['Baseline Tier',           calc.baselineTier || '—'],
        ['Calculation Run ID',      calc.calculationRunId || '—'],
        ['Observation Count',       calc.observationCount || '—'],
        ['Calculated At',           fmtDate(calc.calculatedAt)],
        ['Approved By',             calc.approvedBy || 'Pending'],
      ]);

      need(100);
      const ry = doc.y;
      fill(doc,   ML, ry, CW, 90, B.greenSoft);
      stroke(doc, ML, ry, CW, 90, B.greenBorder);
      fill(doc,   ML, ry, 3,  90, B.green);
      [
        ['Total LPG Consumed',           `${fmtNum(calc.totalLpgConsumedKg, 2)} kg`],
        ['Baseline Emissions (BE)',       `${fmtNum(calc.baselineEmissions_be_tco2e, 4)} tCO2e`],
        ['Project Emissions (PE)',        `${fmtNum(calc.projectEmissions_pe_tco2e, 4)} tCO2e`],
        ['Leakage (LK)',                  `${fmtNum(calc.leakage_lk_tco2e, 4)} tCO2e`],
      ].forEach(([k, v], i) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(B.grey)
          .text(k, ML + 12, ry + 10 + i * 16, { lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(B.dark)
          .text(v, ML + 220, ry + 10 + i * 16, { lineBreak: false });
      });
      hline(doc, ML + 12, ry + 72, CW - 24, B.greenBorder);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(B.green)
        .text('Net Emission Reduction:', ML + 12, ry + 76, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(12).fillColor(B.greenDark)
        .text(`${fmtNum(calc.netEmissionReduction_er_tco2e, 4)} tCO2e`, ML + 220, ry + 76, { lineBreak: false });
      doc.y = ry + 98;
    }

    // ── 7. SUPPORTING EVIDENCE ────────────────────────────────────────────────
    divider();
    sectionBadge(7, 'Supporting Evidence',
      `${att.length} file${att.length !== 1 ? 's' : ''} uploaded`);

    table(
      ['Filename', 'Type', 'Uploaded By', 'Date', 'SHA-256 (first 16)'],
      att.map(a => [a.filename || a.title, a.type, a.uploadedBy, fmtDate(a.uploadedAt), (a.sha256 || '—').slice(0, 16)]),
      [155, 80, 75, 74, 115],
      { rowH: 18 }
    );

    // ── 8. INTEGRITY & AUDIT TRAIL ────────────────────────────────────────────
    divider();
    sectionBadge(8, 'Integrity & Audit Trail');

    infoBox([
      ['Report ID',          reportId || '—'],
      ['Report Version',     `v${reportVersion || 1}`],
      ['SHA-256 Hash',       sha256 ? sha256.slice(0, 32) + '…' : 'Not computed'],
      ['Generated At',       fmtDate(generatedAt || new Date())],
      ['Generated By',       generatedBy || 'Crafted Climate Platform'],
      ['Standard',           hdr.standard || 'Verra VCS v5.0'],
      ['Methodology',        hdr.methodology || 'VM0050 v1.0'],
      ['Platform',           'Crafted Climate MRV Engine v1.0'],
    ]);

    // Full SHA256
    need(30);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(B.grey).text('FULL SHA-256 HASH', ML, doc.y);
    doc.moveDown(0.2);
    doc.font('Courier').fontSize(7).fillColor(B.dark)
      .text(sha256 || 'Not computed', ML, doc.y, { width: CW });
    doc.moveDown(1.2);

    // Disclaimer
    need(62);
    const dy = doc.y;
    fill(doc,   ML, dy, CW, 58, B.bgLight);
    stroke(doc, ML, dy, CW, 58, B.border);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(B.dark).text('Legal Disclaimer', ML + 10, dy + 8);
    doc.font('Helvetica').fontSize(6.5).fillColor(B.grey).text(
      'This report has been automatically generated by the Crafted Climate MRV Engine based on sensor telemetry collected during the ' +
      'monitoring period. Accuracy is contingent on sensor calibration, reading quality, and monitoring completeness. This document ' +
      'does not constitute a verified carbon credit certificate. Formal verification must be completed by an accredited VVB in ' +
      'accordance with the applicable Verra standard.',
      ML + 10, dy + 20, { width: CW - 20 }
    );
    doc.y = dy + 65;

    // Closing line
    need(22);
    hline(doc, ML, doc.y, CW, B.green, 1.5);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8).fillColor(B.grey)
      .text(`${new URL(process.env.WEBSITE_URL || 'https://console.craftedclimate.co').hostname}  |  Connected environmental intelligence`, 0, doc.y, { align: 'center', width: PW });

    // Finish final page
    finishPage();
    doc.end();
  });
}

// ─── Azure Blob upload (non-blocking) ─────────────────────────────────────────
async function uploadPdfToBlob(buffer, blobName) {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    logger.warn('[MRVPdf] AZURE_STORAGE_CONNECTION_STRING not set — skipping blob upload');
    return null;
  }
  try {
    const client    = BlobServiceClient.fromConnectionString(connStr);
    const container = client.getContainerClient('mrv-reports');
    const blockBlob = container.getBlockBlobClient(blobName);
    await blockBlob.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType:        'application/pdf',
        blobContentDisposition: `inline; filename="${require('path').basename(blobName)}"`,
      },
    });
    return blockBlob.url;
  } catch (e) {
    logger.error(`[MRVPdf] Azure upload failed: ${e.message}`);
    return null;
  }
}

module.exports = { generatePdf, uploadPdfToBlob };
