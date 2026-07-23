/**
 * CSV parser tests — NUL-37 test scaffolding.
 *
 * Scope: pure unit coverage of `parseCsv` and `toCsv` so the import dialog
 * and any other consumer can rely on the documented RFC-4180-ish behavior.
 * These tests intentionally avoid the Hono server / SQLite stack because
 * the parser is a pure function — they should run in milliseconds, not
 * seconds, and never need a temp data dir.
 *
 * Style matches the existing `src/server/__tests__/auth-and-tenant.test.ts`
 * (node:test, node:assert/strict) so `npm test` picks them up via the
 * existing glob that matches every `.test.ts` under `src/`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCsv, toCsv } from './csv'

// -----------------------------------------------------------------------------
// parseCsv
// -----------------------------------------------------------------------------

test('parseCsv: empty input returns empty result with no errors', () => {
  const out = parseCsv('')
  assert.deepEqual(out.headers, [])
  assert.deepEqual(out.rows, [])
  assert.deepEqual(out.errors, [])
})

test('parseCsv: plain header + rows without quoting', () => {
  const out = parseCsv('a,b,c\n1,2,3\n4,5,6\n')
  assert.deepEqual(out.headers, ['a', 'b', 'c'])
  assert.deepEqual(out.rows, [
    ['1', '2', '3'],
    ['4', '5', '6'],
  ])
  assert.deepEqual(out.errors, [])
})

test('parseCsv: trims whitespace from header cells', () => {
  const out = parseCsv('  name , age ,role\nAlice,30,admin\n')
  assert.deepEqual(out.headers, ['name', 'age', 'role'])
  assert.deepEqual(out.rows, [['Alice', '30', 'admin']])
})

test('parseCsv: quoted fields preserve embedded commas and newlines', () => {
  const input = 'a,b\n"hello, world","line1\nline2"\n'
  const out = parseCsv(input)
  assert.deepEqual(out.headers, ['a', 'b'])
  assert.deepEqual(out.rows, [['hello, world', 'line1\nline2']])
  assert.deepEqual(out.errors, [])
})

test('parseCsv: doubled quotes inside a quoted field decode as a single quote', () => {
  const out = parseCsv('a,b\n"she said ""hi""",ok\n')
  assert.deepEqual(out.rows, [['she said "hi"', 'ok']])
  assert.deepEqual(out.errors, [])
})

test('parseCsv: handles CRLF line endings', () => {
  const out = parseCsv('a,b\r\n1,2\r\n3,4\r\n')
  assert.deepEqual(out.headers, ['a', 'b'])
  assert.deepEqual(out.rows, [
    ['1', '2'],
    ['3', '4'],
  ])
})

test('parseCsv: trailing newline is tolerated; missing trailing newline is too', () => {
  const withNewline = parseCsv('a,b\n1,2\n')
  const withoutNewline = parseCsv('a,b\n1,2')
  assert.deepEqual(withNewline.rows, [['1', '2']])
  assert.deepEqual(withoutNewline.rows, [['1', '2']])
})

test('parseCsv: blank lines are silently dropped', () => {
  const out = parseCsv('a,b\n\n1,2\n\n3,4\n')
  assert.deepEqual(out.headers, ['a', 'b'])
  assert.deepEqual(out.rows, [
    ['1', '2'],
    ['3', '4'],
  ])
})

test('parseCsv: row with wrong field count produces an error but still parses', () => {
  const out = parseCsv('a,b,c\n1,2\n3,4,5,6\n')
  assert.deepEqual(out.headers, ['a', 'b', 'c'])
  assert.deepEqual(out.rows, [
    ['1', '2'],
    ['3', '4', '5', '6'],
  ])
  assert.equal(out.errors.length, 2)
  for (const e of out.errors) {
    assert.equal(typeof e.line, 'number')
    assert.match(e.message, /fields/i)
  }
})

test('parseCsv: reports the source line number on field-count errors', () => {
  const out = parseCsv('a,b,c\n1,2,3\n4,5\n6,7,8\n')
  // Header is line 1, "1,2,3" is line 2, "4,5" is line 3.
  assert.equal(out.errors.length, 1)
  assert.equal(out.errors[0]!.line, 3)
})

test('parseCsv: single column header-only input has zero data rows', () => {
  const out = parseCsv('only\n')
  assert.deepEqual(out.headers, ['only'])
  assert.deepEqual(out.rows, [])
})

test('parseCsv: header with no following data row returns empty rows', () => {
  const out = parseCsv('a,b,c')
  assert.deepEqual(out.headers, ['a', 'b', 'c'])
  assert.deepEqual(out.rows, [])
})

// -----------------------------------------------------------------------------
// toCsv
// -----------------------------------------------------------------------------

test('toCsv: round-trips simple ASCII data through parseCsv', () => {
  const headers = ['a', 'b', 'c']
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
  ]
  const csv = toCsv(headers, rows)
  const back = parseCsv(csv)
  assert.deepEqual(back.headers, headers)
  assert.deepEqual(back.rows, rows)
})

test('toCsv: quotes fields containing commas, newlines, or double quotes', () => {
  const csv = toCsv(['h'], [['has, comma'], ['has\nnewline'], ['has "quote"']])
  assert.match(csv, /"has, comma"/)
  assert.match(csv, /"has\nnewline"/)
  assert.match(csv, /"has ""quote"""/)
})

test('toCsv: leaves plain ASCII fields unquoted', () => {
  const csv = toCsv(['h'], [['plain']])
  assert.equal(csv, 'h\nplain')
})

test('toCsv: empty rows produce a header-only CSV', () => {
  const csv = toCsv(['a', 'b'], [])
  assert.equal(csv, 'a,b')
})

test('toCsv: round-trip preserves quoted fields with commas and quotes', () => {
  const rows = [
    ['plain', 'with, comma', 'with "quote"'],
    ['newline\nfield', 'mixed, "stuff"', 'ok'],
  ]
  const csv = toCsv(['c1', 'c2', 'c3'], rows)
  const back = parseCsv(csv)
  assert.deepEqual(back.headers, ['c1', 'c2', 'c3'])
  assert.deepEqual(back.rows, rows)
  assert.deepEqual(back.errors, [])
})