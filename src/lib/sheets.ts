// Spreadsheet and CSV downloads. ExcelJS (maintained, MIT) loads only when someone exports.
import { saveFile } from "./store"

export type Cell = string | number | null | undefined
export type Row = Record<string, Cell>
export type Sheet = { name: string; rows?: Row[]; lines?: Cell[][] }

/** Column headings in first-seen order across all rows. */
function headings(rows: Row[]) {
  const seen: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.includes(k)) seen.push(k)
  return seen
}

/** Build an .xlsx file from sheets of rows (headed columns) or plain lines, and download it. */
export async function downloadWorkbook(filename: string, sheets: Sheet[]) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  wb.creator = "KASA.Rx"
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31))
    if (s.rows) {
      const cols = headings(s.rows)
      ws.columns = cols.map((h) => ({
        header: h, key: h,
        width: Math.min(60, Math.max(10, h.length + 2, ...s.rows!.map((r) => String(r[h] ?? "").length + 2))),
      }))
      ws.addRows(s.rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""]))))
      ws.getRow(1).font = { bold: true }
      ws.views = [{ state: "frozen", ySplit: 1 }]
    } else if (s.lines) {
      for (const l of s.lines) ws.addRow(l.map((c) => c ?? ""))
      ws.getColumn(1).width = 100
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  saveFile(filename, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
}

/** One CSV cell: quoted when needed; text that a spreadsheet would run as a formula is made safe. */
function csvCell(v: Cell) {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return String(v)
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
/** Rows to CSV text, with a heading line. */
export function toCsv(rows: Row[]) {
  const cols = headings(rows)
  return [cols.map(csvCell).join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n")
}
