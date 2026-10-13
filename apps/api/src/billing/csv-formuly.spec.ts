import { csvEscape } from './invoices.service.js';
import { csvRow } from '../common/audit/audit.admin.controller.js';
import { rowsToCsv } from './csv.util.js';

/**
 * Audyt bezpieczeństwa 13.10: eksport faktur operatora (separator „;”) i eksport dziennika audytu miały
 * własne escapery bez neutralizacji formuł — imię/firma klienta „=HYPERLINK(…)” wykonywała się w arkuszu.
 */
describe('CSV — neutralizacja formuł we wszystkich eksportach', () => {
  const FORMULY = ['=HYPERLINK("https://zly.example","x")', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx'];

  it('eksport faktur: tekst z formułą dostaje apostrof, liczby zostają liczbami', () => {
    for (const f of FORMULY) expect(csvEscape(f).replace(/^"/, '')).toMatch(/^'/);
    expect(csvEscape(-45)).toBe('-45');
    expect(csvEscape('-45.00')).toBe('-45.00');
    expect(csvEscape('-45,00')).toBe('-45,00');
    expect(csvEscape('Jan Kowalski')).toBe('Jan Kowalski');
  });

  it('eksport dziennika audytu: to samo', () => {
    expect(csvRow(['=1+1', 'ok', -3])).toBe("'=1+1,ok,-3\n");
  });

  it('wspólny serializer: polska liczba „-45,00” zostaje liczbą (w cudzysłowie przez przecinek)', () => {
    expect(rowsToCsv([{ v: '-45,00' }], [{ header: 'v', value: (r) => r.v }])).toBe('﻿v\r\n"-45,00"\r\n');
  });
});
