/**
 * VC Ecommerce Dashboard — Google Sheets → CSV proxy
 * ----------------------------------------------------
 * Deployed as a Web App (Deploy > New deployment > Web app).
 * Runs as the deploying account, so the Sheet itself can stay private/restricted —
 * only this script (and whoever holds the deployment URL) can read it.
 *
 * WHY THIS EXISTS
 * Reading the Sheet directly from the browser hits Google's export size limits and
 * CORS restrictions. This script reads the Sheet's cell VALUES server-side (no size
 * cap the way file-export/copy endpoints have) and streams them back as plain CSV.
 *
 * WHY DATES NEED SPECIAL HANDLING
 * Sheets stores "Order Create Date" as a real Date value, not text. When Apps Script
 * reads it with getValues(), each date cell comes back as a native JS Date object
 * (in the Sheet's own timezone). If you naively String()-convert that or let CSV
 * serialization default-stringify it, the output format depends on the Apps Script
 * runtime's default locale/timezone — which can silently drift (e.g. "Thu Aug 06
 * 2026 00:00:00 GMT+0700" one day, "8/6/2026" another) and break the dashboard's
 * parseDate(). This script explicitly formats every date column as a fixed
 * "DD/MM/YYYY HH:mm" string, in the Sheet's own timezone, before it ever becomes
 * CSV — so the dashboard always receives one predictable format.
 */

// ── Config ──────────────────────────────────────────────────────────────
const SHEET_ID = '1bYyHpuElzEqgacVLz6iDJ056XdpG_iPvH5YNLtToPto';
const SHEET_NAME = null; // null = first/active sheet. Set a name to pin a specific tab.

// Column headers (must match the sheet exactly) that hold date/datetime values
// and should be force-formatted to DD/MM/YYYY HH:mm before export.
const DATE_COLUMNS = ['Order Create Date'];

// Optional shared-secret check. Leave '' to disable (deployment access = "Anyone"
// is already a form of obscurity via the unguessable URL, but a token adds a
// second layer). If set, callers must pass ?token=<value>.
const REQUIRED_TOKEN = '';

// ── Web app entry point ─────────────────────────────────────────────────
function doGet(e) {
  try {
    if (REQUIRED_TOKEN) {
      const supplied = e && e.parameter && e.parameter.token;
      if (supplied !== REQUIRED_TOKEN) {
        return ContentService.createTextOutput('Forbidden: invalid or missing token')
          .setMimeType(ContentService.MimeType.TEXT);
      }
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
    if (!sheet) throw new Error('Sheet tab not found: ' + SHEET_NAME);

    const tz = ss.getSpreadsheetTimeZone();
    const values = sheet.getDataRange().getValues();
    if (values.length === 0) {
      return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.CSV);
    }

    const headers = values[0].map(String);
    const dateColIdx = new Set(
      DATE_COLUMNS.map((name) => headers.indexOf(name)).filter((i) => i >= 0)
    );

    const csv = values
      .map((row, rowIdx) =>
        row
          .map((cell, colIdx) => {
            const formatted =
              rowIdx > 0 && dateColIdx.has(colIdx) ? formatDateCell(cell, tz) : cell;
            return csvEscape(formatted);
          })
          .join(',')
      )
      .join('\r\n');

    return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
  } catch (err) {
    // Surface errors as plain text (not HTML) so the dashboard's fetch() doesn't
    // mistake an error page for CSV — see the "Got an HTML page instead of CSV"
    // check on the dashboard side.
    return ContentService.createTextOutput('ERROR: ' + err.message).setMimeType(
      ContentService.MimeType.TEXT
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

// Force a single, unambiguous, locale-independent format: DD/MM/YYYY HH:mm.
// Blank cells, non-Date values, and #N/A-ish placeholders pass through untouched
// so the dashboard's own blank/"-"/"#N/A" handling still applies.
function formatDateCell(cell, tz) {
  if (cell === '' || cell === null || cell === undefined) return cell;
  if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
    return Utilities.formatDate(cell, tz, 'dd/MM/yyyy HH:mm');
  }
  return cell; // already text (e.g. manually typed "-" or "#N/A") — leave as-is
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Run this once from the Apps Script editor (Run > testDateFormatting) after any
 * change to DATE_COLUMNS or the sheet's date column layout, to sanity-check that
 * dates are coming out in the expected DD/MM/YYYY HH:mm shape before deploying.
 */
function testDateFormatting() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  const tz = ss.getSpreadsheetTimeZone();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = headers.indexOf('Order Create Date');
  if (idx < 0) {
    Logger.log('Column "Order Create Date" not found. Headers seen: ' + headers.join(' | '));
    return;
  }
  for (let i = 1; i <= Math.min(5, values.length - 1); i++) {
    Logger.log(values[i][idx] + '  ->  ' + formatDateCell(values[i][idx], tz));
  }
}
