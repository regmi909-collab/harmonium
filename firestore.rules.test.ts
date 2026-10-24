/**
 * Firestore Security Rules Verification Specification
 * Verifies all 12 "Dirty Dozen" payloads result in PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    path: '/users/user_1/settings/preferences',
    operation: 'create',
    auth: null,
    payload: { ownerId: 'user_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    path: '/users/user_1/settings/preferences',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: false },
    payload: { ownerId: 'user_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User Read',
    path: '/users/user_1/presets/preset_1',
    operation: 'get',
    auth: { uid: 'user_2', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Owner Field Spoofing',
    path: '/users/user_1/presets/preset_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2', name: 'My Preset' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Ghost Field Injection',
    path: '/users/user_1/settings/preferences',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Path ID Poisoning',
    path: '/users/user_1/presets/invalid$id!',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', name: 'Valid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Oversized Preset Name (> 60 chars)',
    path: '/users/user_1/presets/preset_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', name: 'A'.repeat(100) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Invalid Enum Value for reedMode',
    path: '/users/user_1/settings/preferences',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', reedMode: 'triple' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Out-of-Range Numeric Value for octave',
    path: '/users/user_1/settings/preferences',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', octave: 99 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Forged Client Timestamp on Create',
    path: '/users/user_1/presets/preset_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Mutating Immutable createdAt on Update',
    path: '/users/user_1/presets/preset_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '2025-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Mutating Immutable ownerId on Update',
    path: '/users/user_1/settings/preferences',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2' },
    expected: 'PERMISSION_DENIED',
  },
];
