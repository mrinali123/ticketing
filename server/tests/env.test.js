import { describe, it, expect } from 'vitest';
import { findMissingEnv, REQUIRED_ENV } from '../src/config/env.js';

describe('findMissingEnv (startup check)', () => {
  const complete = { MONGO_URI: 'mongodb://x', JWT_SECRET: 'secret', JWT_EXPIRES_IN: '1d' };

  it('requires MONGO_URI, JWT_SECRET and JWT_EXPIRES_IN', () => {
    expect(REQUIRED_ENV).toEqual(['MONGO_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN']);
  });

  it('returns nothing when every variable is set', () => {
    expect(findMissingEnv(REQUIRED_ENV, complete)).toEqual([]);
  });

  it('lists every variable that is missing, empty or only spaces', () => {
    const env = { MONGO_URI: 'mongodb://x', JWT_SECRET: '', JWT_EXPIRES_IN: '   ' };

    expect(findMissingEnv(REQUIRED_ENV, env)).toEqual(['JWT_SECRET', 'JWT_EXPIRES_IN']);
    expect(findMissingEnv(REQUIRED_ENV, {})).toEqual(REQUIRED_ENV);
  });
});
