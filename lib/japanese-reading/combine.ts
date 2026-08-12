import { kanaToRomaji } from './romanize';
import { scoreCombinationCandidate } from './ranker';
import type { CharacterReadingResult, KanjiReadingCandidate, ReadingCombinationCandidate, ReadingType } from './types';

const MAX_PER_CHAR_CANDIDATES = 6;
const MAX_PATH_STATES = 96;
const MAX_COMBINATION_CANDIDATES = 10;

const VOICING_MAP: Record<string, string> = {
  か: 'が',
  き: 'ぎ',
  く: 'ぐ',
  け: 'げ',
  こ: 'ご',
  さ: 'ざ',
  し: 'じ',
  す: 'ず',
  せ: 'ぜ',
  そ: 'ぞ',
  た: 'だ',
  ち: 'ぢ',
  つ: 'づ',
  て: 'で',
  と: 'ど',
  は: 'ば',
  ひ: 'び',
  ふ: 'ぶ',
  へ: 'べ',
  ほ: 'ぼ',
  カ: 'ガ',
  キ: 'ギ',
  ク: 'グ',
  ケ: 'ゲ',
  コ: 'ゴ',
  サ: 'ザ',
  シ: 'ジ',
  ス: 'ズ',
  セ: 'ゼ',
  ソ: 'ゾ',
  タ: 'ダ',
  チ: 'ヂ',
  ツ: 'ヅ',
  テ: 'デ',
  ト: 'ド',
  ハ: 'バ',
  ヒ: 'ビ',
  フ: 'ブ',
  ヘ: 'ベ',
  ホ: 'ボ',
};

const SEMI_VOICING_MAP: Record<string, string> = {
  は: 'ぱ',
  ひ: 'ぴ',
  ふ: 'ぷ',
  へ: 'ぺ',
  ほ: 'ぽ',
  ハ: 'パ',
  ヒ: 'ピ',
  フ: 'プ',
  ヘ: 'ペ',
  ホ: 'ポ',
};

const VOICED_KANA = /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ]/u;
const S_ROW = new Set(['さ', 'し', 'す', 'せ', 'そ', 'サ', 'シ', 'ス', 'セ', 'ソ']);
const H_ROW = new Set(['は', 'ひ', 'ふ', 'へ', 'ほ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ']);
const K_ROW = new Set(['か', 'き', 'く', 'け', 'こ', 'カ', 'キ', 'ク', 'ケ', 'コ']);

type PathState = {
  reading: string;
  displayReadings: string[];
  surfaceReadings: string[];
  readingTypes: ReadingType[];
  originalChars: string[];
  notes: string[];
  voicingPositions: number[];
  voicedOriginalChars: string[];
  semiVoicingPositions: number[];
  priorFeatureTags: string[];
  priority: number;
  selectedMatchCount: number;
  manualSelectedMatchCount: number;
  hasRule: boolean;
};

function candidateSurface(candidate: KanjiReadingCandidate): string {
  return candidate.surfaceReading || candidate.reading.replace(/[.-]/g, '');
}

function selectedKey(candidate: KanjiReadingCandidate): string {
  return `${candidate.kanji}:${candidate.type}:${candidate.reading}`;
}

function getSelectedCandidate(item: CharacterReadingResult): KanjiReadingCandidate | undefined {
  return item.selected;
}

function getUsableCandidates(item: CharacterReadingResult): KanjiReadingCandidate[] {
  const selected = getSelectedCandidate(item);
  const ordered = selected && item.manuallySelected ? [selected, ...item.candidates] : item.candidates;
  const seen = new Set<string>();

  return ordered
    .filter((candidate) => candidateSurface(candidate).length > 0)
    .filter((candidate) => {
      const key = `${candidate.type}:${candidateSurface(candidate)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PER_CHAR_CANDIDATES);
}

function voiceInitial(reading: string): string | null {
  const first = reading[0];
  const voiced = VOICING_MAP[first];
  return voiced ? `${voiced}${reading.slice(1)}` : null;
}

function semiVoiceInitial(reading: string): string | null {
  const first = reading[0];
  const voiced = SEMI_VOICING_MAP[first];
  return voiced ? `${voiced}${reading.slice(1)}` : null;
}

function hasInternalVoicing(reading: string): boolean {
  return VOICED_KANA.test(reading.slice(1));
}

function boundaryPrior(
  previousType: ReadingType | undefined,
  currentType: ReadingType | undefined,
  previousReading: string,
  currentReading: string,
  previousOriginalChar: string,
  currentOriginalChar: string,
  kind: 'voiced' | 'semi-voiced',
): { priority: number; tags: string[] } {
  let priority = 0;
  const tags: string[] = [];
  const afterNasal = previousReading.endsWith('ん') || previousReading.endsWith('ン');
  const longKunReading = currentType === 'kun' && Array.from(currentReading).length >= 3;

  if (previousType === 'on' && currentType === 'on') {
    priority -= 10;
    tags.push('on-on-voicing-penalty');
  } else if (previousType === 'kun' && currentType === 'kun') {
    priority += 7;
    tags.push('kun-kun-voicing-bonus');
  } else if (previousType === 'on' && currentType === 'kun') {
    priority -= 2;
    tags.push('on-kun-voicing-penalty');
  }

  if (previousOriginalChar === '大' && previousReading === 'おお') {
    priority -= 14;
    tags.push('large-prefix-clear-bias');
  }
  if ((previousOriginalChar === '小' && (previousReading === 'こ' || previousReading === 'お')) || (previousOriginalChar === '中' && previousReading === 'なか')) {
    priority += 14;
    tags.push('small-middle-prefix-voicing-bonus');
  }
  if (afterNasal && currentType === 'kun') {
    priority += kind === 'semi-voiced' ? 8 : 12;
    tags.push(kind === 'semi-voiced' ? 'nasal-kun-semi-voicing-bonus' : 'nasal-kun-voicing-bonus');
  } else if (afterNasal && previousType === 'on' && currentType === 'on') {
    priority -= 4;
    tags.push('nasal-on-voicing-penalty');
  } else if (afterNasal) {
    priority += 2;
    tags.push('nasal-mixed-voicing-weak-bonus');
  }
  if (longKunReading) {
    priority -= 8;
    tags.push('long-kun-reading-voicing-penalty');
  }
  if (currentOriginalChar === '橋' || currentOriginalChar === '桥') {
    priority += 5;
    tags.push('bridge-suffix-voicing-bonus');
  }

  return { priority, tags };
}

function hasVoicingTendency(
  previousType: ReadingType | undefined,
  currentType: ReadingType | undefined,
  previousReading: string,
  currentReading: string,
): boolean {
  const first = currentReading[0];
  const afterNasal = previousReading.endsWith('ん') || previousReading.endsWith('ン');

  if (afterNasal) return H_ROW.has(first) || S_ROW.has(first) || K_ROW.has(first);
  if (H_ROW.has(first) || S_ROW.has(first) || K_ROW.has(first)) return true;

  return false;
}

function getBoundaryVoicingCandidates(
  previousType: ReadingType | undefined,
  currentType: ReadingType | undefined,
  previousReading: string,
  currentReading: string,
  previousOriginalChar: string,
  currentOriginalChar: string,
): Array<{ reading: string; note: string; priority: number; kind: 'voiced' | 'semi-voiced'; tags: string[] }> {
  if (hasInternalVoicing(currentReading)) return [];
  if (!hasVoicingTendency(previousType, currentType, previousReading, currentReading)) return [];

  const voicedReading = voiceInitial(currentReading);
  const semiVoicedReading = semiVoiceInitial(currentReading);
  const candidates: Array<{ reading: string; note: string; priority: number; kind: 'voiced' | 'semi-voiced'; tags: string[] }> = [];

  const note = previousReading.endsWith('ん') || previousReading.endsWith('ン')
    ? '拨音后续清音的音变候选'
    : '复合词连浊候选';

  if (voicedReading && voicedReading !== currentReading) {
    const prior = boundaryPrior(previousType, currentType, previousReading, currentReading, previousOriginalChar, currentOriginalChar, 'voiced');
    candidates.push({
      reading: voicedReading,
      note,
      priority: prior.priority,
      kind: 'voiced',
      tags: prior.tags,
    });
  }

  if ((previousReading.endsWith('ん') || previousReading.endsWith('ン')) && semiVoicedReading && semiVoicedReading !== currentReading) {
    const prior = boundaryPrior(previousType, currentType, previousReading, currentReading, previousOriginalChar, currentOriginalChar, 'semi-voiced');
    candidates.push({
      reading: semiVoicedReading,
      note: '拨音后 H 行半浊化候选',
      priority: prior.priority,
      kind: 'semi-voiced',
      tags: prior.tags,
    });
  }

  return candidates;
}

function stateToCandidate(state: PathState): ReadingCombinationCandidate {
  const source = state.hasRule ? 'phonetic-rule' : 'direct';
  const candidate: ReadingCombinationCandidate = {
    reading: state.reading,
    romaji: kanaToRomaji(state.reading),
    label: source === 'phonetic-rule' ? '规则/模型候选' : '直拼候选',
    priority: state.priority,
    source,
    notes: state.notes.length > 0 ? state.notes : ['按逐字候选直接拼接'],
    originalChars: state.originalChars,
    readingTypes: state.readingTypes,
    displayReadings: state.displayReadings,
    surfaceReadings: state.surfaceReadings,
    voicingPositions: state.voicingPositions,
    voicedOriginalChars: state.voicedOriginalChars,
    semiVoicingPositions: state.semiVoicingPositions,
    priorFeatureTags: state.priorFeatureTags,
    selectedMatchCount: state.selectedMatchCount,
    manualSelectedMatchCount: state.manualSelectedMatchCount,
  };
  const rankerScore = scoreCombinationCandidate(candidate);
  return {
    ...candidate,
    rankerScore,
    priority: state.priority + rankerScore,
  };
}

function dedupeCombinationCandidates(candidates: ReadingCombinationCandidate[]): ReadingCombinationCandidate[] {
  const byReading = new Map<string, ReadingCombinationCandidate>();
  for (const candidate of candidates) {
    const existing = byReading.get(candidate.reading);
    if (!existing || existing.priority < candidate.priority) {
      byReading.set(candidate.reading, candidate);
    }
  }
  return Array.from(byReading.values()).sort((a, b) => b.priority - a.priority);
}

export function getCombinationCandidates(characters: CharacterReadingResult[]): ReadingCombinationCandidate[] {
  if (characters.length === 0) return [];

  let states: PathState[] = [{
    reading: '',
    displayReadings: [],
    surfaceReadings: [],
    readingTypes: [],
    originalChars: [],
    notes: [],
    voicingPositions: [],
    voicedOriginalChars: [],
    semiVoicingPositions: [],
    priorFeatureTags: [],
    priority: 0,
    selectedMatchCount: 0,
    manualSelectedMatchCount: 0,
    hasRule: false,
  }];

  characters.forEach((item, index) => {
    const usableCandidates = getUsableCandidates(item);
    const selected = getSelectedCandidate(item);
    const selectedCandidateKey = selected && item.manuallySelected ? selectedKey(selected) : '';
    const nextStates: PathState[] = [];

    for (const state of states) {
      for (const candidate of usableCandidates) {
        const surface = candidateSurface(candidate);
        const isSelected = selectedKey(candidate) === selectedCandidateKey;
        const baseState: PathState = {
          reading: `${state.reading}${surface}`,
          displayReadings: [...state.displayReadings, candidate.reading],
          surfaceReadings: [...state.surfaceReadings, surface],
          readingTypes: [...state.readingTypes, candidate.type],
          originalChars: [...state.originalChars, item.originalChar],
          notes: state.notes,
          voicingPositions: state.voicingPositions,
          voicedOriginalChars: state.voicedOriginalChars,
          semiVoicingPositions: state.semiVoicingPositions,
          priorFeatureTags: state.priorFeatureTags,
          priority: state.priority + candidate.priority / 20 + (isSelected ? 60 : 0),
          selectedMatchCount: state.selectedMatchCount + (isSelected ? 1 : 0),
          manualSelectedMatchCount: state.manualSelectedMatchCount + (isSelected ? 1 : 0),
          hasRule: state.hasRule,
        };
        nextStates.push(baseState);

        if (index > 0) {
          const previousSurface = state.surfaceReadings[state.surfaceReadings.length - 1];
          const previousType = state.readingTypes[state.readingTypes.length - 1];
          const previousOriginalChar = state.originalChars[state.originalChars.length - 1];
          const voicedCandidates = getBoundaryVoicingCandidates(previousType, candidate.type, previousSurface, surface, previousOriginalChar, item.originalChar);
          for (const voiced of voicedCandidates) {
            nextStates.push({
              ...baseState,
              reading: `${state.reading}${voiced.reading}`,
              surfaceReadings: [...state.surfaceReadings, voiced.reading],
              notes: [...state.notes, `${characters[index - 1].originalChar}+${item.originalChar}: ${voiced.note}`],
              voicingPositions: voiced.kind === 'voiced' ? [...state.voicingPositions, index] : state.voicingPositions,
              voicedOriginalChars: voiced.kind === 'voiced' ? [...state.voicedOriginalChars, item.originalChar] : state.voicedOriginalChars,
              semiVoicingPositions: voiced.kind === 'semi-voiced' ? [...state.semiVoicingPositions, index] : state.semiVoicingPositions,
              priorFeatureTags: [...state.priorFeatureTags, ...voiced.tags],
              priority: baseState.priority + voiced.priority,
              hasRule: true,
            });
          }
        }
      }
    }

    states = nextStates
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_PATH_STATES);
  });

  return dedupeCombinationCandidates(states.map(stateToCandidate)).slice(0, MAX_COMBINATION_CANDIDATES);
}

export function combineSelectedReadings(characters: CharacterReadingResult[]): string {
  return getCombinationCandidates(characters)[0]?.reading ?? '';
}

export function combineSelectedRomaji(characters: CharacterReadingResult[]): string {
  return getCombinationCandidates(characters)[0]?.romaji ?? '';
}
