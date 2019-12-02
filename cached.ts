import { Cache } from './cache';
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
export class Cached<T> {
  /**
   * @param {ServicesInterface} services
   * @param {ConfigInterface} config
   */
  constructor(services: ServicesInterface, config: ConfigInterface<T>) {
    this.cache = new Cache(services, config);
  }

  readonly cache: Cache<T>;
}
