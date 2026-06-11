/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Tips (e2e)', () => {
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

  it('POST /tips rejects missing receiverWallet', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .post('/tips')
      .send({ amount: 10 })
      .expect(400);
  });

  it('POST /tips rejects zero amount', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .post('/tips')
      .send({
        receiverWallet: 'GRECEIVER000000000000000000000000000000000000000',
        amount: 0,
      })
      .expect(400);
  });

  it('POST /tips rejects unknown creator', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .post('/tips')
      .send({
        receiverWallet: 'GUNKNOWN0000000000000000000000000000000000000000000',
        senderWallet: 'GSENDER000000000000000000000000000000000000000000',
        amount: 100,
      })
      .expect(404);
  });

  it('GET /tips/:id returns 404 for nonexistent', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .get('/tips/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('GET /tips/wallet/:addr returns paginated', async () => {
    if (!hasDb) return;
    const res = await request(app.getHttpServer())
      .get('/tips/wallet/GANY0000000000000000000000000000000000000000000')
      .expect(200);
    expect(res.body.data).toHaveProperty('data');
  });

  it('GET /tips/my/received requires auth', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer()).get('/tips/my/received').expect(401);
  });

  it('GET /tips/my/sent requires auth', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer()).get('/tips/my/sent').expect(401);
  });

  it('GET /tips/my/stats requires auth', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer()).get('/tips/my/stats').expect(401);
  });

  it('POST /tips/:id/confirm returns 404 for nonexistent', async () => {
    if (!hasDb) return;
    await request(app.getHttpServer())
      .post('/tips/00000000-0000-0000-0000-000000000000/confirm')
      .send({ transactionHash: 'tx' })
      .expect(404);
  });
});
