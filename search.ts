import { defaultsDeep, isObject, isPlainObject, reduce } from 'lodash';

import { Redis } from './redis';

/**
 * @class
 */
export class Search extends Redis {
  /**
   * Get size of search index
   * @param {string} index
   * @return {Promise<null|*>}
   */
  async indexSize(index): Promise<null | number> {
    if (!index) throw new Error('index name must be provided');

    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      const result = await this.call('FT.INFO', index);
      // eslint-disable-next-line no-magic-numbers
      if (Array.isArray(result) && result.length > 0) return result[5];
    } catch (error) {
      if (error.message === 'Unknown Index name') return null;
      throw error;
    }

    return null;
  }

  /**
   * Check if search index exists
   * @param {string} index
   * @return {Promise<boolean>}
   */
  async indexExists(index) {
    return !!(await this.indexSize(index));
  }

  /**
   * @param {object} schema
   * @return {Array}
   * @private
   */
  private static processSchema(schema) {
    if (!isPlainObject(schema)) throw new Error('schema must be an object');

    return Object.keys(schema).reduce(
      (result, key) => {
        const fieldOptions = schema[key];

        result.push(key);

        if (!fieldOptions.type || !Search.CONSTANTS.SEARCH_FIELD_TYPE_VALUES.includes(fieldOptions.type)) {
          throw new Error(`type must be one of: ${Search.CONSTANTS.SEARCH_FIELD_TYPE_VALUES.join(', ')}`);
        }

        result.push(fieldOptions.type.toUpperCase());

        if (fieldOptions.noStem) result.push('NOSTEM');
        if (fieldOptions.sortable) result.push('SORTABLE');

        return result;
      },
      ['SCHEMA']
    );
  }

  /**
   * Create a search index
   * @link https://oss.redislabs.com/redisearch/Commands.html
   * @param {string} index
   * @param {object} schema
   * @param {object} [options={
    ttl: false,
    highlighting: true,
    noStopwords: false,
  }]
   * @return {Promise<void>}
   */
  async createIndex(index: string, schema, options: { ttl?: boolean | number; highlighting?: boolean; noStopwords?: boolean } = {}): Promise<void> {
    if (!index) throw new Error('index name must be provided');
    if (!schema) throw new Error('schema must be provided');

    options = defaultsDeep({}, options, {
      ttl: false,
      highlighting: true,
      noStopwords: false,
    });

    let arguments_ = [index] as (string | number | boolean)[];

    if (options.ttl) {
      arguments_.push('TEMPORARY');
      arguments_.push(options.ttl);
    }

    if (options.highlighting === false) {
      arguments_.push('NOHL');
    }

    if (options.noStopwords === true) {
      arguments_.push('STORWORDS');
      arguments_.push('0');
    }

    if (schema) {
      arguments_ = arguments_.concat(Search.processSchema(schema));
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    await this.call('FT.CREATE', ...arguments_);
  }

  /**
   * Add document to index
   * @param {string} index
   * @param {string} id
   * @param {object} document
   * @param {object} [options= { replace: true, noSave: false }]
   * @return {Promise<*>}
   */
  async addToIndex(index: string, id: string, document, options: { noSave?: boolean; replace?: boolean } = {}) {
    if (!index) throw new Error('index name must be provided');
    if (!id) throw new Error('id must be provided');
    if (!isObject(document)) throw new Error('document must be an object');

    options = defaultsDeep({}, options, { replace: true, noSave: false });
    let arguments_ = [index, id, 1];

    if (options.noSave) {
      arguments_.push('NOSAVE');
    }

    if (options.replace) {
      arguments_.push('REPLACE');
    }

    arguments_.push('FIELDS');

    arguments_ = Object.keys(document).reduce((_arguments, key) => {
      if (!document[key]) return _arguments;
      if (isObject(document[key])) throw new Error('document properties cannot be objects');

      _arguments.push(key);
      _arguments.push(document[key]);
      return _arguments;
    }, arguments_);

    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    return this.call('FT.ADD', ...arguments_);
  }

  /**
   * Convert pairs in array into object
   * @param {any[]} array
   * @returns {object}
   * @private
   */
  private static pairsToObject(array) {
    if (!Array.isArray(array)) throw new Error(`must be array: ${array}`);

    const result = {};
    // eslint-disable-next-line no-magic-numbers
    for (let i = 0; i < array.length; i += 2) {
      result[array[i]] = array[i + 1];
    }

    return result;
  }

  /**
   * Search index using query
   * @param {string} index
   * @param {string} query
   * @param {object} [options={ idOnly: false, sortBy: null, sortDirection: 'ASC', limit: 100, page: 0 }]
   * @return {Promise<{total: *, ids: *, page: *}>}
   */
  async search(
    index: string,
    query: string,
    options: { idOnly?: boolean; sortBy?: null | string; sortDirection?: string; limit?: number; page?: number } = {}
  ): Promise<{ total: number; page: number; results }> {
    if (!index) throw new Error('index name must be provided');
    if (!query) throw new Error('query must be provided');

    options = defaultsDeep({}, options, {
      idOnly: false,
      sortBy: null,
      sortDirection: 'ASC',
      limit: 100,
      page: 0,
    });

    let arguments_ = [index, query] as (string | number)[];

    if (options.idOnly) arguments_.push('NOCONTENT');
    if (options.sortBy && options.sortDirection) arguments_ = arguments_.concat(['SORTBY', options.sortBy, options.sortDirection]);
    if (options.page && options.limit) arguments_ = arguments_.concat(['LIMIT', options.page, options.limit]);

    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    const results = await this.call('FT.SEARCH', ...arguments_);
    let processedResults;

    if (options.idOnly) {
      processedResults = results.slice(1, results.length);
    } else {
      const documentsById = Search.pairsToObject(results.slice(1, results.length));
      processedResults = reduce(
        documentsById,
        (_results, documentArray, id) => {
          _results.push({
            id,
            ...Search.pairsToObject(documentArray),
          });
          return _results;
        },
        [] as any[]
      );
    }

    return {
      total: results[0],
      page: options.page || 0,
      results: processedResults,
    };
  }

  /**
   * Remove document from index
   * @param {string} index
   * @param {string} id
   * @return {Promise<*>}
   */
  async removeFromIndex(index: string, id: string): Promise<any> {
    if (!index) throw new Error('index name must be provided');
    if (!id) throw new Error('id must be provided');

    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    return this.call('FT.DEL', index, id, 'DD');
  }

  /**
   * Delete index
   * @param {string} index
   * @return {Promise<void>}
   */
  async deleteIndex(index: string): Promise<void> {
    if (!index) throw new Error('index name must be provided');
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    await this.call('FT.DROP', index);
  }
}
