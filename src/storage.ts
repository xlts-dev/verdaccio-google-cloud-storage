import { Readable } from 'stream';
import { UploadTarball, ReadTarball } from '@verdaccio/streams';
import {
  Package,
  Callback,
  Logger,
  IPackageStorageManager,
  StorageUpdateCallback,
  StorageWriteCallback,
  PackageTransformer,
  CallbackAction,
  ReadPackageCallback,
} from '@verdaccio/types';
import { File, DownloadResponse, Bucket, Storage } from '@google-cloud/storage';
import {
  VerdaccioError,
  getInternalError,
  getBadRequest,
  getNotFound,
  getConflict,
  HTTP_STATUS,
} from '@verdaccio/commons-api';

import { VerdaccioGoogleStorageConfig } from './types';

export const PACKAGE_JSON = 'package.json';
export const DEFAULT_VALIDATION = 'crc32c';
export const PACKAGE_CACHE_TTL_SECONDS = 30;

const packageAlreadyExist = function(name: string): VerdaccioError {
  return getConflict(`${name} package already exist`);
};

// TODO: This file needs to get cleaned up in general
class GoogleCloudStorageHandler implements IPackageStorageManager {
  public config: VerdaccioGoogleStorageConfig;
  public logger: Logger;
  private storage: Storage;
  private static packageJsonCache = {};
  private readonly name: string;

  public constructor(name: string, storage: Storage, config: VerdaccioGoogleStorageConfig, logger: Logger) {
    this.name = name;
    this.storage = storage;
    this.logger = logger;
    this.config = config;
  }

  public _buildFilePath(packageName: string, fileName: string): File {
    return this._getBucket().file(`${packageName}/${fileName}`);
  }

  public _getBucket(): Bucket {
    return this.storage.bucket(this.config.bucketName);
  }

  public updatePackage(
    name: string,
    updateHandler: StorageUpdateCallback,
    onWrite: StorageWriteCallback,
    transformPackage: PackageTransformer,
    onEnd: CallbackAction
  ): void {
    this._readPackage(name)
      .then(
        (metadata: Package): void => {
          updateHandler(metadata, (err: VerdaccioError): void => {
            if (err) {
              this.logger.error(
                { name: name, err: err.message },
                'gcloud: on write update @{name} package has failed err: @{err}'
              );
              return onEnd(err);
            }
            try {
              onWrite(name, transformPackage(metadata), onEnd);
            } catch (err) {
              this.logger.error(
                { name: name, err: err.message },
                'gcloud: on write update @{name} package has failed err: @{err}'
              );
              return onEnd(getInternalError(err.message));
            }
          });
        },
        (err: Error): void => {
          this.logger.error({ name: name, err: err.message }, 'gcloud: update @{name} package has failed err: @{err}');
          onEnd(getInternalError(err.message));
        }
      )
      .catch(
        (err: Error): Callback => {
          this.logger.error(
            { name, error: err },
            'gcloud: trying to update @{name} and was not found on storage err: @{error}'
          );
          // @ts-ignore
          return onEnd(getNotFound());
        }
      );
  }

  public deletePackage(fileName: string, cb: CallbackAction): void {
    const file = this._buildFilePath(this.name, fileName);
    this.logger.debug({ name: file.name }, 'gcloud: deleting @{name} from storage');
    try {
      file
        .delete()
        .then((): void => {
          this.logger.debug({ name: file.name }, 'gcloud: @{name} was deleted successfully from storage');
          cb(null);
        })
        .catch((err: Error): void => {
          this.logger.error(
            { name: file.name, err: err.message },
            'gcloud: delete @{name} file has failed err: @{err}'
          );
          cb(getInternalError(err.message));
        });
    } catch (err) {
      this.logger.error({ name: file.name, err: err.message }, 'gcloud: delete @{name} file has failed err: @{err}');
      cb(getInternalError('something went wrong'));
    }
  }

  // TODO: Calling this method usually results in a 404 result. Usually all files have already been removed by the `deletePackage` call that occurs first.
  //  Because all files have been removed, the folder structure no longer exists in the bucket.
  public removePackage(callback: CallbackAction): void {
    // remove all files from storage
    const file =this._getBucket().file(`${this.name}`);
    this.logger.debug({ name: file.name }, 'gcloud: removing the package @{name} from storage');
    file.delete().then(
      (): void => {
        this.logger.debug({ name: file.name }, 'gcloud: package @{name} was deleted successfully from storage');
        callback(null);
      },
      (err: Error): void => {
        this.logger.error(
          { name: file.name, err: err.message },
          'gcloud: delete @{name} package has failed err: @{err}'
        );
        callback(getInternalError(err.message));
      }
    );
  }

  public createPackage(name: string, metadata: Package, cb: CallbackAction): void {
    this.logger.debug({ name }, 'gcloud: creating new package for @{name}');
    this._fileExist(name, PACKAGE_JSON).then(
      (exist: boolean): void => {
        if (exist) {
          this.logger.debug({ name }, 'gcloud: creating @{name} has failed, it already exist');
          cb(packageAlreadyExist(name));
        } else {
          this.logger.debug({ name }, 'gcloud: creating @{name} on storage');
          this.savePackage(name, metadata, cb);
        }
      },
      (err: Error): void => {
        this.logger.error({ name: name, err: err.message }, 'gcloud: create package @{name} has failed err: @{err}');
        cb(getInternalError(err.message));
      }
    );
  }

  public savePackage(name: string, value: Package, cb: CallbackAction): void {
    this.logger.debug({ name }, 'gcloud: saving package for @{name}');
    this._savePackage(name, value)
      .then((): void => {
        this.logger.debug({ name }, 'gcloud: @{name} has been saved successfully on storage');
        cb(null);
      })
      .catch((err: Error): void => {
        this.logger.error({ name: name, err: err.message }, 'gcloud: save package @{name} has failed err: @{err}');
        return cb(err);
      });
  }

  /* eslint-disable no-async-promise-executor */
  private _savePackage(name: string, metadata: Package): Promise<null | VerdaccioError> {
    return new Promise(
      async (resolve, reject): Promise<void> => {
        const file = this._buildFilePath(name, PACKAGE_JSON);
        try {
          await file.save(this._convertToString(metadata), {
            validation: this.config?.bucketOptions?.validation || DEFAULT_VALIDATION,
            /**
             * When resumable is `undefined` - it will default to `true`as per GC Storage documentation:
             * `Resumable uploads are automatically enabled and must be shut off explicitly by setting options.resumable to false`
             * @see https://cloud.google.com/nodejs/docs/reference/storage/2.5.x/File#createWriteStream
             */
            resumable: this.config?.bucketOptions?.resumable,
          });
          resolve(null);
        } catch (err) {
          reject(getInternalError(err.message));
        }
      }
    );
  }
  /* eslint-enable no-async-promise-executor */

  private _convertToString(value: Package): string {
    return JSON.stringify(value, null, '\t');
  }


  /**
   * Retrieve the package.json for a specific package from the GCS bucket.
   * @param {string} packageName - The name of the package to retrieve the package.json file for.
   * @param {ReadPackageCallback} callback - The callback to call with the package.json object or a VerdaccioError object.
   */
  public readPackage(packageName: string, callback: ReadPackageCallback): void {
    this.logger.debug(`gcloud: [readPackage] start retrieving '${PACKAGE_JSON}' file for package '${packageName}'`);
    this._readPackage(packageName)
      .then((packageJson) => callback(null, packageJson))
      .catch((error) => callback(getNotFound(`failed retrieving '${PACKAGE_JSON}' file for package '${packageName}' from storage`)));
  }

  /**
   * Retrieve the package.json for a specific package from the GCS bucket. The package.json files are cached for
   * a small period of time in memory since Verdaccio has a tendency to make duplicate requests to read the package.json
   * file for packages depending on the operation being performed.
   * @param {string} packageName - The name of the package to retrieve the package.json file for.
   * @returns {Object} - The package.json parsed to an object.
   * @private
   */
  private async _readPackage(packageName: string): Promise<Package> {
    this.logger.debug(`gcloud: [_readPackage] start retrieving '${PACKAGE_JSON}' file for package '${packageName}'`);

    const cachedPackageJson = GoogleCloudStorageHandler.packageJsonCache[packageName];
    if (cachedPackageJson && cachedPackageJson.timestamp > new Date().getTime() - (PACKAGE_CACHE_TTL_SECONDS * 1000)) {
      const { content } = await cachedPackageJson;
      const packageJson: Package = JSON.parse(content[0].toString('utf8'));
      this.logger.info(`gcloud: [_readPackage] providing '${PACKAGE_JSON}' file for package '${packageName}' from CACHE`);
      return packageJson;
    }

    const file = this._buildFilePath(packageName, PACKAGE_JSON);
    try {
      const fileDownloadPromise = file.download();
      GoogleCloudStorageHandler.packageJsonCache[packageName] = { timestamp: new Date().getTime(), content: fileDownloadPromise };
      const content: DownloadResponse = await fileDownloadPromise;
      this.logger.info(`gcloud: [_readPackage] successfully retrieved '${PACKAGE_JSON}' file for package '${packageName}' from storage`);
      const packageJson: Package = JSON.parse(content[0].toString('utf8'));
      this.logger.trace(`gcloud: [_readPackage] '${PACKAGE_JSON}' file for package '${packageName}': ${JSON.stringify(packageJson)}`)
      GoogleCloudStorageHandler.packageJsonCache[packageName] = { timestamp: new Date().getTime(), content: content };
      return packageJson
    } catch (error) {
      this.logger.error(`gcloud: [_readPackage] failed retrieving '${PACKAGE_JSON}' file for package '${packageName}' from storage: ${error.message}`);
      throw error;
    }
  }

  private _fileExist(name: string, fileName: string): Promise<boolean> {
    return new Promise(
      async (resolve, reject): Promise<void> => {
        const file: File = this._buildFilePath(name, fileName);
        try {
          const data = await file.exists();
          const exist = data[0];

          resolve(exist);
          this.logger.debug({ name: name, exist }, 'gcloud: check whether @{name} exist successfully: @{exist}');
        } catch (err) {
          this.logger.error(
            { name: file.name, err: err.message },
            'gcloud: check exist package @{name} has failed, cause: @{err}'
          );

          reject(getInternalError(err.message));
        }
      }
    );
  }
  /* eslint-disable no-async-promise-executor */

  public writeTarball(name: string): UploadTarball {
    const uploadStream: UploadTarball = new UploadTarball({});

    try {
      this._fileExist(this.name, name).then(
        (exist: boolean): void => {
          if (exist) {
            this.logger.debug({ url: this.name }, 'gcloud:  @{url} package already exists in the storage bucket');
            uploadStream.emit('error', packageAlreadyExist(name));
          } else {
            const file =this._getBucket().file(`${this.name}/${name}`);
            this.logger.info({ url: file.name }, 'gcloud: the @{url} is being uploaded to the storage bucket');
            const fileStream = file.createWriteStream({
              validation: this.config?.bucketOptions?.validation || DEFAULT_VALIDATION,
            });
            uploadStream.done = (): void => {
              uploadStream.on('end', (): void => {
                fileStream.on('response', (): void => {
                  this.logger.debug({ url: file.name }, 'gcloud: @{url} has been successfully uploaded to the storage');
                  uploadStream.emit('success');
                });
              });
            };

            fileStream._destroy = function(err: Error): void {
              // this is an error when user is not authenticated
              // [BadRequestError: Could not authenticate request
              //  getaddrinfo ENOTFOUND www.googleapis.com www.googleapis.com:443]
              if (err) {
                uploadStream.emit('error', getBadRequest(err.message));
                fileStream.emit('close');
              }
            };

            fileStream.on('open', (): void => {
              this.logger.debug({ url: file.name }, 'gcloud: upload streem has been opened for @{url}');
              uploadStream.emit('open');
            });

            fileStream.on('error', (err: Error): void => {
              this.logger.error({ url: file.name }, 'gcloud: upload stream has failed for @{url}');
              fileStream.end();
              uploadStream.emit('error', getBadRequest(err.message));
            });

            uploadStream.abort = (): void => {
              this.logger.warn({ url: file.name }, 'gcloud: upload stream has been aborted for @{url}');
              fileStream.destroy(undefined);
            };

            uploadStream.pipe(fileStream);
            uploadStream.emit('open');
          }
        },
        (err: Error): void => {
          uploadStream.emit('error', getInternalError(err.message));
        }
      );
    } catch (err) {
      uploadStream.emit('error', err);
    }
    return uploadStream;
  }

  public readTarball(name: string): ReadTarball {
    const localReadStream: ReadTarball = new ReadTarball({});
    const file: File = this._getBucket().file(`${this.name}/${name}`);
    const bucketStream: Readable = file.createReadStream();
    this.logger.debug({ url: file.name }, 'gcloud: reading tarball from @{url}');

    localReadStream.abort = function abortReadTarballCallback(): void {
      bucketStream.destroy(undefined);
    };

    bucketStream
      .on('error', (err: VerdaccioError): void => {
        if (err.code === HTTP_STATUS.NOT_FOUND) {
          this.logger.debug({ url: file.name }, 'gcloud: tarball @{url} do not found on storage');
          localReadStream.emit('error', getNotFound());
        } else {
          this.logger.error({ url: file.name }, 'gcloud: tarball @{url} has failed to be retrieved from storage');
          localReadStream.emit('error', getBadRequest(err.message));
        }
      })
      .on('response', (response): void => {
        const size = response.headers['content-length'];
        const { statusCode } = response;
        if (statusCode !== HTTP_STATUS.NOT_FOUND) {
          if (size) {
            localReadStream.emit('open');
          }

          if (parseInt(size, 10) === 0) {
            this.logger.error({ url: file.name }, 'gcloud: tarball @{url} was fetched from storage and it is empty');
            localReadStream.emit('error', getInternalError('file content empty'));
          } else if (parseInt(size, 10) > 0 && statusCode === HTTP_STATUS.OK) {
            localReadStream.emit('content-length', response.headers['content-length']);
          }
        } else {
          this.logger.debug({ url: file.name }, 'gcloud: tarball @{url} do not found on storage');
          localReadStream.emit('error', getNotFound());
        }
      })
      .pipe(localReadStream);
    return localReadStream;
  }
}

export default GoogleCloudStorageHandler;
