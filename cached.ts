import { Cache } from './cache';
import { Redis } from './redis';

/**
 * @class
 */
export class Cached {
  /**
   * @param {Redis} redis
   * @param {string} prefix
   * @param {number} ttlSec
   * @param {boolean} [resetOnReconnection=true] clear the cache when a new connection is made
   */
  constructor(redis: Redis, prefix: string, ttlSec: number, resetOnReconnection = true) {
    this.cache = new Cache(redis, prefix, ttlSec, resetOnReconnection);
  }

  readonly cache: Cache;
}
