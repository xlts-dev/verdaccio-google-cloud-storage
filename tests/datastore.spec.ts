import { VerdaccioError } from '@verdaccio/commons-api';
import { HTTP_STATUS } from '@verdaccio/commons-api/lib';
import { ILocalPackageManager, Logger, Token } from '@verdaccio/types';

import type GoogleCloudDatabase from '../src/data-storage';
import { ERROR_MISSING_CONFIG } from '../src/data-storage';
import { VerdaccioGoogleStorageConfig } from '../src/types';

import storageConfig from './partials/config';

const loggerDefault: { [key in keyof Logger]: jest.Mock<Logger[key]> } = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
  warn: jest.fn(),
  http: jest.fn(),
  trace: jest.fn(),
};

describe('Google Cloud Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  const getCloudDatabase = (
    storageConfig: VerdaccioGoogleStorageConfig,
    logger = loggerDefault
  ): GoogleCloudDatabase => {
    const GoogleCloudDb: typeof GoogleCloudDatabase = require('../src/index').default;
    const pluginOptions = { config: storageConfig, logger };
    return new GoogleCloudDb(pluginOptions.config, pluginOptions);
  };

  describe('Google Cloud DataStore', () => {
    // **** DataStore

    describe('should test create instances', () => {
      test('should create an instance', () => {
        const cloudDatabase = getCloudDatabase(storageConfig);

        expect(cloudDatabase).toBeDefined();
      });

      test('should fails on create an instance due to bucket name invalid', () => {
        const invalidConfig = Object.assign(storageConfig.clone(), { bucketName: undefined });
        expect(() => getCloudDatabase(invalidConfig)).toThrow(
          new Error('Google Cloud Storage requires a bucket name, please define one.')
        );
      });

      test('should fails on create an instance fails due projectId invalid', () => {
        const invalidConfig = Object.assign(storageConfig.clone(), { secretName: undefined });
        expect(() => getCloudDatabase(invalidConfig)).toThrow(
          new Error('Google Cloud Storage requires a secret name, please define one.')
        );
      });

      test('should fails on config is not to be provided', () => {
        expect(() => {
          getCloudDatabase(undefined as unknown as VerdaccioGoogleStorageConfig);
        }).toThrow(new Error(ERROR_MISSING_CONFIG));
      });
    });

    describe('DataStore basic calls', () => {
      const pkgName = 'dataBasicItem1';

      test('should add an Entity', (done) => {
        // ** add, remove, get, getPackageStorage
        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;

          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public datastore: object;
              public constructor(props) {
                super(props);
                this.datastore = {
                  key: jest.fn(),
                  save: (): Promise<unknown[]> => Promise.resolve([]),
                  createQuery: (): string => 'query',
                  runQuery: (): Promise<object[]> =>
                    Promise.resolve([
                      [
                        {
                          name: pkgName,
                        },
                      ],
                      {},
                    ]),
                };
              }
            },
          };
        });

        const cloudDatabase = getCloudDatabase(storageConfig);
        cloudDatabase.add(pkgName, (err: VerdaccioError) => {
          expect(err).toBeNull();

          cloudDatabase.get((err: VerdaccioError, results: string[]) => {
            expect(results).not.toBeNull();
            expect(err).toBeNull();
            expect(results).toHaveLength(1);
            expect(results[0]).toBe(pkgName);
            done();
          });
        });
      });

      test('should fails add an Entity', (done) => {
        // ** add, remove, get, getPackageStorage
        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;

          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public datastore: object;
              public constructor(props) {
                super(props);
                this.datastore = {
                  key: jest.fn(),
                  save: (): Promise<never> => Promise.reject(new Error('')),
                  createQuery: (): string => 'query',
                  runQuery: (): Promise<object[]> =>
                    Promise.resolve([
                      [
                        {
                          name: pkgName,
                        },
                      ],
                      {},
                    ]),
                };
              }
            },
          };
        });

        const cloudDatabase = getCloudDatabase(storageConfig);
        cloudDatabase.add(pkgName, (err: VerdaccioError) => {
          expect(err).not.toBeNull();
          expect(err.code).toEqual(HTTP_STATUS.INTERNAL_ERROR);
          done();
        });
      });

      test('should delete an entity', (done) => {
        const deleteDataStore = jest.fn();

        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;

          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public datastore: object;
              public constructor(props) {
                super(props);
                // gcloud sdk uses Symbols for metadata in entities
                const sym = Symbol('name');
                this.datastore = {
                  KEY: sym,
                  key: jest.fn(() => true),
                  int: jest.fn(() => 1),
                  delete: deleteDataStore,
                  createQuery: (): string => 'query',
                  runQuery: (): Promise<object[]> => {
                    const entity = {
                      name: pkgName,
                      id: 1,
                    };
                    entity[sym] = entity;

                    return Promise.resolve([[entity], {}]);
                  },
                };
              }
            },
          };
        });

        const cloudDatabase = getCloudDatabase(storageConfig);

        cloudDatabase.remove(pkgName, (err, result) => {
          expect(err).toBeNull();
          expect(result).not.toBeNull();
          expect(deleteDataStore).toHaveBeenCalled();
          expect(deleteDataStore).toHaveBeenCalledTimes(1);
          done();
        });
      });

      test('should get a new instance package storage', () => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        const store: ILocalPackageManager = cloudDatabase.getPackageStorage('newInstance');
        expect(store).not.toBeNull();
        expect(store).toBeDefined();
      });
    });

    describe('should test non implemented methods', () => {
      test('should test saveToken', (done) => {
        const info = jest.fn();
        const cloudDatabase = getCloudDatabase(storageConfig, { ...loggerDefault, info });
        cloudDatabase.saveToken({} as Token).catch(() => {
          expect(info).toHaveBeenCalled();
          done();
        });
      });

      test('should test deleteToken', (done) => {
        const error = jest.fn();
        const cloudDatabase = getCloudDatabase(storageConfig, { ...loggerDefault, error });
        cloudDatabase.deleteToken('someUser', 'someToken').catch(() => {
          expect(error).toHaveBeenCalled();
          done();
        });
      });

      test('should test readTokens', async (done) => {
        const error = jest.fn();
        const cloudDatabase = getCloudDatabase(storageConfig, { ...loggerDefault, error });
        await cloudDatabase.readTokens({ user: '' });
        expect(error).toHaveBeenCalled();
        done();
      });

      test('should test search', (done) => {
        const warn = jest.fn();
        const cloudDatabase = getCloudDatabase(storageConfig, { ...loggerDefault, warn });
        cloudDatabase.search(
          () => {
            throw new Error('`onPackage` callback should not have been called.');
          },
          () => {
            expect(warn).toHaveBeenCalled();
            done();
          }
        );
      });
    });
  });
});
