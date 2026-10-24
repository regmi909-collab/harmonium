import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const MAX_ID_LENGTH = 128;
export const MAX_PRESET_NAME_LENGTH = 60;

export function isValidIdString(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= MAX_ID_LENGTH &&
    VALID_ID_REGEX.test(id)
  );
}

export interface CloudUserPreferenceInput {
  labelMode: 'none' | 'sargam' | 'western';
  sargamOffset: number;
  octave: number;
  transpose: number;
  volume: number;
  reverbEnabled: boolean;
  reedMode: 'single' | 'double';
  chordMode: 'off' | 'major' | 'minor';
  couplerBass: boolean;
  couplerMale: boolean;
  couplerFemale: boolean;
}

export interface HarmoniumPresetRecord {
  id: string;
  ownerId: string;
  name: string;
  labelMode: 'none' | 'sargam' | 'western';
  sargamOffset: number;
  octave: number;
  transpose: number;
  volume: number;
  reverbEnabled: boolean;
  reedMode: 'single' | 'double';
  couplerBass: boolean;
  couplerMale: boolean;
  couplerFemale: boolean;
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return signOut(auth);
}

export async function saveUserPreferencesToCloud(
  userId: string,
  prefs: CloudUserPreferenceInput
) {
  if (!isValidIdString(userId)) {
    throw new Error('Invalid userId format');
  }

  const path = `users/${userId}/settings/preferences`;
  const payload = {
    ownerId: userId,
    labelMode: prefs.labelMode,
    sargamOffset: Math.min(11, Math.max(0, Math.round(prefs.sargamOffset))),
    octave: Math.min(6, Math.max(2, Math.round(prefs.octave))),
    transpose: Math.min(12, Math.max(-12, Math.round(prefs.transpose))),
    volume: Math.min(1, Math.max(0, Number(prefs.volume))),
    reverbEnabled: Boolean(prefs.reverbEnabled),
    reedMode: prefs.reedMode === 'double' ? 'double' : 'single',
    chordMode:
      prefs.chordMode === 'major' || prefs.chordMode === 'minor'
        ? prefs.chordMode
        : 'off',
    couplerBass: Boolean(prefs.couplerBass),
    couplerMale: Boolean(prefs.couplerMale),
    couplerFemale: Boolean(prefs.couplerFemale),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', userId, 'settings', 'preferences'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveHarmoniumPresetToCloud(
  userId: string,
  presetId: string,
  name: string,
  prefs: Omit<CloudUserPreferenceInput, 'chordMode'>
) {
  if (!isValidIdString(userId) || !isValidIdString(presetId)) {
    throw new Error('Invalid document ID');
  }
  const cleanName = name.trim().slice(0, MAX_PRESET_NAME_LENGTH);
  if (cleanName.length < 1) {
    throw new Error('Preset name cannot be empty');
  }

  const path = `users/${userId}/presets/${presetId}`;
  const payload = {
    ownerId: userId,
    name: cleanName,
    labelMode: prefs.labelMode,
    sargamOffset: Math.min(11, Math.max(0, Math.round(prefs.sargamOffset))),
    octave: Math.min(6, Math.max(2, Math.round(prefs.octave))),
    transpose: Math.min(12, Math.max(-12, Math.round(prefs.transpose))),
    volume: Math.min(1, Math.max(0, Number(prefs.volume))),
    reverbEnabled: Boolean(prefs.reverbEnabled),
    reedMode: prefs.reedMode === 'double' ? 'double' : 'single',
    couplerBass: Boolean(prefs.couplerBass),
    couplerMale: Boolean(prefs.couplerMale),
    couplerFemale: Boolean(prefs.couplerFemale),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', userId, 'presets', presetId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteHarmoniumPresetFromCloud(
  userId: string,
  presetId: string
) {
  if (!isValidIdString(userId) || !isValidIdString(presetId)) {
    throw new Error('Invalid document ID');
  }
  const path = `users/${userId}/presets/${presetId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'presets', presetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
