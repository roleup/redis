import { isInteger, isObject, isString } from 'lodash';

import { Redis } from './redis';

/**
 * @class
 */
export class Cache {
  // This has to be a sufficiently unique string that other prefixes will not include it
  // Adding this to the end of each prefix allows a wildcard delete for invalidating cache
  static readonly PREFIX_TERMINATOR = '--<<$$PRE_TERM$$>>--';

  /**
   * @param {Redis} redis
   * @param {string} prefix
   * @param {number} ttlSec
   * @param {boolean} [resetOnReconnection=true] clear the cache when a new connection is made
   */
  constructor(redis: Redis, prefix: string, ttlSec: number, resetOnReconnection = true) {
    if (!isObject(redis)) {
      throw new TypeError('redis must be an object');
    }

    if (!isString(prefix) || prefix.length === 0) {
      throw new Error('prefix must be a string with length');
    }

    if (!isInteger(ttlSec) || ttlSec <= 0) {
      throw new Error('ttlSec must be an integer gte 0');
    }

    if (prefix.includes(Cache.PREFIX_TERMINATOR)) {
      throw new Error(`prefix cannot include: ${Cache.PREFIX_TERMINATOR}`);
    }

    this.redis = redis;
    this.prefix = prefix + Cache.PREFIX_TERMINATOR;
    this.ttlSec = ttlSec;
    this.invalidateOnConnection = false;
    this.resetOnReconnection = resetOnReconnection;
    this.enabled = true;
  }

  private readonly redis;

  private readonly prefix;

  private readonly ttlSec;

  private enabled: boolean;

  private invalidateOnConnection: boolean;

  private readonly resetOnReconnection: boolean;

  /**
   * Suppress connection errors
   * @param {Error} error
   * @returns {null}
   */
  private suppressConnectionError(error: { message: string }): null {
    // eslint-disable-next-line prettier/prettier
    if (error && error.message && error.message.toLowerCase().includes('stream isn\'t writeable')) {
      this.invalidateOnConnection = true;
      return null;
    }

    throw error;
  }

  /**
   * Invalidate on reconnection
   * @param {any} result
   * @returns {any}
   */
  private async invalidateOnReconnection<T>(result: T): Promise<T | null> {
    if (this.resetOnReconnection && this.invalidateOnConnection) {
      // eslint-disable-next-line no-console
      console.log(`Resetting cache on: ${this.prefix}`);
      this.invalidateOnConnection = false;
      await this.invalidate();
      return null;
    }

    return result;
  }

  /**
   * @returns {void}
   */
  enable() {
    this.enabled = true;
  }

  /**
   * @returns {void}
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Set value in cache
   * @memberof Cached
   * @param {string} key
   * @param {string} value
   * @param {number} [overrideTtlSec]
   * @returns {Promise<void>}
   */
  async set(key: string, value: string, overrideTtlSec?: number): Promise<void> {
    if (!isString(key) || key.length === 0) {
      throw new Error('key must be a string with length');
    }

    if (!isString(value) || value.length === 0) {
      throw new Error('value must be a string with length');
    }

    if (overrideTtlSec && (!isInteger(overrideTtlSec) || overrideTtlSec <= 0)) {
      throw new Error('overrideTtlSec must be an integer gte 0');
    }

    if (!this.enabled) return;

    const ttl = isInteger(overrideTtlSec) ? overrideTtlSec : this.ttlSec;

    await this.redis
      .setex(`${this.prefix}${key}`, ttl, value)
      .then((result) => this.invalidateOnReconnection(result))
      .catch((error) => this.suppressConnectionError(error));
  }

  /**
   * Get value from cache by key
   * @memberof Cached
   * @param {string} key
   * @returns {Promise<*>}
   */
  async get(key: string): Promise<string | null> {
    if (!isString(key) || key.length === 0) {
      throw new Error('key must be a string with length');
    }

    if (!this.enabled) return null;

    return this.redis
      .get(`${this.prefix}${key}`)
      .then((result) => this.invalidateOnReconnection(result))
      .catch((error) => this.suppressConnectionError(error));
  }

  /**
   * Delete value from cache by key
   * @memberof Cached
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key: string): Promise<void> {
    if (!isString(key) || key.length === 0) {
      throw new Error('key must be a string with length');
    }

    if (!this.enabled) return;

    await this.redis
      .del(`${this.prefix}${key}`)
      .then((result) => this.invalidateOnReconnection(result))
      .catch((error) => this.suppressConnectionError(error));
  }

  /**
   * Invalidate any entries for this cache
   * @memberof Cached
   * @returns {Promise<void>}
   */
  async invalidate(): Promise<void> {
    if (!this.enabled) return;

    await new Promise((resolve, reject) => {
      const stream = this.redis.scanStream({
        match: `${this.prefix}*`,
        count: 100,
      });
      stream.on('data', async (resultKeys) => {
        stream.pause();
        await this.redis.del(...resultKeys);
        stream.resume();
      });

      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });
  }
}
