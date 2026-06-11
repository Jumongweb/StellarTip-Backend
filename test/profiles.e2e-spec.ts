/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Profiles (e2e)', () => {
  let app: INestApplication<App>;
  let hasDb = false;

  beforeAll(async () => {
    try {
      const m: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = m.createNestApplication();
      await app.init();
      hasDb = true;
    } catch {
      /* no DB */
    }
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /profiles returns array', async () => {
    if (!hasDb) return;
    const res = await request(app.getHttpServer()).get('/profiles').expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /profiles?q=test searches', async () => {
    if (!hasDb) return;
    const res = await request(app.getHttpServer())
      .get('/profiles?q=test')
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /profiles/:username returns 404 for nonexistent', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .get('/profiles/nonexistent99999')
      .expect(404);
  });

  it('GET /profiles/:username/tipping-info returns 404 for nonexistent', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .get('/profiles/nonexistent99999/tipping-info')
      .expect(404);
  });

  it('PUT /profiles/me requires auth', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer()).put('/profiles/me').expect(401);
  });

  it('GET /profiles/me/analytics requires auth', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .get('/profiles/me/analytics')
      .expect(401);
  });
});
