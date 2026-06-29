/**
 * @typedef {'customer'|'admin'|'doctor'|'vendor'|'pharmacy'|'lab'|'hospital'} UserRole
 * @typedef {'FREE'|'CARE_PLUS'|'FAMILY_PLUS'} MembershipPlan
 * @typedef {'web'|'android'|'ios'} AuthPlatform
 *
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} [accountId]
 * @property {string} [firebaseUid]
 * @property {string|null} [email]
 * @property {string|null} [phone]
 * @property {string} [name]
 * @property {string|null} [avatar]
 * @property {string|null} [dateOfBirth]
 * @property {string|null} [gender]
 * @property {boolean} [isVerified]
 * @property {UserRole} [role]
 * @property {MembershipPlan} [membershipStatus]
 * @property {string|null} [membershipExpiry]
 *
 * @typedef {Object} AuthTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 *
 * @typedef {Object} FirebaseAuthRequest
 * @property {string} idToken
 * @property {string} [deviceId]
 * @property {AuthPlatform} [platform]
 *
 * @typedef {Object} AuthSessionResponse
 * @property {AuthUser} user
 * @property {string} accessToken
 * @property {string} refreshToken
 */

module.exports = {};
