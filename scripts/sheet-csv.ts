/** CSV helpers shared by the admissions-sheet import scripts. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** dd-mm-yyyy or dd/mm/yyyy -> UTC date, or null. */
export function parseDate(v: string | null | undefined): Date | null {
  const m = clean(v ?? "").match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[1]) ? null : d;
}

/** Reads a CSV with a header row into objects keyed by the trimmed, upper-cased header. */
export function readTable(text: string): Array<Record<string, string>> {
  const [header, ...body] = parseCsv(text);
  const keys = header.map((h) => clean(h).toUpperCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, clean(r[i])])));
}
