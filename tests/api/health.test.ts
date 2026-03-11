import request from 'supertest';

jest.mock('../../src/client-manager.js');

import { isMultiClientMode } from '../../src/client-manager.js';

const mockedIsMultiClientMode = jest.mocked(isMultiClientMode);

import app from '../../server.js';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /api/health', () => {
    it('returns ok status in multi-client mode', async () => {
        mockedIsMultiClientMode.mockResolvedValue(true);

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.status).toBe('ok');
        expect(res.body.mode).toBe('multi-client');
    });

    it('returns ok status in single-client mode', async () => {
        mockedIsMultiClientMode.mockResolvedValue(false);

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.status).toBe('ok');
        expect(res.body.mode).toBe('single-client');
    });

    it('reports geminiConfigured based on env var', async () => {
        mockedIsMultiClientMode.mockResolvedValue(true);
        const original = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'test-key';

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.geminiConfigured).toBe(true);

        if (original === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = original;
        }
    });

    it('reports geminiConfigured false when key is missing', async () => {
        mockedIsMultiClientMode.mockResolvedValue(true);
        const original = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;

        const res = await request(app).get('/api/health').expect(200);

        expect(res.body.geminiConfigured).toBe(false);

        if (original !== undefined) {
            process.env.GEMINI_API_KEY = original;
        }
    });
});
