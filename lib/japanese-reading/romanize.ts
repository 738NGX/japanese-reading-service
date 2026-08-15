import { romanize } from '@lazy-cjk/japanese';

export function kanaToRomaji(input: string): string {
  const result = romanize(input.trim(), 'traditional hepburn');
  return result ? `${result[0].toLocaleUpperCase('en-US')}${result.slice(1)}` : '';
}
