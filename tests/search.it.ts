import { expect } from 'chai';
import { config } from 'dotenv';
import { Search } from 'index';

config();
describe('search integration tests', () => {
  let redis = null as Search | null;

  afterEach(async () => {
    // eslint-disable-next-line no-unused-expressions
    redis && (await redis.flushdb());
    // eslint-disable-next-line no-unused-expressions
    redis && (await redis.disconnect());
  });

  it('creates index', async () => {
    redis = new Search({
      // eslint-disable-next-line no-process-env
      host: process.env.REDIS_HOST,
      // eslint-disable-next-line no-process-env
      port: process.env.REDIS_PORT,
    });

    expect(await redis.indexExists('some-index')).to.eql(false);
    await redis.createIndex('some-index', { thing: { type: 'text' } });
    expect(await redis.indexExists('some-index')).to.eql(true);
  });

  it('adds document to index', async () => {
    redis = new Search({
      // eslint-disable-next-line no-process-env
      host: process.env.REDIS_HOST,
      // eslint-disable-next-line no-process-env
      port: process.env.REDIS_PORT,
    });

    await redis.createIndex('some-index', { thing: { type: 'text' } });
    await redis.addToIndex('some-index', '123', {
      thing: 'something good',
      other: 'this wont be dropped',
    });
    await redis.addToIndex('some-index', '124', {
      thing: 'something else',
      other: 'this wont be dropped',
    });

    let results = await redis.search('some-index', 'something', {
      idOnly: true,
      limit: 1,
    });

    expect(results).to.eql({
      total: 2,
      page: 0,
      results: ['124'],
    });

    results = await redis.search('some-index', 'dropped', {
      idOnly: true,
      limit: 1,
    });

    expect(results).to.eql({
      total: 0,
      page: 0,
      results: [],
    });
  });

  it('adds document to index and searchs with content', async () => {
    redis = new Search({
      // eslint-disable-next-line no-process-env
      host: process.env.REDIS_HOST,
      // eslint-disable-next-line no-process-env
      port: process.env.REDIS_PORT,
    });

    await redis.createIndex('some-index', { thing: { type: 'text' } });
    await redis.addToIndex('some-index', '123', {
      thing: 'something good',
      other: 'this wont be dropped',
    });
    await redis.addToIndex('some-index', '124', {
      thing: 'something else',
      other: 'this wont be dropped',
    });

    const results = await redis.search('some-index', 'something', {
      idOnly: false,
      limit: 1,
    });

    expect(results).to.eql({
      total: 2,
      page: 0,
      results: [
        {
          id: '124',
          thing: 'something else',
          other: 'this wont be dropped',
        },
      ],
    });
  });
});
