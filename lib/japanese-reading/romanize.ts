import { romanize } from '@lazy-cjk/japanese';

export function kanaToRomaji(input: string): string {
  return titleCaseRomaji(romanize(input.trim(), 'traditional hepburn'));
}

export function joinRomajiParts(parts: readonly string[]): string {
  return titleCaseRomaji(parts.map((part) => lowerCaseInitial(part)).join(''));
}

function titleCaseRomaji(value: string): string {
  return value ? `${value[0].toLocaleUpperCase('en-US')}${value.slice(1)}` : '';
}

function lowerCaseInitial(value: string): string {
  return value ? `${value[0].toLocaleLowerCase('en-US')}${value.slice(1)}` : '';
}
