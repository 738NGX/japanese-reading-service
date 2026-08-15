import assert from 'node:assert/strict';
import test from 'node:test';
import { kanaToRomaji } from '../lib/japanese-reading/romanize';

test('renders candidate readings in title-cased traditional Hepburn', () => {
  assert.equal(kanaToRomaji('とうきょう'), 'Tōkyō');
  assert.equal(kanaToRomaji('おおさか'), 'Ōsaka');
  assert.equal(kanaToRomaji('なんば'), 'Namba');
  assert.equal(kanaToRomaji('はっちょう'), 'Hatchō');
  assert.equal(kanaToRomaji('しんばし'), 'Shimbashi');
});
