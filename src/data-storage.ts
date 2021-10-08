import { Storage } from '@google-cloud/storage';
import { Datastore, DatastoreOptions } from '@google-cloud/datastore';
import { CommitResponse } from '@google-cloud/datastore/build/src/request';
import { RunQueryResponse } from '@google-cloud/datastore/build/src/query';
import { entity } from '@google-cloud/datastore/build/src/entity';
import { getServiceUnavailable, getInternalError, VerdaccioError } from '@verdaccio/commons-api';
import { Logger, Callback, IPluginStorage, ITokenActions, Token, TokenFilter, IPackageStorageManager } from '@verdaccio/types';

import { VerdaccioGoogleStorageConfig } from './types';
import StorageHelper, { IStorageHelper } from './storage-helper';
import GoogleCloudStorageHandler from './storage';

export const ERROR_MISSING_CONFIG = 'Google cloud storage config missing. Add `store.google-cloud-storage` to your config file.';

class GoogleCloudDatabase implements IPluginStorage<VerdaccioGoogleStorageConfig>, ITokenActions {
  private helper: IStorageHelper;
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
    this.helper = new StorageHelper(this.datastore, this.storage, this.config);
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
    const { helper, config, logger } = this;
    return new GoogleCloudStorageHandler(packageInfo, helper, config, logger);
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
   * @param {function} cb - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: `null` as the first argument and an array of package names as the second argument.
   */
  public get(cb: Callback): void {
    this.logger.debug('gcloud: [datastore get] init');

    const query = this.datastore.createQuery(this.kindPackageStore);
    this.logger.trace({ query }, 'gcloud: [datastore get] query @{query}');

    this.helper.runQuery(query).then((data: RunQueryResponse): void => {
      const response: object[] = data[0]; // array of results
      const pagingData = data[1]; // { moreResults: "NO_MORE_RESULTS", endCursor: "..." }

      this.logger.trace({ response }, 'gcloud: [datastore get] query results @{response}');

      const names = response.reduce((accumulator: string[], task: any): string[] => {
        accumulator.push(task.name);
        return accumulator;
      }, []);

      this.logger.trace({ names }, 'gcloud: [datastore get] names @{names}');
      cb(null, names);
    });
  }

  /**
   * Add a new package name entry to the registry. Called when the `npm publish` command is run.
   * @param {string} name - The name of the package being added.
   * @param {function} cb - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: `null` as the first argument.
   */
  public add(name: string, cb: Callback): void {
    const key = this.datastore.key([this.kindPackageStore, name]);
    const data = {
      name: name,
    };
    this.logger.debug('gcloud: [datastore add] @{name} init');

    this.datastore
      .save({
        key: key,
        data: data,
      })
      .then((response: CommitResponse): void => {
        const res = response[0];

        this.logger.debug('gcloud: [datastore add] @{name} has been added');
        this.logger.trace({ res }, 'gcloud: [datastore add] @{name} response: @{res}');

        cb(null);
      })
      .catch((err: Error): void => {
        const error: VerdaccioError = getInternalError(err.message);

        this.logger.debug({ error }, 'gcloud: [datastore add] @{name} error @{error}');
        cb(getInternalError(error.message));
      });
  }

  /**
   * Remove a package name entry from the registry. Called when the `npm unpublish --force` command is run.
   * @param {string} name - The name of the package being removed.
   * @param {function} cb - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: `null` as the first argument.
   */
  public remove(name: string, cb: Callback): void {
    this.logger.debug('gcloud: [datastore remove] @{name} init');

    // const deletedItems: any = [];
    // const sanityCheck = (deletedItems: any): null | Error => {
    //   if (typeof deletedItems === 'undefined' || deletedItems.length === 0 || deletedItems[0][0].indexUpdates === 0) {
    //     return getNotFound('trying to remove a package that does not exist');
    //   } else if (deletedItems[0][0].indexUpdates > 0) {
    //     return null;
    //   } else {
    //     return getInternalError('this should not happen');
    //   }
    // };
    this.helper
      .getEntities(this.kindPackageStore)
      .then(
        async (entities: any): Promise<void> => {
          for (const item of entities) {
            if (item.name === name) {
              await this._deleteItem(name, item);
              // deletedItems.push(deletedItem);
            }
          }
          cb(null);
        }
      )
      .catch((err: Error): void => {
        cb(getInternalError(err.message));
      });
  }

  public async _deleteItem(name: string, item: any): Promise<void | Error> {
    try {
      const key = this.datastore.key([this.kindPackageStore, this.datastore.int(item.id)]);
      await this.datastore.delete(key);
    } catch (err) {
      return Promise.reject(getInternalError(err.message));
    }
  }
}

export default GoogleCloudDatabase;
