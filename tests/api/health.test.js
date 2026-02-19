const request = require('supertest');

jest.mock('../../src/client-manager');

const { isMultiClientMode } = require('../../src/client-manager');

const app = require('../../server');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /api/health', () => {
    it('returns ok status in multi-client mode', async () => {
        isMultiClientMode.mockResolvedValue(true);

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.status).toBe('ok');
        expect(res.body.mode).toBe('multi-client');
    });

    it('returns ok status in single-client mode', async () => {
        isMultiClientMode.mockResolvedValue(false);

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.status).toBe('ok');
        expect(res.body.mode).toBe('single-client');
    });

    it('reports geminiConfigured based on env var', async () => {
        isMultiClientMode.mockResolvedValue(true);
        const original = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'test-key';

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.geminiConfigured).toBe(true);

        // Restore
        if (original === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = original;
        }
    });

    it('reports geminiConfigured false when key is missing', async () => {
        isMultiClientMode.mockResolvedValue(true);
        const original = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.geminiConfigured).toBe(false);

        // Restore
        if (original !== undefined) {
            process.env.GEMINI_API_KEY = original;
        }
    });
});
