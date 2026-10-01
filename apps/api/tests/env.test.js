"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../src/config/env");
describe('Environment Variable Validation', () => {
    it('throws descriptive error on invalid environment configuration', () => {
        expect(() => {
            (0, env_1.validateEnv)({
                JWT_ACCESS_SECRET: 'too-short',
                API_PORT: 'invalid-port',
                WEB_ORIGIN: 'not-a-valid-url',
            });
        }).toThrow(/Environment validation failed:/);
    });
    it('validates and applies defaults for valid environment values', () => {
        const valid = (0, env_1.validateEnv)({
            JWT_ACCESS_SECRET: 'a-valid-access-secret-that-is-at-least-32-chars-long',
            JWT_REFRESH_SECRET: 'a-valid-refresh-secret-that-is-at-least-32-chars-long',
        });
        expect(valid.API_PORT).toBe(4000);
        expect(valid.LLM_PROVIDER).toBe('mock');
        expect(valid.EMBEDDING_PROVIDER).toBe('local');
        expect(valid.NODE_ENV).toBe('development');
    });
});
//# sourceMappingURL=env.test.js.map