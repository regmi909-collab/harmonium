import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_KEYS,
  WESTERN_NAMES,
  SWARAM_NAMES,
  getNoteKeyByInput,
  getOctaveOption,
  KEYBOARD_BASE_WIDTH,
} from './constants';

describe('Harmonium Constants & Key Mapping', () => {
  it('defines 23 playable harmonium keys from MIDI 55 to 77', () => {
    assert.equal(NOTE_KEYS.length, 23);
    assert.equal(NOTE_KEYS[0].midi, 55);
    assert.equal(NOTE_KEYS[NOTE_KEYS.length - 1].midi, 77);
    const whiteKeys = NOTE_KEYS.filter((k) => k.kind === 'white');
    const blackKeys = NOTE_KEYS.filter((k) => k.kind === 'black');
    assert.equal(whiteKeys.length, 14);
    assert.equal(blackKeys.length, 9);
  });

  it('maps keyboard keycaps case-insensitively to NoteKey entries', () => {
    const c4 = getNoteKeyByInput('e');
    assert.ok(c4);
    assert.equal(c4.midi, 60);
    assert.equal(c4.western, 'C');
    assert.equal(c4.sargam, 'Sa');

    const d4 = getNoteKeyByInput('R');
    assert.ok(d4);
    assert.equal(d4.midi, 62);
    assert.equal(d4.western, 'D');

    assert.equal(getNoteKeyByInput('unmapped-key'), null);
  });

  it('resolves octave options with fallback to Middle octave (4)', () => {
    assert.equal(getOctaveOption(2).description, 'Low');
    assert.equal(getOctaveOption(4).description, 'Middle');
    assert.equal(getOctaveOption(99).value, 4);
    assert.equal(WESTERN_NAMES.length, 12);
    assert.equal(SWARAM_NAMES.length, 12);
    assert.equal(KEYBOARD_BASE_WIDTH, 1020);
  });
});
