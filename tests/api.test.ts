import assert from 'node:assert/strict';
import test from 'node:test';
import { Converter } from 'opencc-js';
import jmnedictPlaceReadings from '../data/japanese-reading/jmnedict-place-readings.json';
import { getCombinationCandidateGroups } from '../lib/japanese-reading/combine';
import { createApiResponse } from '../server/convert';
import { toJapaneseForm } from '../lib/japanese-reading/lookup';
import type { CharacterReadingResult, ReadingCombinationCandidate, ReadingType } from '../lib/japanese-reading/types';

type ApiBody = {
  exactDictionaryCandidates: ReadingCombinationCandidate[];
  normalizedDictionaryCandidates: ReadingCombinationCandidate[];
  directCandidates: ReadingCombinationCandidate[];
  rendakuCandidates: ReadingCombinationCandidate[];
};

const toChineseForm = Converter({ from: 'jp', to: 'cn' });

function sourceSurface(): string {
  const surface = Object.keys(jmnedictPlaceReadings).find((item) => toJapaneseForm(item) === item);
  assert.ok(surface, 'JMnedict snapshot must contain a Japanese-form surface');
  return surface;
}

function normalizedSource(): { input: string; surface: string } {
  const result = Object.keys(jmnedictPlaceReadings)
    .map((surface) => ({ input: toChineseForm(surface), surface }))
    .find(({ input, surface }) => input !== surface && toJapaneseForm(input) === surface);
  assert.ok(result, 'external data and OpenCC must provide a convertible Japanese-form surface');
  return result;
}

function character(kanji: string, reading: string, type: ReadingType): CharacterReadingResult {
  return {
    originalChar: kanji, normalizedChar: kanji, variantCandidates: [kanji],
    candidates: [{ kanji, reading, surfaceReading: reading, type, label: type, priority: 0, source: 'test' }],
  };
}

test('API keeps exact dictionary matches and direct inference in separate fields', () => {
  const surface = sourceSurface();
  const response = createApiResponse(`/api/convert?q=${encodeURIComponent(surface)}`);
  const body = response.body as ApiBody;

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.exactDictionaryCandidates));
  assert.ok(Array.isArray(body.normalizedDictionaryCandidates));
  assert.ok(Array.isArray(body.directCandidates));
  assert.ok(Array.isArray(body.rendakuCandidates));
  assert.ok(body.exactDictionaryCandidates.length > 0);
  assert.equal('combinationCandidates' in body, false);
  assert.ok(body.exactDictionaryCandidates.every((candidate) => candidate.notes.some((note) => note === `词典表记：${surface}`)));
});

test('normalization is only a lookup route, never an exact-match label', () => {
  const { input, surface } = normalizedSource();
  const response = createApiResponse(`/api/convert?q=${encodeURIComponent(input)}`);
  const body = response.body as ApiBody;

  assert.equal(body.exactDictionaryCandidates.length, 0);
  assert.ok(body.normalizedDictionaryCandidates.length > 0);
  assert.ok(body.normalizedDictionaryCandidates.every((candidate) => candidate.notes.includes(`词典表记：${surface}`)));
  assert.ok(body.normalizedDictionaryCandidates.every((candidate) => candidate.notes.some((note) => note.startsWith('日文字形归一化后命中：'))));
});

test('direct candidates add a clearly marked rendaku possibility in a conservative native-word environment', () => {
  const groups = getCombinationCandidateGroups([
    character('山', 'やま', 'kun'),
    character('川', 'かわ', 'kun'),
  ]);
  const rendaku = groups.rendakuCandidates.find((candidate) => candidate.reading === 'やまがわ');

  assert.ok(rendaku);
  assert.equal(rendaku.label, '逐字直拼＋连浊可能候选');
  assert.equal(rendaku.evidence, 'rendaku');
  assert.ok(rendaku.notes.some((note) => note.startsWith('连浊可能：')));
  assert.equal(groups.directCandidates.some((candidate) => candidate.reading === 'やまがわ'), false);
});

test('Lyman\'s Law blocks a generated rendaku variant when the second element already contains a voiced obstruent', () => {
  const groups = getCombinationCandidateGroups([
    character('春', 'はる', 'kun'),
    character('風', 'かぜ', 'kun'),
  ]);

  assert.equal(groups.rendakuCandidates.some((candidate) => candidate.reading === 'はるがぜ'), false);
});

test('API rejects empty, non-kanji and oversized input instead of silently changing it', () => {
  const cases = [
    { query: '', error: '请输入汉字词。' },
    { query: 'Tokyo', error: '请输入至少一个汉字。' },
    { query: '山'.repeat(25), error: '最多输入 24 个字符。' },
  ];

  for (const item of cases) {
    const response = createApiResponse(`/api/convert?q=${encodeURIComponent(item.query)}`);
    assert.equal(response.status, 400);
    assert.equal((response.body as { error: string }).error, item.error);
  }
});
