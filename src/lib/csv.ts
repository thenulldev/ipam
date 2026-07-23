// Minimal CSV parser. RFC-4180-ish: quoted fields, escaped quotes via "".

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  errors: { line: number; message: string }[]
}

export function parseCsv(input: string): ParsedCsv {
  const errors: { line: number; message: string }[] = []
  const records: { cells: string[]; line: number }[] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0
  let line = 1
  while (i < input.length) {
    const c = input[i]!
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += c
      if (c === '\n') line += 1
      i += 1
      continue
    }
    if (c === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (c === '\n' || c === '\r') {
      // Handle \r\n: skip the \n if previous was \r
      row.push(field)
      field = ''
      if (!(row.length === 1 && row[0] === '')) {
        records.push({ cells: row, line })
      }
      row = []
      if (c === '\n') line += 1
      i += 1
      continue
    }
    field += c
    i += 1
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (!(row.length === 1 && row[0] === '')) {
      records.push({ cells: row, line })
    }
  }

  if (records.length === 0) {
    return { headers: [], rows: [], errors }
  }
  const headers = records[0]!.cells.map((h) => h.trim())
  const rows = records.slice(1).map((r) => {
    if (r.cells.length !== headers.length) {
      errors.push({
        line: r.line,
        message: `Expected ${headers.length} fields, got ${r.cells.length}`,
      })
    }
    return r.cells
  })
  return { headers, rows, errors }
}

/** Build a CSV string from a header list and rows. */
export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) lines.push(r.map(esc).join(','))
  return lines.join('\n')
}
