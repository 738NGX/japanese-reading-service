export type ReadingType =
  | 'on'
  | 'kun'
  | 'nanori'
  | 'word'
  | 'place'
  | 'person'
  | 'custom'
  | 'unknown';

export type ReadingMode = 'auto' | 'place' | 'person' | 'free';

export interface KanjiReadingData {
  on?: string[];
  kun?: string[];
  nanori?: string[];
  meanings?: string[];
  grade?: number;
  jlpt?: number;
  frequency?: number;
}

export interface KanjiReadingCandidate {
  kanji: string;
  reading: string;
  surfaceReading: string;
  type: ReadingType;
  label: string;
  priority: number;
  source?: string;
  romaji?: string;
}

export interface WordReadingCandidate {
  surface: string;
  reading: string;
  kanaType?: 'hiragana' | 'katakana' | 'mixed';
  type: ReadingType;
  label: string;
  priority: number;
  source?: string;
  romaji?: string;
}

export interface CharacterReadingResult {
  originalChar: string;
  normalizedChar: string;
  variantCandidates: string[];
  candidates: KanjiReadingCandidate[];
  selected?: KanjiReadingCandidate;
  manuallySelected?: boolean;
}

export interface ConvertResult {
  input: string;
  normalizedInput: string;
  normalizedForms: string[];
  wordCandidates: WordReadingCandidate[];
  characters: CharacterReadingResult[];
}

export interface ReadingCombinationCandidate {
  reading: string;
  romaji: string;
  label: string;
  priority: number;
  source: 'dictionary' | 'direct' | 'phonetic-rule';
  notes: string[];
  originalChars?: string[];
  readingTypes?: ReadingType[];
  displayReadings?: string[];
  surfaceReadings?: string[];
  voicingPositions?: number[];
  voicedOriginalChars?: string[];
  semiVoicingPositions?: number[];
  priorFeatureTags?: string[];
  selectedMatchCount: number;
  manualSelectedMatchCount: number;
  rankerScore?: number;
}
