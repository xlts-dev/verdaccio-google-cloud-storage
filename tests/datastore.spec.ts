import { Datastore, Key } from '@google-cloud/datastore';
import { VerdaccioError } from '@verdaccio/commons-api';
import { HTTP_STATUS } from '@verdaccio/commons-api/lib';
import { Logger, Token } from '@verdaccio/types';

import GoogleCloudDatabase, { ERROR_MISSING_CONFIG } from '../src/data-storage';
import { VerdaccioGoogleStorageConfig } from '../src/types';

import storageConfig from './partials/config';

const loggerMock: { [key in keyof Logger]: jest.Mock<Logger[key]> } = {
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

  const getCloudDatabase = (storageConfig: VerdaccioGoogleStorageConfig): GoogleCloudDatabase => {
    // Mock `Datastore` methods which are used by `GoogleCloudDababase` and make server calls.
    ['delete', 'get', 'runQuery', 'save'].forEach((method) => {
      jest.spyOn(Datastore.prototype, method).mockRejectedValue(new Error('Mock implementation'));
    });

    const pluginOptions = { config: storageConfig, logger: loggerMock };
    return new GoogleCloudDatabase(pluginOptions.config, pluginOptions);
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
      test('should get existing entities', (done) => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        // Mock the `Datastore#runQuery()` method to return a faked entities list.
        const runQuerySpy = jest
          .spyOn(Datastore.prototype, 'runQuery')
          .mockResolvedValue([
            [{ packageName: 'dataBasicItem1' }, { packageName: 'dataBasicItem3' }, { packageName: 'dataBasicItem2' }],
            {},
          ] as never);

        cloudDatabase.get((err: VerdaccioError, results: string[]) => {
          expect(runQuerySpy).toHaveBeenCalledWith(expect.objectContaining({ kinds: ['VerdaccioPackage'] }), {
            gaxOptions: { autoPaginate: true },
          });

          expect(err).toBeNull();
          expect(results).toStrictEqual(['dataBasicItem1', 'dataBasicItem2', 'dataBasicItem3']);

          done();
        });
      });

      test('should add an entity', (done) => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        // Mock the `Datastore#save()` method to complete successfully, simulating a successful addition.
        jest.spyOn(Datastore.prototype, 'save').mockResolvedValue(undefined as never);
        loggerMock.error.mockClear();

        cloudDatabase.add('dataBasicItem1', (err: VerdaccioError) => {
          expect(loggerMock.error).not.toHaveBeenCalled();
          expect(err).toBeUndefined();

          done();
        });
      });

      test('should handle failing to add an entity', (done) => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        // Mock the `Datastore#save()` method to fail, simulating a failed addition.
        jest.spyOn(Datastore.prototype, 'save').mockRejectedValue(new Error('Failed to add.') as never);
        loggerMock.error.mockClear();

        cloudDatabase.add('dataBasicItem1', (err: VerdaccioError) => {
          expect(loggerMock.error).toHaveBeenCalledWith(
            "gcloud: [datastore add] failed to add package 'dataBasicItem1' to datastore '[default].VerdaccioPackage': Failed to add."
          );

          expect(err).toBeInstanceOf(Error);
          expect(err.code).toBe(HTTP_STATUS.INTERNAL_ERROR);
          expect(err.message).toBe('Failed to add.');

          done();
        });
      });

      test('should delete an entity', (done) => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        // Mock the `Datastore#key()` method to generate a fake key.
        const fakeKey = {} as Key;
        jest.spyOn(Datastore.prototype, 'key').mockReturnValue(fakeKey);
        // Mock the `Datastore#get()` method to complete successfully, simulating an existing entity.
        const getSpy = jest
          .spyOn(Datastore.prototype, 'get')
          .mockResolvedValue([{ packageName: 'dataBasicItem1' }] as never);
        // Mock the `Datastore#delete()` method to complete successfully, simulating a successful creation.
        const deleteSpy = jest.spyOn(Datastore.prototype, 'delete').mockResolvedValue(undefined as never);
        loggerMock.error.mockClear();

        cloudDatabase.remove('dataBasicItem1', (err: VerdaccioError) => {
          expect(loggerMock.error).not.toHaveBeenCalled();
          expect(err).toBeUndefined();

          expect(getSpy).toHaveBeenCalledWith(fakeKey);
          expect(deleteSpy).toHaveBeenCalledWith(fakeKey);

          done();
        });
      });

      test('should handle deleting a missing entity', (done) => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        // Mock the `get()` method to return an empty array, indicating the entity was not found.
        jest.spyOn(Datastore.prototype, 'get').mockResolvedValue([] as never);
        loggerMock.warn.mockClear();

        cloudDatabase.remove('fakeName', (err) => {
          expect(loggerMock.warn).toHaveBeenCalledWith(
            "gcloud: [datastore remove] package 'fakeName' was not found in datastore '[default].VerdaccioPackage'"
          );

          expect(err).toBeInstanceOf(Error);
          expect(err.message).toBe("package 'fakeName' was not found");

          done();
        });
      });

      test('should get a new instance package storage', () => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage('newInstance');
        expect(store).not.toBeNull();
        expect(store).toBeDefined();
      });
    });

    describe('should test non implemented methods', () => {
      test('should test saveToken', (done) => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        loggerMock.error.mockClear();
        loggerMock.info.mockClear();

        cloudDatabase.saveToken({} as Token).catch(() => {
          expect(loggerMock.info).toHaveBeenCalled();
          expect(loggerMock.error).toHaveBeenCalled();
          done();
        });
      });

      test('should test deleteToken', (done) => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        loggerMock.error.mockClear();
        loggerMock.info.mockClear();

        cloudDatabase.deleteToken('someUser', 'someToken').catch(() => {
          expect(loggerMock.info).toHaveBeenCalled();
          expect(loggerMock.error).toHaveBeenCalled();
          done();
        });
      });

      test('should test readTokens', async () => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        loggerMock.error.mockClear();
        loggerMock.info.mockClear();

        const tokens = await cloudDatabase.readTokens({ user: '' });

        expect(tokens).toStrictEqual([]);
        expect(loggerMock.info).toHaveBeenCalled();
        expect(loggerMock.error).toHaveBeenCalled();
      });

      test('should test search', async () => {
        const cloudDatabase = getCloudDatabase(storageConfig);
        const onPkgMock = jest.fn();
        const onEndMock = jest.fn();
        loggerMock.warn.mockClear();

        await cloudDatabase.search(onPkgMock, onEndMock);

        expect(loggerMock.warn).toHaveBeenCalledWith('package search has not been implemented');
        expect(onPkgMock).not.toHaveBeenCalled();
        expect(onEndMock).toHaveBeenCalled();
      });
    });
  });
});
