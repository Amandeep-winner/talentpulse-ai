"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
describe('Health and Observability Endpoints', () => {
    const app = (0, app_1.createApp)();
    it('GET /health returns 200 and valid health schema', async () => {
        const res = await (0, supertest_1.default)(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('uptime');
        expect(typeof res.body.uptime).toBe('number');
    });
    it('GET /ready returns 200 and service readiness', async () => {
        const res = await (0, supertest_1.default)(app).get('/ready');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ready');
        expect(res.body).toHaveProperty('services');
    });
    it('GET /metrics returns 200 and prometheus metrics content', async () => {
        const res = await (0, supertest_1.default)(app).get('/metrics');
        expect(res.status).toBe(200);
        expect(res.text).toContain('talentpulse_');
    });
});
//# sourceMappingURL=health.test.js.map