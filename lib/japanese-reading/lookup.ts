import { Converter } from 'opencc-js';
import { toHiragana } from 'wanakana';
import kanjiReadings from '../../data/japanese-reading/kanji-readings.json';
import jmnedictPlaceReadings from '../../data/japanese-reading/jmnedict-place-readings.json';
import { kanaToRomaji } from './romanize';
import type {
  CharacterReadingResult,
  ConvertResult,
  KanjiReadingCandidate,
  KanjiReadingData,
  ReadingCombinationCandidate,
  ReadingType,
  WordReadingCandidate,
} from './types';

const KANJI_DATA = kanjiReadings as Record<string, KanjiReadingData>;
const JMNEDICT_PLACE_DATA = jmnedictPlaceReadings as Record<string, string[]>;
const toJapaneseKanji = Converter({ from: 'cn', to: 'jp' });

const TYPE_LABEL: Record<ReadingType, string> = {
  on: '音读', kun: '训读', nanori: '名乘读', place: '地名', person: '人名', unknown: '未知',
};

function surfaceReading(reading: string): string {
  return toHiragana(reading.replace(/[.-]/g, ''));
}

function createKanjiCandidates(kanji: string, data: KanjiReadingData): KanjiReadingCandidate[] {
  const groups: Array<{ key: keyof KanjiReadingData; type: ReadingType }> = [
    { key: 'on', type: 'on' },
    { key: 'kun', type: 'kun' },
    { key: 'nanori', type: 'nanori' },
  ];
  let sourceIndex = 0;
  const candidates = groups.flatMap(({ key, type }) => {
    const readings = Array.isArray(data[key]) ? data[key] as string[] : [];
    return readings.flatMap((reading, index) => {
      const full = surfaceReading(reading);
      return [{
        kanji, reading, surfaceReading: full, type, label: TYPE_LABEL[type],
        priority: -(sourceIndex += 1) - index, source: 'KANJIDIC2', romaji: kanaToRomaji(full),
      }];
    });
  });
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.type}:${candidate.surfaceReading}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeInput(input: string): string {
  return input.trim().replace(/\s+/g, '');
}

/** OpenCC performs cn → jp conversion at request time; no project-owned character map is used. */
export function toJapaneseForm(input: string): string {
  return toJapaneseKanji(normalizeInput(input));
}

export function lookupKanjiReadings(char: string): KanjiReadingCandidate[] {
  if (!/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) return [];
  const data = KANJI_DATA[char];
  return data ? createKanjiCandidates(char, data) : [];
}

export function lookupWordReadings(input: string, japaneseForm: string): WordReadingCandidate[] {
  const forms = [{ surface: input, matchedForm: 'original' as const }];
  if (japaneseForm !== input) forms.push({ surface: japaneseForm, matchedForm: 'japanese-normalized' });
  const candidates = forms.flatMap(({ surface, matchedForm }) => {
    return (JMNEDICT_PLACE_DATA[surface] ?? []).map((reading, index) => ({
      surface, reading: toHiragana(reading), kanaType: 'hiragana' as const, type: 'place' as const,
      label: 'JMnedict 地名', priority: -index, source: 'JMnedict', matchedForm, romaji: kanaToRomaji(reading),
    }));
  });
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.matchedForm}:${candidate.reading}:${candidate.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createWordCombinationCandidates(
  wordCandidates: WordReadingCandidate[],
): ReadingCombinationCandidate[] {
  return wordCandidates.map((candidate) => ({
    reading: candidate.reading, romaji: candidate.romaji ?? kanaToRomaji(candidate.reading), label: candidate.label,
    priority: 1000 + candidate.priority, source: 'dictionary', notes: [`词典表记：${candidate.surface}`, `整词词典命中：${candidate.source ?? 'unknown'}`],
    evidence: candidate.matchedForm === 'japanese-normalized' ? 'dictionary-normalized' : 'dictionary-exact',
    originalChars: Array.from(candidate.surface), readingTypes: Array.from(candidate.surface, () => candidate.type),
    displayReadings: [candidate.reading], surfaceReadings: [candidate.reading],
    ...(candidate.matchedForm === 'japanese-normalized' ? { notes: [`词典表记：${candidate.surface}`, `日文字形归一化后命中：${candidate.source ?? 'unknown'}`] } : {}),
  }));
}

export function convertToReadingCandidates(input: string): ConvertResult {
  const normalizedInput = normalizeInput(input);
  const japaneseForm = toJapaneseForm(normalizedInput);
  const wordCandidates = lookupWordReadings(normalizedInput, japaneseForm);
  const originalChars = Array.from(normalizedInput);
  const japaneseChars = Array.from(japaneseForm);
  const characters: CharacterReadingResult[] = japaneseChars.map((char, index) => {
    const candidates = lookupKanjiReadings(char);
    return {
      originalChar: originalChars[index] ?? char,
      normalizedChar: char,
      variantCandidates: char === originalChars[index] ? [char] : [char],
      candidates,
      selected: candidates[0],
    };
  });
  return { input, normalizedInput: japaneseForm, normalizedForms: japaneseForm === normalizedInput ? [japaneseForm] : [normalizedInput, japaneseForm], wordCandidates, characters };
}
