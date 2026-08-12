import rankerWeights from '@/data/japanese-reading/ranker-weights.json';
import type { ReadingCombinationCandidate } from './types';

type RankerModel = {
  bias: number;
  weights: Record<string, number>;
};

const model = rankerWeights as RankerModel;

function addFeature(features: Record<string, number>, key: string, value = 1): void {
  features[key] = (features[key] ?? 0) + value;
}

export function extractCombinationFeatures(candidate: ReadingCombinationCandidate): Record<string, number> {
  const features: Record<string, number> = {};
  const types = candidate.readingTypes ?? [];
  const notes = candidate.notes.join('|');
  const lastOriginal = candidate.originalChars?.[candidate.originalChars.length - 1];

  addFeature(features, 'bias');
  addFeature(features, `source:${candidate.source}`);
  addFeature(features, `length:${candidate.originalChars?.length ?? 0}`);
  addFeature(features, `typeSeq:${types.join('-')}`);
  addFeature(features, 'selectedRatio', candidate.selectedMatchCount / Math.max(1, types.length));
  addFeature(features, 'manualSelectedRatio', candidate.manualSelectedMatchCount / Math.max(1, types.length));
  addFeature(features, 'manualSelectedCount', candidate.manualSelectedMatchCount);

  for (const type of types) {
    addFeature(features, `hasType:${type}`);
  }

  if (types.every((type) => type === 'on')) addFeature(features, 'all:on');
  if (types.every((type) => type === 'kun')) addFeature(features, 'all:kun');
  if (types.includes('nanori')) addFeature(features, 'has:nanori');
  if (notes.includes('浊化')) addFeature(features, 'has:voicing');
  if (notes.includes('拨音')) addFeature(features, 'has:nasalVoicing');
  if ((candidate.voicingPositions?.length ?? 0) > 0) addFeature(features, 'has:voicing');
  if ((candidate.semiVoicingPositions?.length ?? 0) > 0) addFeature(features, 'has:semiVoicing');
  candidate.priorFeatureTags?.forEach((tag) => addFeature(features, `prior:${tag}`));
  candidate.voicingPositions?.forEach((position) => {
    const char = candidate.originalChars?.[position];
    const reading = candidate.surfaceReadings?.[position];
    addFeature(features, `voicingAt:${position}`);
    if (char) addFeature(features, `voicedChar:${char}`);
    if (char && reading) addFeature(features, `voicedCharReading:${char}:${reading}`);
  });
  candidate.semiVoicingPositions?.forEach((position) => {
    const char = candidate.originalChars?.[position];
    const reading = candidate.surfaceReadings?.[position];
    addFeature(features, `semiVoicingAt:${position}`);
    if (char) addFeature(features, `semiVoicedChar:${char}`);
    if (char && reading) addFeature(features, `semiVoicedCharReading:${char}:${reading}`);
  });
  if ((candidate.voicingPositions?.length ?? 0) > 1) addFeature(features, 'has:multipleVoicing');
  if (candidate.surfaceReadings?.some((reading) => reading.length === 1)) addFeature(features, 'has:singleKanaReading');
  if (lastOriginal && ['川', '沢', '泽', '橋', '桥', '山', '島', '岛', '田'].includes(lastOriginal)) {
    addFeature(features, `geoSuffix:${lastOriginal}`);
    addFeature(features, 'has:geoSuffix');
  }

  candidate.originalChars?.forEach((char, index) => {
    const surfaceReading = candidate.surfaceReadings?.[index];
    const type = types[index];
    if (!surfaceReading || !type) return;
    addFeature(features, `charReading:${char}:${surfaceReading}`);
    addFeature(features, `charTypeReading:${char}:${type}:${surfaceReading}`);
    addFeature(features, `pos:${index}:${char}:${surfaceReading}`);
    if (index === 0) addFeature(features, `first:${char}:${surfaceReading}`);
    if (index === (candidate.originalChars?.length ?? 0) - 1) {
      addFeature(features, `last:${char}:${surfaceReading}`);
    }
  });

  return features;
}

export function scoreCombinationCandidate(candidate: ReadingCombinationCandidate): number {
  const features = extractCombinationFeatures(candidate);
  let score = model.bias ?? 0;
  for (const [key, value] of Object.entries(features)) {
    score += (model.weights[key] ?? 0) * value;
  }
  return score;
}
