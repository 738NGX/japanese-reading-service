import { toHiragana } from 'wanakana';
import { kanaToRomaji } from './romanize';
import type { CharacterReadingResult, KanjiReadingCandidate, ReadingCombinationCandidate, ReadingType } from './types';

const MAX_PER_CHAR_CANDIDATES = 6;
const MAX_PATH_STATES = 96;
const MAX_COMBINATION_CANDIDATES = 10;

type PathState = {
  reading: string;
  displayReadings: string[];
  surfaceReadings: string[];
  readingTypes: ReadingType[];
  originalChars: string[];
  priority: number;
};

type RendakuVariant = {
  reading: string;
  displayReadings: string[];
  surfaceReadings: string[];
  priority: number;
  note: string;
};

const RENDAKU_INITIAL_VOICING: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};
const VOICED_OBSTRUENT = /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ]/u;

function candidateSurface(candidate: KanjiReadingCandidate): string {
  // KANJIDIC2 puts okurigana after a dot (e.g. あたら.しい). In a compound,
  // only the source-provided stem can take part in a boundary-level hypothesis.
  const sourceReading = candidate.reading || candidate.surfaceReading;
  return toHiragana(sourceReading.split('.')[0].replace(/-/g, ''));
}

function getUsableCandidates(item: CharacterReadingResult): KanjiReadingCandidate[] {
  const seen = new Set<string>();
  return item.candidates
    .filter((candidate) => candidateSurface(candidate).length > 0)
    .filter((candidate) => {
      const key = `${candidate.type}:${candidateSurface(candidate)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PER_CHAR_CANDIDATES);
}

function stateToCandidate(state: PathState, rendaku?: RendakuVariant): ReadingCombinationCandidate {
  const reading = rendaku?.reading ?? state.reading;
  return {
    reading,
    romaji: kanaToRomaji(reading),
    label: rendaku ? '逐字直拼＋连浊可能候选' : '逐字直拼候选',
    priority: rendaku?.priority ?? state.priority,
    source: 'direct',
    evidence: rendaku ? 'rendaku' : 'direct',
    notes: rendaku
      ? ['单字层拼接，不构成整词词典证据', rendaku.note]
      : ['单字层拼接，不构成整词词典证据'],
    originalChars: state.originalChars,
    readingTypes: state.readingTypes,
    displayReadings: rendaku?.displayReadings ?? state.displayReadings,
    surfaceReadings: rendaku?.surfaceReadings ?? state.surfaceReadings,
  };
}

function voiceInitial(reading: string): string | undefined {
  const first = reading[0];
  const voiced = RENDAKU_INITIAL_VOICING[first];
  return voiced ? `${voiced}${reading.slice(1)}` : undefined;
}

function rendakuSupport(previousType: ReadingType, currentType: ReadingType, previousReading: string): { boost: number; reason: string } | undefined {
  if (previousType !== 'kun' || currentType !== 'kun') return undefined;
  if (previousReading.endsWith('ん')) return { boost: 55, reason: '前后项均为训读，且前项以拨音「ん」收尾' };
  return { boost: 40, reason: '前后项均为训读，符合和语复合中连浊较常见的条件' };
}

function createRendakuVariants(state: PathState): RendakuVariant[] {
  return state.surfaceReadings.slice(1).flatMap((currentReading, offset) => {
    const index = offset + 1;
    const previousReading = state.surfaceReadings[index - 1];
    const voicedReading = voiceInitial(currentReading);
    const support = rendakuSupport(state.readingTypes[index - 1], state.readingTypes[index], previousReading);
    if (!voicedReading || !support) return [];

    // Lyman's Law: a voiced obstruent later in the second element normally blocks rendaku.
    if (VOICED_OBSTRUENT.test(currentReading.slice(1))) return [];

    const surfaceReadings = [...state.surfaceReadings];
    surfaceReadings[index] = voicedReading;
    const displayReadings = [...state.displayReadings];
    displayReadings[index] = `${displayReadings[index]} → ${voicedReading}`;
    return [{
      reading: surfaceReadings.join(''), displayReadings, surfaceReadings,
      priority: state.priority + support.boost,
      note: `连浊可能：后项起首「${currentReading[0]} → ${voicedReading[0]}」；${support.reason}。后项内部未见会触发莱曼定律的浊阻碍音，仍须以整词资料核实。`,
    }];
  });
}

function dedupeCombinationCandidates(candidates: ReadingCombinationCandidate[]): ReadingCombinationCandidate[] {
  const byReading = new Map<string, ReadingCombinationCandidate>();
  for (const candidate of candidates) {
    const existing = byReading.get(candidate.reading);
    if (!existing || existing.priority < candidate.priority) byReading.set(candidate.reading, candidate);
  }
  return Array.from(byReading.values()).sort((a, b) => b.priority - a.priority);
}

export function getCombinationCandidateGroups(characters: CharacterReadingResult[]) {
  if (characters.length === 0) return { directCandidates: [], rendakuCandidates: [] };

  let states: PathState[] = [{
    reading: '', displayReadings: [], surfaceReadings: [], readingTypes: [], originalChars: [], priority: 0,
  }];

  for (const item of characters) {
    const candidates = getUsableCandidates(item);
    const nextStates: PathState[] = [];
    for (const state of states) {
      for (const candidate of candidates) {
        const surface = candidateSurface(candidate);
        nextStates.push({
          reading: `${state.reading}${surface}`,
          displayReadings: [...state.displayReadings, candidate.reading],
          surfaceReadings: [...state.surfaceReadings, surface],
          readingTypes: [...state.readingTypes, candidate.type],
          originalChars: [...state.originalChars, item.originalChar],
          // Preserve the external dictionary's order over a generated phonological hypothesis.
          priority: state.priority + candidate.priority * 10,
        });
      }
    }
    states = nextStates.sort((a, b) => b.priority - a.priority).slice(0, MAX_PATH_STATES);
  }

  const directCandidates = dedupeCombinationCandidates(states.map((state) => stateToCandidate(state))).slice(0, MAX_COMBINATION_CANDIDATES);
  const rendakuCandidates = dedupeCombinationCandidates(states.flatMap((state) => createRendakuVariants(state).map((variant) => stateToCandidate(state, variant)))).slice(0, MAX_COMBINATION_CANDIDATES);
  return { directCandidates, rendakuCandidates };
}

export function getCombinationCandidates(characters: CharacterReadingResult[]): ReadingCombinationCandidate[] {
  const groups = getCombinationCandidateGroups(characters);
  return [...groups.directCandidates, ...groups.rendakuCandidates];
}

export function combineSelectedReadings(characters: CharacterReadingResult[]): string {
  return getCombinationCandidates(characters)[0]?.reading ?? '';
}

export function combineSelectedRomaji(characters: CharacterReadingResult[]): string {
  return getCombinationCandidates(characters)[0]?.romaji ?? '';
}
