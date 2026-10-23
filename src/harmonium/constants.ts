export type NoteKey = {
  id: string;
  western: string;
  sargam: string;
  keycap: string;
  midi: number;
  kind: 'white' | 'black';
  whiteIndex: number;
};

export const WESTERN_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SWARAM_NAMES  = ['Sa', 'Reb', 'Re', 'Gab', 'Ga', 'Ma', 'Ma#', 'Pa', 'Dhab', 'Dha', 'Nib', 'Ni'];
const NOTE_ID_PREFIXES = ['c','csharp','d','dsharp','e','f','fsharp','g','gsharp','a','asharp','b'];

// ── Original 23-key layout (MIDI 55–77) ──────────────────────────────────
// White keys : ` Q W E R T Y U I O P [ ] \
// Black keys : 1 2 4 5 7 8 9 - =
const KEYBOARD_LAYOUT: Array<{ midi: number; keycap: string; kind: 'white' | 'black' }> = [
  { midi: 55, keycap: '`',  kind: 'white' }, // G3  Pa
  { midi: 56, keycap: '1',  kind: 'black' }, // G#3 Dha♭
  { midi: 57, keycap: 'Q',  kind: 'white' }, // A3  Dha
  { midi: 58, keycap: '2',  kind: 'black' }, // A#3 Ni♭
  { midi: 59, keycap: 'W',  kind: 'white' }, // B3  Ni
  { midi: 60, keycap: 'E',  kind: 'white' }, // C4  Sa
  { midi: 61, keycap: '4',  kind: 'black' }, // C#4 Re♭
  { midi: 62, keycap: 'R',  kind: 'white' }, // D4  Re
  { midi: 63, keycap: '5',  kind: 'black' }, // D#4 Ga♭
  { midi: 64, keycap: 'T',  kind: 'white' }, // E4  Ga
  { midi: 65, keycap: 'Y',  kind: 'white' }, // F4  Ma
  { midi: 66, keycap: '7',  kind: 'black' }, // F#4 Ma#
  { midi: 67, keycap: 'U',  kind: 'white' }, // G4  Pa
  { midi: 68, keycap: '8',  kind: 'black' }, // G#4 Dha♭
  { midi: 69, keycap: 'I',  kind: 'white' }, // A4  Dha
  { midi: 70, keycap: '9',  kind: 'black' }, // A#4 Ni♭
  { midi: 71, keycap: 'O',  kind: 'white' }, // B4  Ni
  { midi: 72, keycap: 'P',  kind: 'white' }, // C5  Sa
  { midi: 73, keycap: '-',  kind: 'black' }, // C#5 Re♭
  { midi: 74, keycap: '[',  kind: 'white' }, // D5  Re
  { midi: 75, keycap: '=',  kind: 'black' }, // D#5 Ga♭
  { midi: 76, keycap: ']',  kind: 'white' }, // E5  Ga
  { midi: 77, keycap: '\\', kind: 'white' }, // F5  Ma
];

function noteIdFromMidi(midi: number) {
  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_ID_PREFIXES[pitchClass]}${octave}`;
}

let whiteKeyCount = -1;

export const NOTE_KEYS: NoteKey[] = KEYBOARD_LAYOUT.map((note) => {
  if (note.kind === 'white') whiteKeyCount += 1;
  return {
    id: noteIdFromMidi(note.midi),
    western: WESTERN_NAMES[note.midi % 12],
    sargam: SWARAM_NAMES[note.midi % 12],
    keycap: note.keycap,
    midi: note.midi,
    kind: note.kind,
    whiteIndex: whiteKeyCount,
  };
});

/** Minimum rendered width of the full 23-key keyboard (before zoom) */
export const KEYBOARD_BASE_WIDTH = 1020;

/** @deprecated use KEYBOARD_BASE_WIDTH – kept for backward compat */
export const KEYBOARD_MIN_WIDTH = KEYBOARD_BASE_WIDTH;

export const OCTAVE_OPTIONS = [
  { value: 2, shortLabel: '2', description: 'Low' },
  { value: 3, shortLabel: '3', description: 'Warm' },
  { value: 4, shortLabel: '4', description: 'Middle' },
  { value: 5, shortLabel: '5', description: 'Bright' },
  { value: 6, shortLabel: '6', description: 'High' },
] as const;

export function getOctaveOption(value: number) {
  return OCTAVE_OPTIONS.find((o) => o.value === value) ?? OCTAVE_OPTIONS[2];
}

export const WHITE_KEYCAP_HINT = `White keys: ${NOTE_KEYS.filter((n) => n.kind === 'white').map((n) => n.keycap).join(' ')}`;
export const BLACK_KEYCAP_HINT = `Black keys: ${NOTE_KEYS.filter((n) => n.kind === 'black').map((n) => n.keycap).join(' ')}`;

const KEYCAP_LOOKUP = new Map(NOTE_KEYS.map((note) => [note.keycap.toLowerCase(), note]));

export function getNoteKeyByInput(input: string) {
  return KEYCAP_LOOKUP.get(input.toLowerCase()) ?? null;
}

export const KEYBOARD_HELP_GROUPS = [
  {
    title: 'Lower octave',
    description: 'Start here for the softer lower register before the middle range.',
    notes: NOTE_KEYS.slice(0, 5),
  },
  {
    title: 'Middle octave',
    description: 'Easiest range for first-time visitors and daily practice patterns.',
    notes: NOTE_KEYS.slice(5, 17),
  },
  {
    title: 'Upper octave',
    description: 'Use the last keys for ascending phrases and higher melodic runs.',
    notes: NOTE_KEYS.slice(17),
  },
] as const;

export const STORAGE_KEY = 'harmonium-home-controls';

// Zoom config
export const ZOOM_MIN   = 0.45;
export const ZOOM_MAX   = 2.2;
export const ZOOM_STEP  = 0.15;
export const ZOOM_DEFAULT = 1.0;
