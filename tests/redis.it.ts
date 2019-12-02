/* eslint-disable no-process-env, no-unused-expressions */

import Promise from 'bluebird';
import { expect } from 'chai';
import { config } from 'dotenv';
import { Redis } from 'index';
import uuid from 'uuid/v4';

config();
describe('integration tests', () => {
  let redis = null as null | Redis;

  afterEach(async () => {
    redis && (await redis.flushdb());
    redis && (await redis.disconnect());
  });

  it('gets lock', async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    });

    const lockId = uuid();

    const lock = await redis.lock(lockId, 30);
    expect(lock).not.to.eql(null);

    const otherLock = await redis.lock(lockId, 30);
    expect(otherLock).to.eql(null);

    // @ts-ignore
    await lock.unlock();

    const lastLock = await redis.lock(lockId, 30);
    expect(lastLock).not.to.eql(null);
  });

  it('debounces many calls using redis', async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    });

    let counter = 0;
    const updateCounter = () => ++counter;

    let calls = 0;
    const totalCalls = 100;

    const times = [...new Array(totalCalls).keys()];
    const timeoutMs = 500;
    await Promise.map(
      times,
      async () => {
        calls++;
        // @ts-ignore
        await redis.debounce(updateCounter, 'foo', timeoutMs);
        await Promise.delay(50);
      },
      { concurrency: 10 }
    );

    await Promise.delay(timeoutMs * 2);

    expect(calls).to.eql(totalCalls);
    expect(counter).to.eql(3);
  });
});
