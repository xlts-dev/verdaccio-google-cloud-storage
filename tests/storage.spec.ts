import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';

import { DownloadResponse, File } from '@google-cloud/storage';
import { HTTP_STATUS, API_ERROR, VerdaccioError } from '@verdaccio/commons-api';
import { Callback, ILocalData, IPackageStorage, IPackageStorageManager, Logger, Package } from '@verdaccio/types';
import MemoryFileSystem from 'memory-fs';

import type GoogleCloudDatabase from '../src/data-storage';
import { PACKAGE_JSON } from '../src/storage';
import { VerdaccioGoogleStorageConfig } from '../src/types';

import storageConfig from './partials/config';
import pkgExample from './partials/pkg';
import { generatePackage } from './partials/utils.helpers';

type ITestLocalData = ILocalData<VerdaccioGoogleStorageConfig>;

const loggerDefault: Logger = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
  warn: jest.fn(),
  http: jest.fn(),
  trace: jest.fn(),
};

class FileMocked implements Partial<File> {
  public name: string;
  public exist: boolean;
  public constructor(fileName, exist) {
    this.name = fileName;
    this.exist = exist;
  }
  public save(): Promise<void> {
    return Promise.resolve();
  }
  // @ts-expect-error
  // The correct return type would be `Promise<[boolean]>`, but ESLint cannot parse `[boolean]`.
  // Switching to `boolean[]` (which is not accurate) as a work-around.
  public exists(): Promise<boolean[]> {
    return Promise.resolve([this.exist]);
  }
  public download(): Promise<DownloadResponse> {
    return Promise.resolve([Buffer.from(JSON.stringify({ name: 'foo' }))]);
  }
}

class Bucket {
  public name: string;
  public exists: boolean;
  public FiledMocked: typeof FileMocked;
  public constructor(bucketName, exists = false, File = FileMocked) {
    this.name = bucketName;
    this.exists = exists;
    this.FiledMocked = File;
  }
  public file(fileName): FileMocked {
    return new this.FiledMocked(fileName, this.exists);
  }
}

describe('Google Cloud Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  const getCloudDatabase = (storageConfig, logger = loggerDefault): GoogleCloudDatabase => {
    const GoogleCloudDb = require('../src/index').default;
    return new GoogleCloudDb(storageConfig, { logger });
  };

  // storage test

  describe('Google Cloud Storage', () => {
    const createPackage = (_cloudDatabase: ITestLocalData, _name: string, done: jest.DoneCallback): void => {
      done();
    };
    const deletePackage = (_cloudDatabase: ITestLocalData, _name: string, done: jest.DoneCallback): void => {
      done();
    };

    describe('GoogleCloudStorageHandler:create', () => {
      const pkgName = 'createPkg1';

      test('should create a package', (done: jest.DoneCallback) => {
        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;
          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public storage: object;
              public config: object;
              public logger: Logger;
              public constructor(props) {
                super(props);
                this.config = {
                  bucketName: 'foo',
                };
                this.storage = {
                  bucket: (name): Bucket => new Bucket(name, false),
                };
                this.logger = loggerDefault;
              }
            },
          };
        });

        const pkg = generatePackage(pkgName);
        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store: IPackageStorage = cloudDatabase.getPackageStorage(pkgName) as IPackageStorageManager;
        expect(store).not.toBeNull();

        store.createPackage(pkgName, pkg, (err: VerdaccioError) => {
          expect(err).toBeNull();
          expect(pkg.name).toBe(pkgName);
          done();
        });
      });

      test('should fails on package already exist', (done) => {
        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;
          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public storage: object;
              public config: object;
              public constructor(props) {
                super(props);
                this.config = {
                  bucketName: 'foo',
                };
                this.storage = {
                  bucket: (name): Bucket => new Bucket(name, true),
                };
                this.logger = loggerDefault;
              }
            },
          };
        });

        const pkg = generatePackage(pkgName);

        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgName);
        expect(store).not.toBeNull();
        if (store) {
          store.createPackage(pkgName, pkg, (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            store.createPackage(pkgName, pkg, (err: VerdaccioError) => {
              expect(err).not.toBeNull();
              expect(err.code).toEqual(HTTP_STATUS.CONFLICT);
              expect(err.message).toEqual('createPkg1 package already exist');
              done();
            });
          });
        }
      });

      test('should fails on package unexpected error', (done) => {
        class FileMockedFailure extends FileMocked {
          public exists(): Promise<never> {
            return Promise.reject(new Error(API_ERROR.UNKNOWN_ERROR));
          }
        }

        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;
          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public storage: object;
              public config: object;
              public constructor(props) {
                super(props);
                this.config = {
                  bucketName: 'foo',
                };
                this.storage = {
                  bucket: (name): Bucket => new Bucket(name, true, FileMockedFailure),
                };
                this.logger = loggerDefault;
              }
            },
          };
        });

        const pkg = generatePackage(pkgName);

        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store: IPackageStorage = cloudDatabase.getPackageStorage(pkgName) as IPackageStorageManager;
        store.createPackage(pkgName, pkg, (err: VerdaccioError) => {
          expect(err).not.toBeNull();
          store.createPackage(pkgName, pkg, (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            expect(err.code).toEqual(HTTP_STATUS.INTERNAL_ERROR);
            expect(err.message).toEqual(API_ERROR.UNKNOWN_ERROR);
            done();
          });
        });
      });

      describe('GoogleCloudStorageHandler:save', () => {
        const pkgName = 'savePkg1';
        test('should save a package', (done) => {
          const pkg = generatePackage(pkgName);

          const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
          const store = cloudDatabase.getPackageStorage(pkgName);
          expect(store).not.toBeNull();
          if (store) {
            store.createPackage(pkgName, pkg, (err: VerdaccioError) => {
              expect(err).not.toBeNull();
              expect(pkg.name).toBe(pkgName);
              done();
            });
          }
        });
      });
    });

    describe.skip('GoogleCloudStorageHandler:delete', () => {
      const pkgName = 'deletePkg1';
      const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);

      test('should delete an instance', (done) => {
        const store = cloudDatabase.getPackageStorage(pkgName);
        expect(store).not.toBeNull();
        if (store) {
          store.deletePackage(PACKAGE_JSON, (err: VerdaccioError) => {
            expect(err).toBeNull();
            done();
          });
        }
      });

      test('should fail on delete an instance', (done) => {
        const store = cloudDatabase.getPackageStorage('404Fake');
        expect(store).not.toBeNull();
        if (store) {
          store.deletePackage(PACKAGE_JSON, (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            expect(err.message).toBe(API_ERROR.NO_PACKAGE);
            expect(err.code).toEqual(HTTP_STATUS.NOT_FOUND);
            done();
          });
        }
      });

      test('should remove an entire package', (done) => {
        // FIXME: relocate this test
        const cloudDatabase = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgExample.name);
        expect(store).not.toBeNull();
        if (store) {
          store.removePackage((err: VerdaccioError) => {
            // FIXME: we need to implement removePackage
            expect(err).toBeNull();
            done();
          });
        }
      });
    });

    describe.skip('GoogleCloudStorageHandler:read', () => {
      const packageName = 'readPkgTest';
      const pkg = generatePackage(packageName);
      const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);

      beforeAll((done) => {
        createPackage(cloudDatabase, packageName, done);
      });

      afterAll((done) => {
        return deletePackage(cloudDatabase, packageName, done);
      });

      test('should read a package', (done) => {
        const store = cloudDatabase.getPackageStorage(packageName);
        expect(store).not.toBeNull();
        if (store) {
          store.readPackage(pkg.name, (err: VerdaccioError, pkgJson?: Package) => {
            expect(err).toBeNull();
            expect(pkgJson?.name).toBe(pkg.name);
            done();
          });
        }
      });

      test('should fails read a missing package', (done) => {
        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage('');
        expect(store).not.toBeNull();
        if (store) {
          store.readPackage('missing404Pkg', (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            expect(err.code).toEqual(HTTP_STATUS.NOT_FOUND);
            expect(err.message).toBe(API_ERROR.NO_PACKAGE);
            done();
          });
        }
      });
    });

    describe.skip('GoogleCloudStorageHandler:update', () => {
      const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
      const packageName = 'updateTransPkg';
      beforeAll((done) => {
        createPackage(cloudDatabase, packageName, done);
      });

      afterAll((done) => {
        return deletePackage(cloudDatabase, packageName, done);
      });

      // test('should update an instance', done => {
      //   const cloudDatabase: ILocalData = new GoogleCloudDatabase(storageConfig, { logger });
      //   const store = cloudDatabase.getPackageStorage(packageName);
      //   const pkg = generatePackage(packageName);
      //   expect(store).not.toBeNull();
      //   if (store) {
      //     store.deletePackage(pkg.name, err => {
      //       expect(err).toBeNull();
      //       done();
      //     });
      //   }
      // });

      test('should update and transform an instance', (done) => {
        const pkg = generatePackage(packageName);
        const store = cloudDatabase.getPackageStorage(packageName);

        expect(store).not.toBeNull();
        if (store) {
          store.updatePackage(
            pkg.name,
            (_data: unknown, cb: Callback) => {
              // Handle Update
              cb();
            },
            (_name: string, json: Package, cb: Callback) => {
              // Write Package
              expect(json['test']).toBe('test');
              cb(null);
            },
            (json: Package) => {
              // Transformation
              json['test'] = 'test';
              return json;
            },
            (err: VerdaccioError) => {
              // on End
              expect(err).toBeNull();
              done();
            }
          );
        }
      });

      test('should fails on update due unknown package', (done) => {
        const store = cloudDatabase.getPackageStorage('');
        expect(store).not.toBeNull();
        if (store) {
          store.updatePackage(
            'fake404',
            () => undefined,
            () => undefined,
            (pkg) => pkg,
            (err: VerdaccioError) => {
              expect(err).not.toBeNull();
              expect(err.code).toEqual(HTTP_STATUS.NOT_FOUND);
              expect(err.message).toBe(API_ERROR.NO_PACKAGE);
              done();
            }
          );
        }
      });

      test('should fails on update on fails updateHandler', (done) => {
        const store = cloudDatabase.getPackageStorage('');
        expect(store).not.toBeNull();
        if (store) {
          store.updatePackage(
            'fake404',
            () => undefined,
            () => undefined,
            (pkg) => pkg,
            (err: VerdaccioError) => {
              expect(err).not.toBeNull();
              expect(err.code).toEqual(HTTP_STATUS.NOT_FOUND);
              expect(err.message).toBe(API_ERROR.NO_PACKAGE);
              done();
            }
          );
        }
      });
    });

    describe('GoogleCloudStorageHandler:: writeFile', () => {
      const memfs = new MemoryFileSystem();
      const tarballFile = path.join(__dirname, '/partials/test-pkg/', 'test-pkg-1.0.0.tgz');

      class FileWriteMocked extends FileMocked {
        public createWriteStream(): Writable {
          const stream = memfs.createWriteStream(`/test`);
          // process.nextTick(function() {
          stream.on('end', () => {
            stream.emit('response');
          });
          stream.on('data', (d) => {
            // eslint-disable-next-line no-console
            console.log('data-->', d);
          });
          stream.on('response', (d) => {
            // eslint-disable-next-line no-console
            console.log('response-->', d);
          });
          stream.on('close', () => {
            stream.emit('response');
          });
          // });

          return stream;
        }
      }

      test('should write a tarball successfully push data', (done) => {
        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;
          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public storage: object;
              public config: object;
              public constructor(props) {
                super(props);
                this.config = {
                  bucketName: 'foo',
                };
                this.storage = {
                  bucket: (name): Bucket => new Bucket(name, false, FileWriteMocked),
                };
                this.logger = loggerDefault;
              }
            },
          };
        });

        const bufferFile = fs.readFileSync(tarballFile);
        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store: IPackageStorage = cloudDatabase.getPackageStorage(pkgExample.name) as IPackageStorageManager;
        const writeTarballStream = store.writeTarball('test-pkg-1.0.0.tgz');

        writeTarballStream.on('error', (err: VerdaccioError) => {
          done.fail(err);
        });

        writeTarballStream.on('success', () => {
          done();
        });

        writeTarballStream.on('end', () => {
          done();
        });

        writeTarballStream.end(bufferFile);
        writeTarballStream.done();
      });

      test.skip('should write a abort successfully push data', (done) => {
        const bufferFile = fs.readFileSync(tarballFile);
        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgExample.name);
        expect(store).not.toBeNull();
        if (store) {
          const writeTarballStream = store.writeTarball('test-pkg-1.0.0.tgz');

          writeTarballStream.on('error', (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            expect(err.message).toMatch(/transmision aborted/);
            done();
          });

          writeTarballStream.on('data', (data) => {
            expect(data).toBeDefined();
            writeTarballStream.abort();
          });

          writeTarballStream.on('success', () => {
            done.fail(new Error('success should not be called'));
          });

          writeTarballStream.end(bufferFile);
          writeTarballStream.done();
        }
      });
    });

    describe.skip('GoogleCloudStorageHandler:: readFile', () => {
      test('should read a tarball successfully', (done) => {
        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgExample.name);
        expect(store).not.toBeNull();
        if (store) {
          const readTarballStream = store.readTarball('test-pkg-1.0.0.tgz');
          let isOpen = false;

          readTarballStream.on('data', (data) => {
            expect(data).toBeDefined();
          });

          readTarballStream.on('open', () => {
            isOpen = true;
          });

          readTarballStream.on('content-length', (contentLength) => {
            expect(contentLength).toBeDefined();
          });

          readTarballStream.on('error', () => {
            done.fail(new Error('should not fail'));
          });

          readTarballStream.on('end', () => {
            expect(isOpen).toBe(true);
            done();
          });
        }
      });

      test('should fails with 404 on get a tarball', (done) => {
        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgExample.name);
        let isOpen = false;
        expect(store).not.toBeNull();
        if (store) {
          const readTarballStream = store.readTarball('fake-tarball.tgz');

          readTarballStream.on('data', (data: unknown) => {
            expect(data).toBeUndefined();
          });

          readTarballStream.on('open', () => {
            isOpen = true;
          });

          readTarballStream.on('error', (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            // this is really important, verdaccio handle such errors instead 404
            expect(err.code).toBe('ENOENT');
            expect(err.message).toMatch(/no such package/);
            expect(isOpen).toBe(true);
            done();
          });
        }
      });

      test('should abort successfully get a tarball', (done) => {
        let isOpen = false;
        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgExample.name);
        expect(store).not.toBeNull();
        if (store) {
          const readTarballStream = store.readTarball('test-pkg-1.0.0.tgz');

          readTarballStream.on('data', () => {
            readTarballStream.abort();
          });

          readTarballStream.on('open', () => {
            isOpen = true;
          });

          readTarballStream.on('error', (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            expect(err.statusCode).toBe(400);
            expect(err.message).toMatch(/transmision aborted/);
            expect(isOpen).toBe(true);
            done();
          });
        }
      });
    });

    describe('GoogleCloudStorageHandler:: deleteTarball', () => {
      test('should delete successfully get a tarball', (done) => {
        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;
          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public _buildFilePath(): {
                name: string;
                delete: () => Promise<object[]>;
              } {
                return {
                  name: 'foo',
                  delete: (): Promise<object[]> =>
                    Promise.resolve([
                      {
                        foo: 'bar',
                      },
                    ]),
                };
              }
            },
          };
        });

        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgExample.name);
        expect(store).not.toBeNull();

        if (store) {
          store.deletePackage('test-pkg-1.0.0.tgz', (err: VerdaccioError) => {
            expect(err).toBeNull();
            done();
          });
        }
      });

      test('should fails on delete a tarball', (done) => {
        jest.doMock('../src/storage', () => {
          const originalModule = jest.requireActual('../src/storage').default;
          return {
            __esModule: true,
            default: class Foo extends originalModule {
              public _buildFilePath(): {
                name: string;
                delete: () => Promise<never>;
              } {
                return {
                  name: 'foo',
                  delete: (): Promise<never> => Promise.reject(new Error(API_ERROR.NO_PACKAGE)),
                };
              }
            },
          };
        });

        const cloudDatabase: ITestLocalData = getCloudDatabase(storageConfig);
        const store = cloudDatabase.getPackageStorage(pkgExample.name);

        if (store) {
          store.deletePackage('test-pkg-1.0.0.tgz', (err: VerdaccioError) => {
            expect(err).not.toBeNull();
            expect(err.code).toEqual(HTTP_STATUS.INTERNAL_ERROR);
            expect(err.message).toBe(API_ERROR.NO_PACKAGE);
            done();
          });
        }
      });
    });
  });
});
