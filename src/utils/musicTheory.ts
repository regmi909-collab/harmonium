/**
 * Core music theory, Sargam scale mapping, Nepali Folk & Classical Raga definitions,
 * and Madal/Tabla Taal rhythm patterns for SargamPad Harmonium.
 */

export interface NoteDefinition {
  midi: number;
  westernName: string; // e.g., "C3", "C#3"
  pitchClass: number; // 0..11 (C=0)
  isSharp: boolean;
  octave: number; // 3 (Mandra), 4 (Madhya), 5 (Taar)
  saptakName: 'Mandra' | 'Madhya' | 'Taar';
  keyboardShortcut?: string;
}

export interface SwaraInfo {
  short: string; // Sa, r, R, g, G, M, m, P, d, D, n, N
  devanagari: string; // सा, रे॒, रे, ग॒, ग, म, म तीव्र, प, ध॒, ध, नि॒, नि
  fullName: string; // Shadja, Komal Rishabh, Shuddha Rishabh, etc.
  semitonesFromSa: number;
}

export interface RagaSuggestion {
  id: string;
  name: string;
  nepaliTitle: string;
  category: 'Nepali Folk' | 'Hindustani Classical' | 'Himalayan Devotional';
  thaat: string;
  timeOfDay: string;
  mood: string;
  allowedSemitones: number[]; // Semitones relative to Sa (0..11)
  vadiSemitone: number; // Primary dominant note relative to Sa
  samvadiSemitone: number; // Secondary dominant note relative to Sa
  aroha: string;
  avroha: string;
  pakad: string;
  pakadSemitones: { semitone: number; durationMs: number; octaveOffset?: number }[];
  recommendedTaalId: string;
  recommendedTimbre: HarmoniumTimbreId;
  folkContext: string;
}

export type HarmoniumTimbreId = 'classic-reed' | 'sarangi-ensemble' | 'pahadi-folk';

export interface BolStep {
  beatNumber: number; // 1-indexed
  bol: string; // e.g., "Ghin", "Tang", "Dha", "Dhin"
  devanagariBol: string;
  vibhagMarker?: 'X' | '2' | '3' | '0'; // Sam (X), Tali (2,3), Khali (0)
  accent: 'sam' | 'tali' | 'khali' | 'regular';
  strokeType: 'bass-open' | 'treble-ring' | 'both-resonant' | 'closed-crisp' | 'muted-ka';
}

export interface TaalDefinition {
  id: string;
  name: string;
  nepaliName: string;
  instrument: 'madal' | 'tabla';
  beats: number;
  vibhagDivision: string; // e.g. "2 + 2 + 2 + 2" or "3 + 3"
  defaultBpm: number;
  description: string;
  steps: BolStep[];
}

export interface MelodyDemo {
  id: string;
  title: string;
  subtitle: string;
  ragaId: string;
  taalId: string;
  bpm: number;
  notes: { semitone: number; octaveOffset: number; durationMs: number; label: string }[];
}

export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const SWARA_MAP: Record<number, SwaraInfo> = {
  0: { short: 'Sa', devanagari: 'S', fullName: 'Shadja (Sa)', semitonesFromSa: 0 },
  1: { short: 're', devanagari: 'r', fullName: 'Komal Rishabh', semitonesFromSa: 1 },
  2: { short: 'Re', devanagari: 'R', fullName: 'Shuddha Rishabh', semitonesFromSa: 2 },
  3: { short: 'ga', devanagari: 'g', fullName: 'Komal Gandhar', semitonesFromSa: 3 },
  4: { short: 'Ga', devanagari: 'G', fullName: 'Shuddha Gandhar', semitonesFromSa: 4 },
  5: { short: 'Ma', devanagari: 'M', fullName: 'Shuddha Madhyam', semitonesFromSa: 5 },
  6: { short: 'Ma#', devanagari: 'M#', fullName: 'Teevra Madhyam', semitonesFromSa: 6 },
  7: { short: 'Pa', devanagari: 'P', fullName: 'Pancham (Pa)', semitonesFromSa: 7 },
  8: { short: 'dha', devanagari: 'd', fullName: 'Komal Dhaivat', semitonesFromSa: 8 },
  9: { short: 'Dha', devanagari: 'D', fullName: 'Shuddha Dhaivat', semitonesFromSa: 9 },
  10: { short: 'ni', devanagari: 'n', fullName: 'Komal Nishad', semitonesFromSa: 10 },
  11: { short: 'Ni', devanagari: 'N', fullName: 'Shuddha Nishad', semitonesFromSa: 11 },
};

// Keyboard shortcut mapping for desktop / Lenovo Pad physical keyboard dock
const KEYBOARD_SHORTCUT_BY_MIDI: Record<number, string> = {
  55: 'Z', // G3
  57: 'X', // A3
  59: 'C', // B3
  60: 'A', // C4 (Middle Sa default)
  61: 'W', // C#4
  62: 'S', // D4
  63: 'E', // D#4
  64: 'D', // E4
  65: 'F', // F4
  66: 'T', // F#4
  67: 'G', // G4
  68: 'Y', // G#4
  69: 'H', // A4
  70: 'U', // A#4
  71: 'J', // B4
  72: 'K', // C5
  73: 'O', // C#5
  74: 'L', // D5
  75: 'P', // D#5
  76: ';', // E5
  77: "'", // F5
};

/**
 * Generates the harmonium key range.
 * - 'pad-24': 24 keys (F3 to E5, MIDI 53 to 76) optimized for wide multi-touch on Lenovo Pad
 * - 'concert-32': 32 keys (C3 to G5, MIDI 48 to 79) full 2.5+ octave harmonium range
 */
export function generateHarmoniumKeys(layoutMode: 'pad-24' | 'concert-32' = 'pad-24'): NoteDefinition[] {
  const startMidi = layoutMode === 'pad-24' ? 53 : 48; // F3 (53) or C3 (48)
  const endMidi = layoutMode === 'pad-24' ? 76 : 79; // E5 (76) or G5 (79)
  const keys: NoteDefinition[] = [];

  for (let midi = startMidi; midi <= endMidi; midi++) {
    const pitchClass = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    const noteName = PITCH_CLASS_NAMES[pitchClass];
    const isSharp = noteName.includes('#');
    const saptakName: 'Mandra' | 'Madhya' | 'Taar' =
      octave <= 3 ? 'Mandra' : octave === 4 ? 'Madhya' : 'Taar';

    keys.push({
      midi,
      westernName: `${noteName}${octave}`,
      pitchClass,
      isSharp,
      octave,
      saptakName,
      keyboardShortcut: KEYBOARD_SHORTCUT_BY_MIDI[midi],
    });
  }

  return keys;
}

/**
 * Computes exact frequency in Hz for a MIDI note, supporting 440Hz or 432Hz reference tuning
 * and subtle Just Intonation / Harmonium temperament option.
 */
export function midiToFrequency(
  midi: number,
  a4ReferenceHz: number = 440,
  rootPitchClass: number = 0,
  useHarmoniumJustIntonation: boolean = true
): number {
  if (!useHarmoniumJustIntonation) {
    return Number((a4ReferenceHz * Math.pow(2, (midi - 69) / 12)).toFixed(2));
  }

  // Indian/Nepali reed harmonium subtle sweetening ratios relative to Sa (rootPitchClass)
  const semitonesFromSa = ((midi % 12) - rootPitchClass + 12) % 12;
  const centOffsets = [0, -8, +4, +15, -14, -2, -10, +2, +14, -16, +18, -12];
  const centAdjust = centOffsets[semitonesFromSa] ?? 0;
  const adjustedMidi = midi + centAdjust / 100;
  return Number((a4ReferenceHz * Math.pow(2, (adjustedMidi - 69) / 12)).toFixed(2));
}

/**
 * Returns the Sargam Swara info for any MIDI note given the selected Root Pitch (Sa = 0..11).
 */
export function getSwaraForMidi(midi: number, rootPitchClass: number = 0): SwaraInfo & { saptakDot: 'low' | 'mid' | 'high' } {
  const semitone = ((midi % 12) - rootPitchClass + 12) % 12;
  const baseSwara = SWARA_MAP[semitone];
  // Middle Sa is around MIDI 60 + rootPitchClass
  const relativeMidi = midi - (60 + rootPitchClass);
  const saptakDot: 'low' | 'mid' | 'high' =
    relativeMidi < 0 ? 'low' : relativeMidi >= 12 ? 'high' : 'mid';

  return {
    ...baseSwara,
    saptakDot,
  };
}

/**
 * Checks whether a MIDI note belongs to the active Raga's allowed scale degrees,
 * and whether it is the Vadi (king note) or Samvadi (queen note).
 */
export function evaluateKeyInRaga(
  midi: number,
  rootPitchClass: number,
  raga: RagaSuggestion
): {
  inRaga: boolean;
  isSa: boolean;
  isVadi: boolean;
  isSamvadi: boolean;
  semitoneFromSa: number;
} {
  const semitoneFromSa = ((midi % 12) - rootPitchClass + 12) % 12;
  const inRaga = raga.allowedSemitones.includes(semitoneFromSa);
  return {
    inRaga,
    isSa: semitoneFromSa === 0,
    isVadi: semitoneFromSa === raga.vadiSemitone,
    isSamvadi: semitoneFromSa === raga.samvadiSemitone,
    semitoneFromSa,
  };
}

export const RAGA_SUGGESTIONS: RagaSuggestion[] = [
  {
    id: 'jhyaure-pahadi',
    name: 'Pahadi Jhyaure Dhun',
    nepaliTitle: 'Himalayan Lok Bhaka',
    category: 'Nepali Folk',
    thaat: 'Bilawal / Khamaj Folk',
    timeOfDay: 'All Day · Festive & Folk',
    mood: 'Lively Himalayan breeze, evocative of Sarangi & Madal ensembles (Resham Firiri)',
    allowedSemitones: [0, 2, 4, 5, 7, 9, 10, 11],
    vadiSemitone: 7, // Pa
    samvadiSemitone: 0, // Sa
    aroha: "Sa Re Ga Pa Dha Sa'",
    avroha: "Sa' ni Dha Pa Ma Ga Re Sa",
    pakad: 'Sa Re Ga Pa, Dha Pa Ga Re, Ga Re Sa .Dha .Pa Sa',
    pakadSemitones: [
      { semitone: 0, durationMs: 360 },
      { semitone: 2, durationMs: 360 },
      { semitone: 4, durationMs: 480 },
      { semitone: 7, durationMs: 540 },
      { semitone: 9, durationMs: 360 },
      { semitone: 7, durationMs: 420 },
      { semitone: 4, durationMs: 360 },
      { semitone: 2, durationMs: 360 },
      { semitone: 0, durationMs: 700 },
    ],
    recommendedTaalId: 'khyali-madal',
    recommendedTimbre: 'sarangi-ensemble',
    folkContext: 'Signature scale of Nepali folk classics, Gandharva Sarangi ballads, and hill dances.',
  },
  {
    id: 'raga-yaman',
    name: 'Raga Yaman',
    nepaliTitle: 'Kalyan Thaat · Evening',
    category: 'Hindustani Classical',
    thaat: 'Kalyan',
    timeOfDay: 'Evening · First Prahar',
    mood: 'Serene, auspicious, deeply devotional and romantic',
    allowedSemitones: [0, 2, 4, 6, 7, 9, 11],
    vadiSemitone: 4, // Ga
    samvadiSemitone: 11, // Ni
    aroha: ".Ni Re Ga Ma# Dha Ni Sa'",
    avroha: "Sa' Ni Dha Pa Ma# Ga Re Sa",
    pakad: '.Ni Re Ga Re, Pa Ma# Ga Re, .Ni Re Sa',
    pakadSemitones: [
      { semitone: 11, octaveOffset: -1, durationMs: 420 },
      { semitone: 2, durationMs: 420 },
      { semitone: 4, durationMs: 580 },
      { semitone: 6, durationMs: 420 },
      { semitone: 7, durationMs: 520 },
      { semitone: 6, durationMs: 380 },
      { semitone: 4, durationMs: 480 },
      { semitone: 2, durationMs: 420 },
      { semitone: 0, durationMs: 750 },
    ],
    recommendedTaalId: 'teentaal-tabla',
    recommendedTimbre: 'classic-reed',
    folkContext: 'Essential foundation raga for classical harmonium mastery, ghazals, and evening bhajans.',
  },
  {
    id: 'raga-bhupali',
    name: 'Raga Bhupali',
    nepaliTitle: 'Audav Pentatonic',
    category: 'Hindustani Classical',
    thaat: 'Kalyan (Audav Pentatonic)',
    timeOfDay: 'Early Night',
    mood: 'Pure, noble, expansive pentatonic calm',
    allowedSemitones: [0, 2, 4, 7, 9],
    vadiSemitone: 4, // Ga
    samvadiSemitone: 9, // Dha
    aroha: "Sa Re Ga Pa Dha Sa'",
    avroha: "Sa' Dha Pa Ga Re Sa",
    pakad: 'Ga Re Sa .Dha, Sa Re Ga, Pa Ga Dha Pa Ga Re Sa',
    pakadSemitones: [
      { semitone: 0, durationMs: 380 },
      { semitone: 2, durationMs: 380 },
      { semitone: 4, durationMs: 520 },
      { semitone: 7, durationMs: 460 },
      { semitone: 9, durationMs: 520 },
      { semitone: 7, durationMs: 400 },
      { semitone: 4, durationMs: 440 },
      { semitone: 2, durationMs: 380 },
      { semitone: 0, durationMs: 720 },
    ],
    recommendedTaalId: 'keherwa-tabla',
    recommendedTimbre: 'pahadi-folk',
    folkContext: 'Universally beloved five-note scale shared between classical Raga Bhupali and eastern hill melodies.',
  },
  {
    id: 'maruni-sorathi',
    name: 'Maruni & Sorathi Raga',
    nepaliTitle: 'Magar & Gurung Folk',
    category: 'Nepali Folk',
    thaat: 'Kafi / Folk Modal',
    timeOfDay: 'Twilight & Cultural Gatherings',
    mood: 'Soulful, resonant, narrative storytelling with Komal Ga and Komal Ni',
    allowedSemitones: [0, 2, 3, 5, 7, 9, 10],
    vadiSemitone: 7, // Pa
    samvadiSemitone: 2, // Re
    aroha: "Sa Re ga Ma Pa Dha ni Sa'",
    avroha: "Sa' ni Dha Pa Ma ga Re Sa",
    pakad: 'Sa Re ga Ma Pa, Dha ni Dha Pa, Ma ga Re Sa',
    pakadSemitones: [
      { semitone: 0, durationMs: 400 },
      { semitone: 2, durationMs: 380 },
      { semitone: 3, durationMs: 520 },
      { semitone: 5, durationMs: 400 },
      { semitone: 7, durationMs: 560 },
      { semitone: 5, durationMs: 380 },
      { semitone: 3, durationMs: 450 },
      { semitone: 2, durationMs: 380 },
      { semitone: 0, durationMs: 700 },
    ],
    recommendedTaalId: 'jhyaure-madal',
    recommendedTimbre: 'sarangi-ensemble',
    folkContext: 'Played during traditional Magar and Gurung Sorathi/Maruni dances with rich Madal and Sarangi accompaniment.',
  },
  {
    id: 'raga-bhairavi',
    name: 'Raga Bhairavi',
    nepaliTitle: 'Morning Devotional',
    category: 'Himalayan Devotional',
    thaat: 'Bhairavi',
    timeOfDay: 'Dawn · Finale Raga',
    mood: 'Deeply compassionate, spiritual, transcendent morning devotion',
    allowedSemitones: [0, 1, 3, 5, 7, 8, 10],
    vadiSemitone: 5, // Ma
    samvadiSemitone: 0, // Sa
    aroha: "Sa re ga Ma Pa dha ni Sa'",
    avroha: "Sa' ni dha Pa Ma ga re Sa",
    pakad: 'Ma ga re Sa, .dha .ni Sa, ga Ma dha Pa ga re Sa',
    pakadSemitones: [
      { semitone: 0, durationMs: 420 },
      { semitone: 1, durationMs: 420 },
      { semitone: 3, durationMs: 500 },
      { semitone: 5, durationMs: 540 },
      { semitone: 3, durationMs: 400 },
      { semitone: 1, durationMs: 440 },
      { semitone: 0, durationMs: 760 },
    ],
    recommendedTaalId: 'dadra-tabla',
    recommendedTimbre: 'classic-reed',
    folkContext: 'Revered across Nepal and India for temple bhajans, thumri, and concluding concert performances.',
  },
  {
    id: 'raga-desh',
    name: 'Raga Desh (Malhar)',
    nepaliTitle: 'Festive Monsoon Scale',
    category: 'Hindustani Classical',
    thaat: 'Khamaj',
    timeOfDay: 'Late Evening · Monsoon',
    mood: 'Joyful, lyrical, celebratory rain and harvest mood',
    allowedSemitones: [0, 2, 4, 5, 7, 9, 10, 11],
    vadiSemitone: 2, // Re
    samvadiSemitone: 7, // Pa
    aroha: "Sa Re Ma Pa Ni Sa'",
    avroha: "Sa' ni Dha Pa, Dha Ma Ga Re, Ga .Ni Sa",
    pakad: 'Re Ma Pa Ni Dha Pa, Ma Ga Re, Ga .Ni Sa',
    pakadSemitones: [
      { semitone: 2, durationMs: 420 },
      { semitone: 5, durationMs: 420 },
      { semitone: 7, durationMs: 520 },
      { semitone: 10, durationMs: 380 },
      { semitone: 9, durationMs: 380 },
      { semitone: 7, durationMs: 460 },
      { semitone: 5, durationMs: 380 },
      { semitone: 4, durationMs: 420 },
      { semitone: 2, durationMs: 420 },
      { semitone: 0, durationMs: 720 },
    ],
    recommendedTaalId: 'keherwa-tabla',
    recommendedTimbre: 'pahadi-folk',
    folkContext: 'Bridges light-classical compositions with festive Nepali Asare and Teej seasonal melodies.',
  },
];

export const TAAL_DEFINITIONS: TaalDefinition[] = [
  {
    id: 'khyali-madal',
    name: 'Khyali / Samala Taal (Madal)',
    nepaliName: 'Nepali Madal · 8 Matras',
    instrument: 'madal',
    beats: 8,
    vibhagDivision: '4 + 4',
    defaultBpm: 108,
    description: 'Classic 8-beat Nepali Madal folk groove used in Resham Firiri and Lok Dohori.',
    steps: [
      { beatNumber: 1, bol: 'Ghin', devanagariBol: 'Bass+Ring', vibhagMarker: 'X', accent: 'sam', strokeType: 'both-resonant' },
      { beatNumber: 2, bol: 'Na', devanagariBol: 'Open Ring', accent: 'regular', strokeType: 'treble-ring' },
      { beatNumber: 3, bol: 'Ghin', devanagariBol: 'Bass Open', accent: 'regular', strokeType: 'bass-open' },
      { beatNumber: 4, bol: 'Tang', devanagariBol: 'Khari Ring', accent: 'regular', strokeType: 'treble-ring' },
      { beatNumber: 5, bol: 'Na', devanagariBol: 'Crisp Rim', vibhagMarker: '0', accent: 'khali', strokeType: 'closed-crisp' },
      { beatNumber: 6, bol: 'Ti', devanagariBol: 'Muted Tap', accent: 'regular', strokeType: 'muted-ka' },
      { beatNumber: 7, bol: 'Na', devanagariBol: 'Open Ring', accent: 'regular', strokeType: 'treble-ring' },
      { beatNumber: 8, bol: 'Dhin', devanagariBol: 'Full Bass', accent: 'regular', strokeType: 'bass-open' },
    ],
  },
  {
    id: 'jhyaure-madal',
    name: 'Jhyaure Taal (Madal)',
    nepaliName: 'Nepali Madal · 6 Matras',
    instrument: 'madal',
    beats: 6,
    vibhagDivision: '3 + 3',
    defaultBpm: 124,
    description: 'Energetic 6/8 Himalayan folk pulse driving traditional Jhyaure dances.',
    steps: [
      { beatNumber: 1, bol: 'Ghin', devanagariBol: 'Bass+Ring', vibhagMarker: 'X', accent: 'sam', strokeType: 'both-resonant' },
      { beatNumber: 2, bol: '—', devanagariBol: 'Pulse', accent: 'regular', strokeType: 'muted-ka' },
      { beatNumber: 3, bol: 'NaTi', devanagariBol: 'Double Tap', accent: 'regular', strokeType: 'closed-crisp' },
      { beatNumber: 4, bol: 'Na', devanagariBol: 'Open Ring', vibhagMarker: '0', accent: 'khali', strokeType: 'treble-ring' },
      { beatNumber: 5, bol: 'Ghin', devanagariBol: 'Bass Open', accent: 'regular', strokeType: 'bass-open' },
      { beatNumber: 6, bol: 'Tang', devanagariBol: 'Khari Ring', accent: 'regular', strokeType: 'treble-ring' },
    ],
  },
  {
    id: 'keherwa-tabla',
    name: 'Keherwa Taal (Tabla)',
    nepaliName: 'Classical Tabla · 8 Matras',
    instrument: 'tabla',
    beats: 8,
    vibhagDivision: '4 + 4',
    defaultBpm: 100,
    description: 'Versatile 8-beat Tabla cycle ideal for bhajans, ghazals, and folk-classical fusion.',
    steps: [
      { beatNumber: 1, bol: 'Dha', devanagariBol: 'Both Open', vibhagMarker: 'X', accent: 'sam', strokeType: 'both-resonant' },
      { beatNumber: 2, bol: 'Ge', devanagariBol: 'Bayan Bass', accent: 'regular', strokeType: 'bass-open' },
      { beatNumber: 3, bol: 'Na', devanagariBol: 'Dayan Rim', accent: 'regular', strokeType: 'treble-ring' },
      { beatNumber: 4, bol: 'Ti', devanagariBol: 'Syahi Tap', accent: 'regular', strokeType: 'closed-crisp' },
      { beatNumber: 5, bol: 'Na', devanagariBol: 'Dayan Rim', vibhagMarker: '0', accent: 'khali', strokeType: 'treble-ring' },
      { beatNumber: 6, bol: 'Ka', devanagariBol: 'Flat Slap', accent: 'regular', strokeType: 'muted-ka' },
      { beatNumber: 7, bol: 'Dhi', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 8, bol: 'Na', devanagariBol: 'Dayan Rim', accent: 'regular', strokeType: 'treble-ring' },
    ],
  },
  {
    id: 'dadra-tabla',
    name: 'Dadra Taal (Tabla)',
    nepaliName: 'Classical Tabla · 6 Matras',
    instrument: 'tabla',
    beats: 6,
    vibhagDivision: '3 + 3',
    defaultBpm: 96,
    description: 'Graceful 6-beat cycle suited for light classical, thumri, and devotional songs.',
    steps: [
      { beatNumber: 1, bol: 'Dha', devanagariBol: 'Both Open', vibhagMarker: 'X', accent: 'sam', strokeType: 'both-resonant' },
      { beatNumber: 2, bol: 'Dhin', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 3, bol: 'Na', devanagariBol: 'Dayan Rim', accent: 'regular', strokeType: 'treble-ring' },
      { beatNumber: 4, bol: 'Dha', devanagariBol: 'Open Ring', vibhagMarker: '0', accent: 'khali', strokeType: 'treble-ring' },
      { beatNumber: 5, bol: 'Tun', devanagariBol: 'Bell Tone', accent: 'regular', strokeType: 'closed-crisp' },
      { beatNumber: 6, bol: 'Na', devanagariBol: 'Dayan Rim', accent: 'regular', strokeType: 'treble-ring' },
    ],
  },
  {
    id: 'teentaal-tabla',
    name: 'Teentaal (Classical Tabla)',
    nepaliName: 'Classical Tabla · 16 Matras',
    instrument: 'tabla',
    beats: 16,
    vibhagDivision: '4 + 4 + 4 + 4',
    defaultBpm: 116,
    description: 'The sovereign 16-beat classical Tabla cycle with Sam (1), Tali (5, 13), and Khali (9).',
    steps: [
      { beatNumber: 1, bol: 'Dha', devanagariBol: 'Sam (X)', vibhagMarker: 'X', accent: 'sam', strokeType: 'both-resonant' },
      { beatNumber: 2, bol: 'Dhin', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 3, bol: 'Dhin', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 4, bol: 'Dha', devanagariBol: 'Both Open', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 5, bol: 'Dha', devanagariBol: 'Tali (2)', vibhagMarker: '2', accent: 'tali', strokeType: 'both-resonant' },
      { beatNumber: 6, bol: 'Dhin', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 7, bol: 'Dhin', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 8, bol: 'Dha', devanagariBol: 'Both Open', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 9, bol: 'Dha', devanagariBol: 'Khali (0)', vibhagMarker: '0', accent: 'khali', strokeType: 'treble-ring' },
      { beatNumber: 10, bol: 'Tin', devanagariBol: 'Maidan', accent: 'regular', strokeType: 'closed-crisp' },
      { beatNumber: 11, bol: 'Tin', devanagariBol: 'Maidan', accent: 'regular', strokeType: 'closed-crisp' },
      { beatNumber: 12, bol: 'Ta', devanagariBol: 'Dayan Rim', accent: 'regular', strokeType: 'treble-ring' },
      { beatNumber: 13, bol: 'Ta', devanagariBol: 'Tali (3)', vibhagMarker: '3', accent: 'tali', strokeType: 'treble-ring' },
      { beatNumber: 14, bol: 'Dhin', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 15, bol: 'Dhin', devanagariBol: 'Resonant', accent: 'regular', strokeType: 'both-resonant' },
      { beatNumber: 16, bol: 'Dha', devanagariBol: 'Both Open', accent: 'regular', strokeType: 'both-resonant' },
    ],
  },
];

export const MELODY_DEMOS: MelodyDemo[] = [
  {
    id: 'resham-firiri',
    title: 'Resham Firiri (Nepali Folk Classic)',
    subtitle: 'Traditional Pahadi Jhyaure melody for Harmonium, Sarangi & Madal',
    ragaId: 'jhyaure-pahadi',
    taalId: 'khyali-madal',
    bpm: 112,
    notes: [
      { semitone: 0, octaveOffset: 0, durationMs: 320, label: 'Sa' },
      { semitone: 2, octaveOffset: 0, durationMs: 320, label: 'Re' },
      { semitone: 4, octaveOffset: 0, durationMs: 480, label: 'Ga' },
      { semitone: 7, octaveOffset: 0, durationMs: 480, label: 'Pa' },
      { semitone: 4, octaveOffset: 0, durationMs: 320, label: 'Ga' },
      { semitone: 2, octaveOffset: 0, durationMs: 320, label: 'Re' },
      { semitone: 0, octaveOffset: 0, durationMs: 640, label: 'Sa' },
      { semitone: 9, octaveOffset: 0, durationMs: 420, label: 'Dha' },
      { semitone: 7, octaveOffset: 0, durationMs: 420, label: 'Pa' },
      { semitone: 4, octaveOffset: 0, durationMs: 360, label: 'Ga' },
      { semitone: 2, octaveOffset: 0, durationMs: 360, label: 'Re' },
      { semitone: 0, octaveOffset: 0, durationMs: 720, label: 'Sa' },
    ],
  },
  {
    id: 'yaman-gat',
    title: 'Raga Yaman Bandish Lehra',
    subtitle: 'Classical evening phrase featuring Teevra Madhyam (Ma#)',
    ragaId: 'raga-yaman',
    taalId: 'teentaal-tabla',
    bpm: 116,
    notes: [
      { semitone: 11, octaveOffset: -1, durationMs: 380, label: 'Nị' },
      { semitone: 2, octaveOffset: 0, durationMs: 380, label: 'Re' },
      { semitone: 4, octaveOffset: 0, durationMs: 520, label: 'Ga' },
      { semitone: 6, octaveOffset: 0, durationMs: 400, label: 'Ma#' },
      { semitone: 7, octaveOffset: 0, durationMs: 520, label: 'Pa' },
      { semitone: 6, octaveOffset: 0, durationMs: 380, label: 'Ma#' },
      { semitone: 4, octaveOffset: 0, durationMs: 460, label: 'Ga' },
      { semitone: 2, octaveOffset: 0, durationMs: 380, label: 'Re' },
      { semitone: 0, octaveOffset: 0, durationMs: 700, label: 'Sa' },
    ],
  },
];
