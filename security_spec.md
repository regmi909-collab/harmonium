# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default Deny**: All paths outside `/users/{userId}/settings/{settingId}` and `/users/{userId}/presets/{presetId}` are strictly denied (`allow read, write: if false`).
2. **Verified Owner Isolation**: Only a signed-in user with `request.auth.token.email_verified == true` and `request.auth.uid == userId` can read or write their own settings and presets.
3. **Path Variable Hardening**: `userId`, `settingId`, and `presetId` must match `^[a-zA-Z0-9_\-]+$` with length `1..128`.
4. **Strict Key & Type Enforcement**:
   - `UserPreference` (`settingId == 'preferences'`) requires exact keys `['ownerId', 'labelMode', 'sargamOffset', 'octave', 'transpose', 'volume', 'reverbEnabled', 'reedMode', 'chordMode', 'couplerBass', 'couplerMale', 'couplerFemale', 'updatedAt']`.
   - `HarmoniumPreset` requires exact keys `['ownerId', 'name', 'labelMode', 'sargamOffset', 'octave', 'transpose', 'volume', 'reverbEnabled', 'reedMode', 'couplerBass', 'couplerMale', 'couplerFemale', 'createdAt', 'updatedAt']`.
5. **Identity & Temporal Integrity**:
   - `ownerId` must equal `request.auth.uid` and is immutable on update.
   - `createdAt` must equal `request.time` on create and is immutable on update.
   - `updatedAt` must equal `request.time` on both create and update.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: Writing to `/users/user_1/settings/preferences` with `auth = null`.
2. **Unverified Email Write**: Writing to `/users/user_1/settings/preferences` with `email_verified = false`.
3. **Cross-User Read/Write (ID Spoofing)**: User `user_2` attempting to read or write `/users/user_1/presets/preset_1`.
4. **Owner Field Spoofing**: User `user_1` writing to `/users/user_1/presets/preset_1` with `ownerId: "user_2"`.
5. **Shadow / Ghost Field Injection**: Including `"isAdmin": true` in `/users/user_1/settings/preferences`.
6. **Path ID Poisoning**: Creating `/users/user_1/presets/invalid$id!@#` with disallowed characters.
7. **Oversized Preset Name (Denial of Wallet)**: Creating a preset with `name` of length 500 (`> 60`).
8. **Invalid Enum Value**: Setting `reedMode: "triple"` or `labelMode: "invalid"`.
9. **Out-of-Range Numeric Value**: Setting `octave: 99` or `volume: -5`.
10. **Forged Client Timestamp on Create**: Setting `createdAt` to a past timestamp instead of `request.time`.
11. **Mutating Immutable `createdAt` on Update**: Updating a preset while changing `createdAt`.
12. **Mutating Immutable `ownerId` on Update**: Updating preferences while changing `ownerId`.
