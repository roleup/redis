import { isBoolean, isInteger, isObject, isString } from 'lodash';

import { Redis } from './redis';

interface ServicesInterface {
  redis: Redis;
}

interface ConfigInterface<T> {
  prefix: string;
  ttlSec: number;
  resetOnReconnection?: boolean;
  stringifyForCache(instance: T): string;
  parseFromCache(instance: string): T;
}

/**
 * @class
 */
export class Cache<T> {
  // This has to be a sufficiently unique string that other prefixes will not include it
  // Adding this to the end of each prefix allows a wildcard delete for invalidating cache
  static readonly PREFIX_TERMINATOR = '--<<$$PRE_TERM$$>>--';

  /**
   * @param {ServicesInterface} services
   * @param {ConfigInterface} config
   */
  constructor(services: ServicesInterface, config: ConfigInterface<T>) {
    if (!isObject(services.redis)) {
      throw new TypeError('redis must be an object');
    }

    if (!isString(config.prefix) || config.prefix.length === 0) {
      throw new Error('prefix must be a string with length');
    }

    if (!isInteger(config.ttlSec) || config.ttlSec <= 0) {
      throw new Error('ttlSec must be an integer gte 0');
    }

    if (config.prefix.includes(Cache.PREFIX_TERMINATOR)) {
      throw new Error(`prefix cannot include: ${Cache.PREFIX_TERMINATOR}`);
    }

    this.services = services;
    this.config = {
      ...config,
      prefix: config.prefix + Cache.PREFIX_TERMINATOR,
      resetOnReconnection: isBoolean(config.resetOnReconnection) ? config.resetOnReconnection : true,
    };
    this.invalidateOnConnection = false;
    this.enabled = true;
  }

  private readonly services: ServicesInterface;

  private readonly config: ConfigInterface<T>;

  private enabled: boolean;

  private invalidateOnConnection: boolean;

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
    if (this.config.resetOnReconnection && this.invalidateOnConnection) {
      // eslint-disable-next-line no-console
      console.log(`Resetting cache on: ${this.config.prefix}`);
      this.invalidateOnConnection = false;
      await this.invalidate();
      return null;
    }

    return result;
  }

  /**
   * @returns {void}
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * @returns {void}
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Set value in cache
   * @memberof Cached
   * @param {string} key
   * @param {T} instance
   * @param {number} [overrideTtlSec]
   * @returns {Promise<void>}
   */
  async set(key: string, instance: T, overrideTtlSec?: number): Promise<void> {
    if (!this.enabled) return;

    if (!isString(key) || key.length === 0) {
      throw new Error('key must be a string with length');
    }

    const value = this.config.stringifyForCache(instance);

    if (!isString(value) || value.length === 0) {
      throw new Error('value must be a string with length');
    }

    if (overrideTtlSec && (!isInteger(overrideTtlSec) || overrideTtlSec <= 0)) {
      throw new Error('overrideTtlSec must be an integer gte 0');
    }

    const ttl = overrideTtlSec && isInteger(overrideTtlSec) ? overrideTtlSec : this.config.ttlSec;

    await this.services.redis
      .setex(`${this.config.prefix}${key}`, ttl, value)
      .then((result) => this.invalidateOnReconnection(result))
      .catch((error) => this.suppressConnectionError(error));
  }

  /**
   * Get value from cache by key
   * @memberof Cached
   * @param {string} key
   * @returns {Promise<*>}
   */
  async get(key: string): Promise<T | null> {
    if (!this.enabled) return null;

    if (!isString(key) || key.length === 0) {
      throw new Error('key must be a string with length');
    }

    return this.services.redis
      .get(`${this.config.prefix}${key}`)
      .then((result) => this.invalidateOnReconnection(result))
      .then((result) => (result ? this.config.parseFromCache(result) : null))
      .catch((error) => this.suppressConnectionError(error));
  }

  /**
   * Delete value from cache by key
   * @memberof Cached
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key: string): Promise<void> {
    if (!this.enabled) return;

    if (!isString(key) || key.length === 0) {
      throw new Error('key must be a string with length');
    }

    await this.services.redis
      .del(`${this.config.prefix}${key}`)
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
      const stream = this.services.redis.scanStream({
        match: `${this.config.prefix}*`,
        count: 100,
      });
      stream.on('data', async (resultKeys) => {
        stream.pause();
        await this.services.redis.del(...resultKeys);
        stream.resume();
      });

      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });
  }
}
