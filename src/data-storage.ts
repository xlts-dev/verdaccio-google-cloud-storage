import { Storage } from '@google-cloud/storage';
import { Datastore, DatastoreOptions } from '@google-cloud/datastore';
import { CommitResponse } from '@google-cloud/datastore/build/src/request';
import { entity } from '@google-cloud/datastore/build/src/entity';
import { getServiceUnavailable, getInternalError, getNotFound, VerdaccioError } from '@verdaccio/commons-api';
import { Logger, Callback, IPluginStorage, ITokenActions, Token, TokenFilter, IPackageStorageManager } from '@verdaccio/types';

import { VerdaccioGoogleStorageConfig } from './types';
import GoogleCloudStorageHandler from './storage';

export const ERROR_MISSING_CONFIG = 'Google cloud storage config missing. Add `store.google-cloud-storage` to your config file.';

class GoogleCloudDatabase implements IPluginStorage<VerdaccioGoogleStorageConfig>, ITokenActions {
  public logger: Logger;
  public config: VerdaccioGoogleStorageConfig;
  private readonly kindPackageStore: string;
  private readonly kindTokenStore: string;
  private readonly datastore: Datastore;
  private readonly storage: Storage;

  public constructor(config: VerdaccioGoogleStorageConfig, options: any) {
    switch (true as boolean) {
      case !config:
        throw new Error(ERROR_MISSING_CONFIG);
      case !config.bucket || typeof config.bucket !== 'string':
        throw new Error('Google Cloud Storage requires a bucket name, please define one.');
      case !config.projectId || typeof config.projectId !== 'string':
        throw new Error('Google Cloud Storage requires a projectId.');
    }

    this.config = config;
    this.logger = options.logger;
    this.kindPackageStore = config?.kindNames?.packages || 'VerdaccioPackage';
    this.kindTokenStore = config?.kindNames?.tokens || 'VerdaccioToken'

    const storageOptions: DatastoreOptions = this._getGoogleStorageOptions(this.config);
    this.datastore = new Datastore(storageOptions);
    this.storage = new Storage(storageOptions);
  }

  private _getGoogleStorageOptions(config: VerdaccioGoogleStorageConfig): DatastoreOptions {
    const storageOptions: DatastoreOptions = {
      projectId: config.projectId
    };

    if (config.keyFileName) {
      storageOptions.keyFilename = config.keyFileName;
      this.logger.warn('Using credentials in a file might be un-secure and is only recommended for local development');
    }

    this.logger.warn({ content: JSON.stringify(storageOptions) }, 'Google storage settings: @{content}');
    return storageOptions;
  }

  public getPackageStorage(packageInfo: string): IPackageStorageManager {
    const { config, logger } = this;
    return new GoogleCloudStorageHandler(packageInfo, this.storage, config, logger);
  }

  public saveToken(token: Token): Promise<void> {
    this.logger.warn({ token }, 'save token has not been implemented yet @{token}');
    return Promise.reject(getServiceUnavailable('[saveToken] method not implemented'));
  }

  public deleteToken(user: string, tokenKey: string): Promise<void> {
    this.logger.warn({ tokenKey, user }, 'delete token has not been implemented yet @{user}');
    return Promise.reject(getServiceUnavailable('[deleteToken] method not implemented'));
  }

  public readTokens(filter: TokenFilter): Promise<Token[]> {
    this.logger.warn({ filter }, 'read tokens has not been implemented yet @{filter}');
    return Promise.reject(getServiceUnavailable('[readTokens] method not implemented'));
  }

  /**
   * Retrieve the JWT signing/verification secret from storage.
   * @returns {Promise<string>} - The JWT signing/verification secret.
   */
  public getSecret(): Promise<string> {
    const key: entity.Key = this.datastore.key(['Secret', 'secret']);
    this.logger.debug('gcloud: [datastore getSecret] init');

    return this.datastore
      .get(key)
      .then((data: object): string => {
        this.logger.trace({ data }, 'gcloud: [datastore getSecret] response @{data}');
        const entities = data[0];
        if (!entities) {
          // @ts-ignore
          return null;
        }
        return entities.secret;
      })
      .catch(
        (err: Error): Promise<string> => {
          const error: VerdaccioError = getInternalError(err.message);

          this.logger.warn({ error }, 'gcloud: [datastore getSecret] init error @{error}');
          return Promise.reject(getServiceUnavailable('[getSecret] permissions error'));
        }
      );
  }

  /**
   * Persist the JWT signing/verification secret to storage.
   * @param {string} secret - The secret string to persist to storage.
   */
  public setSecret(secret: string): Promise<CommitResponse> {
    const key = this.datastore.key(['Secret', 'secret']);
    const entity = {
      key,
      data: { secret },
    };
    this.logger.debug('gcloud: [datastore setSecret] added');

    return this.datastore.upsert(entity);
  }

  /**
   * @typedef {Object} onPackageItem - The metadata object to pass to the search `onPackage` callback function parameter.
   * @property {string} name - The name of the package.
   * @property {string} path - The path to the package within the storage system being used.
   * @property {number} time - The millisecond timestamp of when the package was last modified.
   */
  /**
   * Provides package metadata information for each package in the registry. Invoked when the `npm search` command is run.
   * TODO: This needs to be implemented if package searching is to be supported.
   * @param {function} onPackage - A callback function that should be invoked for each package in the registry.
   *  The argument passed to this function should be a {onPackageItem} object.
   * @param {function} onEnd - A callback function that should be invoked when no more packages are available.
   */
  public search(onPackage: Callback, onEnd: Callback): void {
    this.logger.warn('package search method has not been implemented yet');
    onEnd();
  }

  /**
   * Retrieve the full list of package names. Called when listing all packages from the web UI.
   * @param {function} callback - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: `null` as the first argument and an array of package names as the second argument.
   */
  public async get(callback: Callback): Promise<void> {
    this.logger.debug('gcloud: [datastore get] start retrieving package list from gcp datastore');
    const query = this.datastore.createQuery(this.kindPackageStore);
    this.logger.trace({ query }, 'gcloud: [datastore get] query: @{query}');

    try {
      const [packageEntities, pagingInfo] = await this.datastore.runQuery(query, { gaxOptions: { autoPaginate: true } });
      if (pagingInfo.moreResults !== Datastore.NO_MORE_RESULTS) {
        // **NOTE**: According to the GCP docs the nodejs GCP Datastore client "will automatically paginate through all of the
        // results that match a query". See: https://cloud.google.com/datastore/docs/concepts/queries#cursors_limits_and_offsets
        this.logger.warn({ pagingInfo }, 'gcloud: [datastore get] not all results were returned from the query, this is not expected; pagingInfo: @{pagingInfo}');
      }
      this.logger.debug('gcloud: [datastore get] successfully retrieved package list from gcp datastore');
      this.logger.trace({ packageEntities }, 'gcloud: [datastore get] packageEntities: @{packageEntities}');
      callback(null, packageEntities.map(({ packageName }) => packageName).sort());
    } catch (error: any) {
      this.logger.error({ error }, 'gcloud: [datastore get] error retrieving package list: @{error}');
      callback(getInternalError(error.message));
    }
  }

  /**
   * Add a new package name entry to the registry. Called when the `npm publish` command is run.
   * @param {string} packageName - The name of the package being added.
   * @param {function} callback - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: a falsey value as the first argument.
   */
  public async add(packageName: string, callback: Callback): Promise<void> {
    this.logger.info({ packageName }, 'gcloud: [datastore add] start adding package @{packageName}');
    const entity = {
      key: this.datastore.key([this.kindPackageStore, packageName]),
      data: { packageName },
    }
    this.logger.debug({ entity }, 'gcloud: [datastore add] adding entity: @{entity}');

    try {
      const result = await this.datastore.save(entity);
      this.logger.info({ packageName }, 'gcloud: [datastore add] package @{packageName} has been added');
      this.logger.debug({ packageName, result }, 'gcloud: [datastore add] package @{packageName} has been added: @{result}');
      callback();
    } catch (error: any) {
      this.logger.error({ packageName, error }, 'gcloud: [datastore add] error adding package @{packageName}: @{error}');
      callback(getInternalError(error.message));
    }
  }

  /**
   * Remove a package name entry from the registry. Called when the `npm unpublish --force` command is run.
   * @param {string} packageName - The name of the package being removed.
   * @param {function} callback - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: a falsey value as the first argument.
   */
  public async remove(packageName: string, callback: Callback): Promise<void> {
    this.logger.info({ packageName }, 'gcloud: [datastore remove] start removing package @{packageName}');
    const key = this.datastore.key([this.kindPackageStore, packageName]);
    this.logger.debug({ key }, 'gcloud: [datastore remove] checking for entity with key: @{key}');

    // Check to ensure that the package requested to be removed actually exists. If it does not, provide a 404 not found error response.
    try {
      const [entity] = await this.datastore.get(key);
      if (!entity) {
        this.logger.warn({ packageName }, 'gcloud: [datastore remove] package @{packageName} was not found');
        return callback(getNotFound(`package '${packageName}' was not found`));
      }
    } catch (error: any) {
      this.logger.error({ packageName, error }, 'gcloud: [datastore remove] error checking for existing package @{packageName}: @{error}');
      return callback(getInternalError(error.message));
    }

    try {
      const result = await this.datastore.delete(key);
      this.logger.info({ packageName }, 'gcloud: [datastore remove] package @{packageName} has been removed');
      this.logger.debug({ packageName, result }, 'gcloud: [datastore remove] package @{packageName} has been removed: @{result}');
      callback();
    } catch (error: any) {
      this.logger.error({ packageName, error }, 'gcloud: [datastore remove] error removing package @{packageName}: @{error}');
      return callback(getInternalError(error.message));
    }
  }
}

export default GoogleCloudDatabase;
