import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInList } from './fake-games-rest';

// O que o PostgREST v12.2.3 leu de cada lista `in.(…)`, medido num PostgREST de verdade
// com uma linha para cada título; null é o PGRST100 de lista que não fecha.
const POSTGREST_READS: Array<[string, string[] | null]> = [
  ['()', []],
  ['("")', []],
  ['( )', []],
  ['( "")', []],
  ['(" ")', [' ']],
  ['(,)', ['', '']],
  ['("",Hades)', ['', 'Hades']],
  ['("",)', ['', '']],
  ['( Hades)', ['Hades']],
  ['(\tHades)', ['Hades']],
  ['(\nHades)', ['\nHades']],
  ['( Hades )', ['Hades ']],
  ['(Hades, Doom)', ['Hades', ' Doom']],
  ['( "Hades",Doom)', ['Hades', 'Doom']],
  ['(  "Hades"  )', ['"Hades"  ']],
  ['(" Hades ")', [' Hades ']],
  ['("Doom (1993)")', ['Doom (1993)']],
  ['("Back\\\\slash (Edition)")', ['Back\\slash (Edition)']],
  ['("Hades"x,Doom)', ['"Hades"x', 'Doom']],
  ['(Hades)x', ['Hades']],
  ['(Hades', null],
  ['("Hades', null],
];

test('the fake reads every in-list the way PostgREST v12 read it', () => {
  for (const [list, read] of POSTGREST_READS) assert.deepEqual(parseInList(list), read, JSON.stringify(list));
});
