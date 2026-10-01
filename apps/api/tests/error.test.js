"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const app_1 = require("../src/app");
const AppError_1 = require("../src/lib/errors/AppError");
const errorHandler_1 = require("../src/middleware/errorHandler");
const requestContext_1 = require("../src/middleware/requestContext");
describe('Error Handling Middleware', () => {
    const app = (0, app_1.createApp)();
    it('GET /api/unknown-route returns 404 in standard error format', async () => {
        const res = await (0, supertest_1.default)(app).get('/api/unknown-route');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toMatchObject({
            code: 'NOT_FOUND',
            message: expect.stringContaining('Route GET /api/unknown-route not found'),
            requestId: expect.any(String),
        });
    });
    it('handles ValidationError with details and requestId', async () => {
        const testApp = (0, express_1.default)();
        testApp.use(requestContext_1.requestContextMiddleware);
        testApp.get('/test-validation-error', () => {
            throw new AppError_1.ValidationError('Invalid request payload', [
                { path: 'email', message: 'Email is required' },
            ]);
        });
        testApp.use(errorHandler_1.errorHandler);
        const res = await (0, supertest_1.default)(testApp).get('/test-validation-error');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request payload',
                details: [{ path: 'email', message: 'Email is required' }],
                requestId: expect.any(String),
            },
        });
    });
    it('handles ForbiddenError with 403 status', async () => {
        const testApp = (0, express_1.default)();
        testApp.use(requestContext_1.requestContextMiddleware);
        testApp.get('/test-forbidden', () => {
            throw new AppError_1.ForbiddenError('Action not permitted for ANALYST role');
        });
        testApp.use(errorHandler_1.errorHandler);
        const res = await (0, supertest_1.default)(testApp).get('/test-forbidden');
        expect(res.status).toBe(403);
        expect(res.body.error).toMatchObject({
            code: 'FORBIDDEN',
            message: 'Action not permitted for ANALYST role',
            requestId: expect.any(String),
        });
    });
});
//# sourceMappingURL=error.test.js.map