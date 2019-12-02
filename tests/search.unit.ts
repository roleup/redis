import { expect } from 'chai';
import { Search } from 'index';

describe('search unit tests', () => {
  it('process schema with one field', () => {
    const schema = {
      field1: {
        type: 'text',
        sortable: true,
      },
    };

    // @ts-ignore
    const schemaArray = Search.processSchema(schema);

    expect(schemaArray).to.eql(['SCHEMA', 'field1', 'TEXT', 'SORTABLE']);
  });

  it('process schema with multiple fields', () => {
    const schema = {
      field1: {
        type: 'text',
        sortable: true,
      },
      field2: {
        type: 'geo',
        noStem: true,
      },
    };

    // @ts-ignore
    const schemaArray = Search.processSchema(schema);

    expect(schemaArray).to.eql(['SCHEMA', 'field1', 'TEXT', 'SORTABLE', 'field2', 'GEO', 'NOSTEM']);
  });

  it('pairs to object', () => {
    const pairs = ['foo', '123', 'bar', '3453'];
    // @ts-ignore
    expect(Search.pairsToObject(pairs)).to.eql({ foo: '123', bar: '3453' });
  });
});
