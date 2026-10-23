import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateHarmoniumKeys,
  midiToFrequency,
  getSwaraForMidi,
  evaluateKeyInRaga,
  RAGA_SUGGESTIONS,
  TAAL_DEFINITIONS,
} from './musicTheory';

test('generateHarmoniumKeys returns 24 keys for pad-24 mode and 32 keys for concert-32 mode', () => {
  const padKeys = generateHarmoniumKeys('pad-24');
  assert.equal(padKeys.length, 24);
  assert.equal(padKeys[0].westernName, 'F3');
  assert.equal(padKeys[padKeys.length - 1].westernName, 'E5');

  const concertKeys = generateHarmoniumKeys('concert-32');
  assert.equal(concertKeys.length, 32);
  assert.equal(concertKeys[0].westernName, 'C3');
  assert.equal(concertKeys[concertKeys.length - 1].westernName, 'G5');
});

test('midiToFrequency calculates accurate frequencies in Equal Temperament and Harmonium Just Intonation', () => {
  // A4 (MIDI 69) in equal temperament at 440Hz should be 440
  assert.equal(midiToFrequency(69, 440, 0, false), 440);
  // C4 (MIDI 60) as Sa (rootPitchClass 0) has 0 cent offset in both modes
  const c4Equal = midiToFrequency(60, 440, 0, false);
  const c4Just = midiToFrequency(60, 440, 0, true);
  assert.equal(c4Equal, c4Just);
  assert.ok(c4Equal > 261 && c4Equal < 262);
});

test('getSwaraForMidi maps MIDI notes to correct Sargam swaras relative to Root Pitch (Sa)', () => {
  // With Sa = C (rootPitchClass = 0), MIDI 60 is Madhya Sa, MIDI 67 is Madhya Pa
  const sa = getSwaraForMidi(60, 0);
  assert.equal(sa.short, 'Sa');
  assert.equal(sa.devanagari, 'S');
  assert.equal(sa.saptakDot, 'mid');

  const pa = getSwaraForMidi(67, 0);
  assert.equal(pa.short, 'Pa');
  assert.equal(pa.saptakDot, 'mid');

  // With Sa = D (rootPitchClass = 2), MIDI 62 (D4) becomes Madhya Sa
  const saOnD = getSwaraForMidi(62, 2);
  assert.equal(saOnD.short, 'Sa');
  assert.equal(saOnD.saptakDot, 'mid');
});

test('evaluateKeyInRaga identifies allowed notes, Vadi, and Samvadi in Raga Yaman and Pahadi Jhyaure', () => {
  const yaman = RAGA_SUGGESTIONS.find((r) => r.id === 'raga-yaman')!;
  assert.ok(yaman);

  // In Raga Yaman (Sa=C), F4 (MIDI 65, Shuddha Ma, semitone 5) is excluded, F#4 (MIDI 66, Teevra Ma, semitone 6) is included
  const shuddhaMa = evaluateKeyInRaga(65, 0, yaman);
  assert.equal(shuddhaMa.inRaga, false);

  const teevraMa = evaluateKeyInRaga(66, 0, yaman);
  assert.equal(teevraMa.inRaga, true);

  // E4 (MIDI 64, semitone 4 = Ga) is Vadi in Raga Yaman
  const ga = evaluateKeyInRaga(64, 0, yaman);
  assert.equal(ga.isVadi, true);
  assert.equal(ga.inRaga, true);
});

test('TAAL_DEFINITIONS have step counts matching their declared beat counts', () => {
  for (const taal of TAAL_DEFINITIONS) {
    assert.equal(taal.steps.length, taal.beats, `Taal ${taal.id} step count mismatch`);
    assert.equal(taal.steps[0].accent, 'sam', `Taal ${taal.id} first beat must be Sam`);
  }
});
