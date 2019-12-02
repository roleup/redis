import Promise from 'bluebird';
import { expect } from 'chai';
import { config } from 'dotenv';
import { Cached, Redis } from 'index';

config();

describe('cached integration tests', () => {
  let redis;

  beforeEach(async () => {
    redis = new Redis({
      // eslint-disable-next-line no-process-env
      host: process.env.REDIS_HOST,
      // eslint-disable-next-line no-process-env
      port: process.env.REDIS_PORT,
    });

    await redis.flushdb();
  });

  after(async () => {
    // eslint-disable-next-line no-unused-expressions
    redis && (await redis.disconnect());
  });

  it('set and get values in cache', async () => {
    const cached = new Cached<string>(
      { redis },
      { prefix: 'something', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar');
    expect(await cached.cache.get('foo')).to.eql('bar');
  });

  it('honors prefix', async () => {
    const cached = new Cached<string>(
      { redis },
      { prefix: 'something', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );
    const otherCached = new Cached<string>(
      { redis },
      { prefix: 'something-else', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar');
    expect(await otherCached.cache.get('foo')).to.eql(null);
  });

  it('expires', async () => {
    const cached = new Cached<string>(
      { redis },
      { prefix: 'something', ttlSec: 1, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar');
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(await cached.cache.get('foo')).to.eql(null);
  });

  it('expires with overridden ttl', async () => {
    const cached = new Cached<string>(
      { redis },
      { prefix: 'something', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar', 1);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(await cached.cache.get('foo')).to.eql(null);
  });

  it('deletes', async () => {
    const cached = new Cached<string>(
      { redis },
      { prefix: 'something', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar');
    await cached.cache.del('foo');
    expect(await cached.cache.get('foo')).to.eql(null);
  });

  it('invalidates', async () => {
    const cached = new Cached<string>(
      { redis },
      { prefix: 'something', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );
    const otherCached = new Cached<string>(
      { redis },
      { prefix: 'something-else', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar1');
    await otherCached.cache.set('foo', 'bar2');

    await cached.cache.invalidate();

    expect(await cached.cache.get('foo')).to.eql(null);
    expect(await otherCached.cache.get('foo')).to.eql('bar2');
  });

  it('wraps class nicely', async () => {
    class Foo extends Cached<string> {
      constructor() {
        super({ redis }, { prefix: 'something', ttlSec: 10, parseFromCache: (result) => result, stringifyForCache: (result) => result });
      }

      async set(key, value) {
        await this.cache.set(key, value);
      }

      async get(key) {
        return this.cache.get(key);
      }
    }

    const foo = new Foo();

    await foo.set('foo', 'bar');
    expect(await foo.get('foo')).to.eql('bar');
  });

  it('with bad connection, get returns null', async () => {
    const notHereRedis = new Redis('not-here:6379', { enableOfflineQueue: false });
    const cached = new Cached<string>(
      { redis: notHereRedis },
      { prefix: 'something', ttlSec: 1, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar');
    expect(await cached.cache.get('foo')).to.eql(null);
    notHereRedis.disconnect();
  });

  it('with bad connection, invalidate on reconnection', async () => {
    const cached = new Cached<string>(
      { redis },
      { prefix: 'something', ttlSec: 1, parseFromCache: (result) => result, stringifyForCache: (result) => result }
    );

    await cached.cache.set('foo', 'bar');
    expect(await cached.cache.get('foo')).to.eql('bar');

    const oldSetex = redis.setex;
    // eslint-disable-next-line prettier/prettier
    redis.setex = () => Promise.reject(new Error('stream isn\'t writeable'));

    await cached.cache.set('foo', 'bar');
    expect(await cached.cache.get('foo')).to.eql(null);
    expect(await cached.cache.get('foo')).to.eql(null);

    redis.setex = oldSetex;

    await cached.cache.set('foo', 'bar');
    expect(await cached.cache.get('foo')).to.eql('bar');
  });
});
