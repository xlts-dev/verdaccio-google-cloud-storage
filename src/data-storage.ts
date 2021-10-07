import { Storage } from '@google-cloud/storage';
import { Datastore, DatastoreOptions } from '@google-cloud/datastore';
import { CommitResponse } from '@google-cloud/datastore/build/src/request';
import { RunQueryResponse } from '@google-cloud/datastore/build/src/query';
import { entity } from '@google-cloud/datastore/build/src/entity';
import { getServiceUnavailable, getInternalError, VerdaccioError } from '@verdaccio/commons-api';
import { Logger, Callback, IPluginStorage, ITokenActions, Token, TokenFilter, IPackageStorageManager } from '@verdaccio/types';

import { VerdaccioConfigGoogleStorage } from './types';
import StorageHelper, { IStorageHelper } from './storage-helper';
import GoogleCloudStorageHandler from './storage';

export const ERROR_MISSING_CONFIG = 'Google cloud storage config missing. Add `store.google-cloud-storage` to your config file.';

class GoogleCloudDatabase implements IPluginStorage<VerdaccioConfigGoogleStorage>, ITokenActions {
  private helper: IStorageHelper;
  public logger: Logger;
  public config: VerdaccioConfigGoogleStorage;
  private readonly dataStoreKind: string;
  private readonly datastore: Datastore;
  private readonly storage: Storage;

  public constructor(config: VerdaccioConfigGoogleStorage, options: any) {
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
    this.dataStoreKind = config.dataStoreKind || 'VerdaccioDataStore';

    const storageOptions: DatastoreOptions = this._getGoogleStorageOptions(this.config);
    this.datastore = new Datastore(storageOptions);
    this.storage = new Storage(storageOptions);
    this.helper = new StorageHelper(this.datastore, this.storage, this.config);
  }

  private _getGoogleStorageOptions(config: VerdaccioConfigGoogleStorage): DatastoreOptions {
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

  public getSecret(): Promise<string> {
    const key: entity.Key = this.datastore.key([this.dataStoreKind, 'secret']);
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

  public setSecret(secret: string): Promise<CommitResponse> {
    const key = this.datastore.key([this.dataStoreKind, 'secret']);
    const entity = {
      key,
      data: { secret },
    };
    this.logger.debug('gcloud: [datastore setSecret] added');

    return this.datastore.upsert(entity);
  }

  public get(cb: Callback): void {
    this.logger.debug('gcloud: [datastore get] init');

    const query = this.datastore.createQuery(this.dataStoreKind);
    this.logger.trace({ query }, 'gcloud: [datastore get] query @{query}');

    this.helper.runQuery(query).then((data: RunQueryResponse): void => {
      const response: object[] = data[0];

      this.logger.trace({ response }, 'gcloud: [datastore get] query results @{response}');

      const names = response.reduce((accumulator: string[], task: any): string[] => {
        accumulator.push(task.name);
        return accumulator;
      }, []);

      this.logger.trace({ names }, 'gcloud: [datastore get] names @{names}');
      cb(null, names);
    });
  }

  public search(onPackage: Callback, onEnd: Callback): void {
    this.logger.warn('search method has not been implemented yet');
    onEnd();
  }

  public add(name: string, cb: Callback): void {
    const key = this.datastore.key([this.dataStoreKind, name]);
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
      .getEntities(this.dataStoreKind)
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
      const key = this.datastore.key([this.dataStoreKind, this.datastore.int(item.id)]);
      await this.datastore.delete(key);
    } catch (err) {
      return Promise.reject(getInternalError(err.message));
    }
  }
}

export default GoogleCloudDatabase;
