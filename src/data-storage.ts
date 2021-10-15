import { Storage } from '@google-cloud/storage';
import { Datastore } from '@google-cloud/datastore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { ClientOptions } from 'google-gax/build/src/clientInterface';
import { getInternalError, getNotFound } from '@verdaccio/commons-api';
import { Logger, Callback, IPluginStorage, ITokenActions, Token, TokenFilter, IPackageStorageManager } from '@verdaccio/types';

import { VerdaccioGoogleStorageConfig } from './types';
import GoogleCloudStorageHandler from './storage';

export const ERROR_MISSING_CONFIG = 'GCS config missing. Add `store.google-cloud-storage` to your config file.';

class GoogleCloudDatabase implements IPluginStorage<VerdaccioGoogleStorageConfig>, ITokenActions {
  public logger: Logger;
  public config: VerdaccioGoogleStorageConfig;
  private cachedJwtSecret: string | null = null;
  private readonly kindPackageStore: string;
  private readonly kindTokenStore: string;
  private readonly datastore: Datastore;
  private readonly storage: Storage;
  private readonly secretManager: SecretManagerServiceClient;

  public constructor(config: VerdaccioGoogleStorageConfig, options: any) {
    switch (true as boolean) {
      case !config:
        throw new Error(ERROR_MISSING_CONFIG);
      case !config.bucketName:
      case typeof config.bucketName !== 'string':
        throw new Error('Google Cloud Storage requires a bucket name, please define one.');
      case !config.secretName:
      case typeof config.secretName !== 'string':
        throw new Error('Google Cloud Storage requires a secret name, please define one.');
    }

    this.config = config;
    this.logger = options.logger;
    this.kindPackageStore = config?.kindNames?.packages || 'VerdaccioPackage';
    this.kindTokenStore = config?.kindNames?.tokens || 'VerdaccioToken';

    const clientOptions: ClientOptions = this._getGoogleClientOptions(this.config);
    this.datastore = new Datastore(clientOptions);
    this.storage = new Storage(clientOptions);
    this.secretManager = new SecretManagerServiceClient(clientOptions);
  }

  private _getGoogleClientOptions(config: VerdaccioGoogleStorageConfig): ClientOptions {
    const clientOptions: ClientOptions = {
      projectId: config.projectId
    };

    if (config.keyFileName) {
      clientOptions.keyFilename = config.keyFileName;
      this.logger.warn('using credentials in a file might be insecure and is only recommended for local development');
    }

    this.logger.info(`google client options: ${JSON.stringify(clientOptions)}`);
    return clientOptions;
  }

  public getPackageStorage(packageInfo: string): IPackageStorageManager {
    const { config, logger } = this;
    return new GoogleCloudStorageHandler(packageInfo, this.storage, config, logger);
  }

  /**
   * Save a token metadata record.
   * @param {Token} token
   * @returns {Promise<void>}
   */
  public async saveToken(token: Token): Promise<void> {
    const { user, key } = token;
    this.logger.info(`gcloud: [datastore saveToken] start adding token metadata for user '${user}' and key '${key}' to datastore '${this.kindTokenStore}'`);
    const entity = {
      key: this.datastore.key([this.kindTokenStore, token.key]),
      data: token,
    }
    this.logger.debug(`gcloud: [datastore saveToken] adding entity: ${JSON.stringify(entity)}`);

    try {
      await this.datastore.save(entity);
      this.logger.info(`gcloud: [datastore saveToken] successfully added token metadata for user '${user}' and key '${key}' to datastore '${this.kindTokenStore}'`);
    } catch (error) {
      this.logger.error(`gcloud: [datastore saveToken] failed to add token metadata for user '${user}' and key '${key}' to datastore '${this.kindTokenStore}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletes a specific token metadata record for a specific user.
   * @param {string} user - The user the token belongs to.
   * @param {string} tokenKey - The unique key associated with the token.
   * @returns {Promise<void>}
   */
  public async deleteToken(user: string, tokenKey: string): Promise<void> {
    this.logger.info(`gcloud: [datastore deleteToken] start removing token metadata for user '${user}' and key '${tokenKey}' from datastore '${this.kindTokenStore}'`);
    const key = this.datastore.key([this.kindTokenStore, tokenKey]);
    this.logger.debug(`gcloud: [datastore deleteToken] checking for entity with key: ${JSON.stringify(key)}`);

    // Check to ensure that the token requested to be removed actually exists. If it does not, throw an error.
    // NOTE: by the time this code is reached the token should have been confirmed to exist as the `readTokens` method is called first and Verdaccio checks
    //   to ensure the token exists before the `deleteToken` method is called. This is just an extra safeguard.
    try {
      const [entity] = await this.datastore.get(key);
      if (!entity) {
        this.logger.warn(`gcloud: [datastore deleteToken] token metadata for user '${user}' and key '${tokenKey}' was not found in datastore '${this.kindTokenStore}'`);
        throw new Error(`Token metadata for user '${user}' and key '${tokenKey}' was not found`);
      }
    } catch (error) {
      this.logger.error(`gcloud: [datastore deleteToken] error checking for existing token metadata for user '${user}' and key '${tokenKey}' ` +
        `in datastore '${this.kindTokenStore}': ${error.message}`);
      throw error;
    }

    try {
      await this.datastore.delete(key);
      this.logger.info(`gcloud: [datastore deleteToken] successfully removed token metadata for user '${user}' and key '${tokenKey}' from datastore '${this.kindTokenStore}'`);
    } catch (error) {
      this.logger.error(`gcloud: [datastore deleteToken] failed to remove token metadata for user '${user}' and key '${tokenKey}' from datastore '${this.kindTokenStore}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve a list of token metadata objects.
   * @param {TokenFilter} filter - The filters to apply when retrieving the list.
   * @returns {Promise<Token[]>} - The list of tokens matching the provided filter.
   */
  public async readTokens(filter: TokenFilter): Promise<Token[]> {
    const { user } = filter; // `user` is the only filter property currently
    this.logger.info(`gcloud: [datastore readTokens] start retrieving token metadata for user '${user}' from datastore ${this.kindTokenStore}`);
    const query = this.datastore.createQuery(this.kindTokenStore)
      .filter('user', user);

    try {
      const [tokenEntities, pagingInfo] = await this.datastore.runQuery(query, { gaxOptions: { autoPaginate: true } });
      if (pagingInfo.moreResults !== Datastore.NO_MORE_RESULTS) {
        // **NOTE**: According to the GCP docs the nodejs GCP Datastore client "will automatically paginate through all of the
        // results that match a query". See: https://cloud.google.com/datastore/docs/concepts/queries#cursors_limits_and_offsets
        this.logger.warn(`gcloud: [datastore readTokens] not all results were returned from the query, this is not expected; pagingInfo: ${JSON.stringify(pagingInfo)}`);
      }
      this.logger.debug(`gcloud: [datastore readTokens] successfully retrieved token metadata for user '${user}' from datastore '${this.kindTokenStore}'`);
      this.logger.trace(`gcloud: [datastore readTokens] tokenEntities: ${JSON.stringify(tokenEntities)}`);
      return tokenEntities;
    } catch (error) {
      this.logger.error(`gcloud: [datastore readTokens] error retrieving token metadata for user '${user}' from datastore '${this.kindTokenStore}': ${error.message}`);
      return [];
    }
  }

  /**
   * Retrieve the JWT signing/verification secret from Secret Manager and cache it. If the secret has been previously retrieved,
   * return the cached value in order to reduce unnecessary API requests. The secret value is NOT expected to change.
   * @returns {Promise<string>} - The JWT signing/verification secret.
   */
  public async getSecret(): Promise<string> {
    if (this.cachedJwtSecret) {
      this.logger.debug('gcloud: [datastore getSecret] using cached secret value');
      return this.cachedJwtSecret;
    }
    this.logger.info(`gcloud: [datastore getSecret] start retrieving jwt signing secret '${this.config.secretName}'`);

    try {
      const [secret] = await this.secretManager.accessSecretVersion({
        name: `projects/${this.config.projectId}/secrets/${this.config.secretName}/versions/latest`
      });
      this.logger.info(`gcloud: [datastore getSecret] successfully retrieved jwt signing secret '${this.config.secretName}'`)
      if (!secret?.payload?.data) {
        this.logger.error(`gcloud: [datastore getSecret] jwt signing secret '${this.config.secretName}' does not have a value`);
        throw new Error(`JWT signing secret '${this.config.secretName}' does not have a value`);
      }
      const secretValue = secret.payload.data.toString()
      this.cachedJwtSecret = secretValue;
      return secretValue;
    } catch (error) {
      this.logger.error(`gcloud: [datastore getSecret] error retrieving jwt signing secret  '${this.config.secretName}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Persist the JWT signing/verification secret to Secret Manager. This method has purposefully been disabled in this plugin.
   * The JWT signing secret should be created outside this plugin.
   * @param {string} secret - The secret string to persist to storage.
   * @returns {Promise<void>}
   */
  public async setSecret(secret: string): Promise<void> {
    this.logger.warn('gcloud: [datastore setSecret] persistence of jwt signing secret has been disabled');
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
   * @returns {Promise<void>}
   */
  public async search(onPackage: Callback, onEnd: Callback): Promise<void> {
    this.logger.warn('package search has not been implemented');
    onEnd();
  }

  /**
   * Retrieve the full list of package names. Called when listing all packages from the web UI.
   * @param {function} callback - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: `null` as the first argument and an array of package names as the second argument.
   * @returns {Promise<void>}
   */
  public async get(callback: Callback): Promise<void> {
    this.logger.debug(`gcloud: [datastore get] start retrieving package list from datastore '${this.kindPackageStore}'`);
    const query = this.datastore.createQuery(this.kindPackageStore);

    try {
      const [packageEntities, pagingInfo] = await this.datastore.runQuery(query, { gaxOptions: { autoPaginate: true } });
      if (pagingInfo.moreResults !== Datastore.NO_MORE_RESULTS) {
        // **NOTE**: According to the GCP docs the nodejs GCP Datastore client "will automatically paginate through all of the
        // results that match a query". See: https://cloud.google.com/datastore/docs/concepts/queries#cursors_limits_and_offsets
        this.logger.warn(`gcloud: [datastore get] not all results were returned from the query, this is not expected; pagingInfo: ${JSON.stringify(pagingInfo)}`);
      }
      this.logger.debug(`gcloud: [datastore get] successfully retrieved package list from datastore '${this.kindPackageStore}'`);
      this.logger.trace(`gcloud: [datastore get] packageEntities: ${JSON.stringify(packageEntities)}`);
      callback(null, packageEntities.map(({ packageName }) => packageName).sort());
    } catch (error) {
      this.logger.error(`gcloud: [datastore get] error retrieving package list from datastore '${this.kindPackageStore}': ${error.message}`);
      callback(getInternalError(error.message));
    }
  }

  /**
   * Add a new package name entry to the registry. Called when the `npm publish` command is run.
   * @param {string} packageName - The name of the package being added.
   * @param {function} callback - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: a falsey value as the first argument.
   * @returns {Promise<void>}
   */
  public async add(packageName: string, callback: Callback): Promise<void> {
    this.logger.info(`gcloud: [datastore add] start adding package '${packageName}' to datastore '${this.kindPackageStore}'`);
    const entity = {
      key: this.datastore.key([this.kindPackageStore, packageName]),
      data: { packageName },
    }
    this.logger.debug(`gcloud: [datastore add] adding entity: ${JSON.stringify(entity)}`);

    try {
      await this.datastore.save(entity);
      this.logger.info(`gcloud: [datastore add] successfully added package '${packageName}' to datastore '${this.kindPackageStore}'`);
      callback();
    } catch (error) {
      this.logger.error(`gcloud: [datastore add] failed to add package '${packageName}' to datastore '${this.kindPackageStore}': ${error.message}`);
      callback(getInternalError(error.message));
    }
  }

  /**
   * Remove a package name entry from the registry. Called when the `npm unpublish --force` command is run.
   * @param {string} packageName - The name of the package being removed.
   * @param {function} callback - A callback function that should be invoked with:
   *  - If an error is encountered: an error as the first argument.
   *  - If NO error is encountered: a falsey value as the first argument.
   * @returns {Promise<void>}
   */
  public async remove(packageName: string, callback: Callback): Promise<void> {
    this.logger.info(`gcloud: [datastore remove] start removing package '${packageName}' from datastore '${this.kindPackageStore}'`);
    const key = this.datastore.key([this.kindPackageStore, packageName]);
    this.logger.debug(`gcloud: [datastore remove] checking for entity with key: ${JSON.stringify(key)}`);

    // Check to ensure that the package requested to be removed actually exists. If it does not, provide a 404 not found error response.
    try {
      const [entity] = await this.datastore.get(key);
      if (!entity) {
        this.logger.warn(`gcloud: [datastore remove] package '${packageName}' was not found in datastore '${this.kindPackageStore}'`);
        return callback(getNotFound(`package '${packageName}' was not found`));
      }
    } catch (error) {
      this.logger.error(`gcloud: [datastore remove] error checking for existing package '${packageName}' in datastore '${this.kindPackageStore}': ${error.message}`);
      return callback(getInternalError(error.message));
    }

    try {
      await this.datastore.delete(key);
      this.logger.info(`gcloud: [datastore remove] successfully removed package '${packageName}' from datastore '${this.kindPackageStore}'`);
      callback();
    } catch (error) {
      this.logger.error(`gcloud: [datastore remove] failed to remove package '${packageName}' from datastore '${this.kindPackageStore}': ${error.message}`);
      return callback(getInternalError(error.message));
    }
  }
}

export default GoogleCloudDatabase;
