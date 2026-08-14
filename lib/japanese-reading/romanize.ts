import { toRomaji } from 'wanakana';

export function kanaToRomaji(input: string): string {
  return toRomaji(input.trim());
}
