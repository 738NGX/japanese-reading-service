import { Converter } from 'opencc-js';
import kanjiReadings from '@/data/japanese-reading/kanji-readings.json';
import jmnedictPlaceReadings from '@/data/japanese-reading/jmnedict-place-readings.json';
import wordReadings from '@/data/japanese-reading/word-readings.json';
import { kanaToRomaji } from './romanize';
import type {
  CharacterReadingResult,
  ConvertResult,
  KanjiReadingCandidate,
  KanjiReadingData,
  ReadingCombinationCandidate,
  ReadingMode,
  ReadingType,
  WordReadingCandidate,
} from './types';

const KANJI_DATA = kanjiReadings as Record<string, KanjiReadingData>;
const WORD_DATA = wordReadings as Record<string, Array<Omit<WordReadingCandidate, 'surface' | 'romaji'>>>;
const JMNEDICT_PLACE_DATA = jmnedictPlaceReadings as Record<string, string[]>;
const toJapaneseKanji = Converter({ from: 'cn', to: 'jp' });

const TYPE_LABEL: Record<ReadingType, string> = {
  on: '音读', kun: '训读', nanori: '名乘读', word: '整词', place: '地名',
  person: '人名', custom: '补充词库', unknown: '未知',
};

function modeBoost(type: ReadingType, mode: ReadingMode): number {
  if (mode === 'place') return type === 'place' || type === 'word' ? 20 : type === 'kun' ? 8 : 0;
  if (mode === 'person') return type === 'person' || type === 'word' ? 20 : type === 'nanori' ? 12 : 0;
  return 0;
}

function surfaceReading(reading: string): string {
  return reading.replace(/[.-]/g, '');
}

function createKanjiCandidates(kanji: string, data: KanjiReadingData, mode: ReadingMode): KanjiReadingCandidate[] {
  const groups: Array<{ key: keyof KanjiReadingData; type: ReadingType; base: number }> = [
    { key: 'on', type: 'on', base: 70 },
    { key: 'kun', type: 'kun', base: 60 },
    { key: 'nanori', type: 'nanori', base: 50 },
  ];
  const frequencyBoost = data.frequency ? Math.max(0, 12 - Math.floor(data.frequency / 250)) : 0;
  const candidates = groups.flatMap(({ key, type, base }) => {
    const readings = Array.isArray(data[key]) ? data[key] as string[] : [];
    return readings.flatMap((reading, index) => {
      const full = surfaceReading(reading);
      const variants = [{ reading, value: full, offset: 0, suffix: '' }];
      if (type === 'kun' && reading.includes('.')) {
        const stem = reading.split('.')[0].replace(/-/g, '');
        if (stem && stem !== full) variants.push({ reading: stem, value: stem, offset: 6, suffix: '词干' });
      }
      return variants.map((variant) => ({
        kanji, reading: variant.reading, surfaceReading: variant.value, type,
        label: `${TYPE_LABEL[type]}${variant.suffix}`,
        priority: base + modeBoost(type, mode) + frequencyBoost - index + variant.offset,
        source: 'KANJIDIC2', romaji: kanaToRomaji(variant.value),
      }));
    });
  });
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.type}:${candidate.surfaceReading}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => right.priority - left.priority);
}

export function normalizeInput(input: string): string {
  return input.trim().replace(/\s+/g, '');
}

/** OpenCC performs cn → jp conversion at request time; no project-owned character map is used. */
export function toJapaneseForm(input: string): string {
  return toJapaneseKanji(normalizeInput(input));
}

export function lookupKanjiReadings(char: string, mode: ReadingMode = 'auto'): KanjiReadingCandidate[] {
  if (!/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) return [];
  const data = KANJI_DATA[char];
  return data ? createKanjiCandidates(char, data, mode) : [];
}

export function lookupWordReadings(input: string, japaneseForm: string, mode: ReadingMode = 'auto'): WordReadingCandidate[] {
  const forms = [...new Set([input, japaneseForm])].filter(Boolean);
  const candidates = forms.flatMap((surface) => {
    const curated = WORD_DATA[surface] ?? [];
    const places = (JMNEDICT_PLACE_DATA[surface] ?? []).map((reading) => ({
      reading, kanaType: 'hiragana' as const, type: 'place' as const, label: 'JMnedict 地名', priority: 125, source: 'JMnedict',
    }));
    return [...places, ...curated].map((entry) => ({
      ...entry, surface, priority: entry.priority + modeBoost(entry.type, mode), romaji: kanaToRomaji(entry.reading),
    }));
  });
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.reading}:${candidate.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => right.priority - left.priority);
}

export function createWordCombinationCandidates(
  input: string,
  wordCandidates: WordReadingCandidate[],
): ReadingCombinationCandidate[] {
  return wordCandidates.map((candidate) => ({
    reading: candidate.reading, romaji: candidate.romaji ?? kanaToRomaji(candidate.reading), label: candidate.label,
    priority: 1000 + candidate.priority, source: 'dictionary', notes: [`整词词典命中：${candidate.source ?? 'unknown'}`],
    originalChars: Array.from(input), readingTypes: Array.from(input, () => candidate.type),
    displayReadings: [candidate.reading], surfaceReadings: [candidate.reading],
    voicingPositions: [], voicedOriginalChars: [], semiVoicingPositions: [], priorFeatureTags: [],
    selectedMatchCount: 0, manualSelectedMatchCount: 0,
  }));
}

export function convertToReadingCandidates(input: string, mode: ReadingMode = 'auto'): ConvertResult {
  const normalizedInput = normalizeInput(input);
  const japaneseForm = toJapaneseForm(normalizedInput);
  const wordCandidates = lookupWordReadings(normalizedInput, japaneseForm, mode);
  const originalChars = Array.from(normalizedInput);
  const japaneseChars = Array.from(japaneseForm);
  const characters: CharacterReadingResult[] = japaneseChars.map((char, index) => {
    const candidates = lookupKanjiReadings(char, mode);
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
