const { generateTokens } = require('../../src/modules/auth/auth.helper');

describe('Auth Helpers', () => {
  it('should generate access and refresh tokens for a user', () => {
    const user = { id: '123', role: 'customer' };
    const tokens = generateTokens(user);

    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
  });
});
