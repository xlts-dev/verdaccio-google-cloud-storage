import { Datastore, Query } from '@google-cloud/datastore';
import { Bucket, File, Storage } from '@google-cloud/storage';
import { RunQueryResponse } from '@google-cloud/datastore/build/src/query';

import { VerdaccioConfigGoogleStorage } from './types';

export interface IStorageHelper {
  datastore: Datastore;
  createQuery(key: string, valueQuery: string): Query;
  runQuery(query: Query): Promise<RunQueryResponse>;
  getEntities(key: string): Promise<Entity[]>;
  getBucket(): Bucket;
  buildFilePath(name: string, fileName: string): File;
  // updateEntity(key: string, excludeFromIndexes: any, data: any): Promise<CommitResult>;
  // getFile(bucketName: string, path: string): Promise<void>;
  // deleteEntity(key: string, itemId: any): Promise<any>;
}

export default class StorageHelper implements IStorageHelper {
  public datastore: Datastore;
  private storage: Storage;
  private config: VerdaccioConfigGoogleStorage;

  public constructor(datastore: Datastore, storage: Storage, config: VerdaccioConfigGoogleStorage) {
    this.datastore = datastore;
    this.config = config;
    this.storage = storage;
  }

  public createQuery(key: string, valueQuery: string): Query {
    const query = this.datastore.createQuery(key).filter('name', valueQuery);

    return query;
  }

  public buildFilePath(name: string, fileName: string): File {
    return this.getBucket().file(`${name}/${fileName}`);
  }

  public getBucket(): Bucket {
    return this.storage.bucket(this.config.bucket);
  }

  // TODO - If the datastore api requires paging this is not currently handled
  public async runQuery(query: Query): Promise<RunQueryResponse> {
    // https://cloud.google.com/datastore/docs/reference/data/rest/v1/projects/runQuery
    const result = await this.datastore.runQuery(query);

    return result;
  }

  /**
   * Data objects in Cloud Firestore in Datastore mode are known as entities.
   * An entity has one or more named properties, each of which can have one or more values.
   * Entities of the same kind do not need to have the same properties,
   * and an entity's values for a given property do not all need to be of the same data type.
   * (If necessary, an application can establish and enforce such restrictions in its own data model.)
   * https://cloud.google.com/datastore/docs/concepts/entities
   * @param key
   */
  public async getEntities(key: string): Promise<Entity[]> {
    const datastore = this.datastore;
    const query = datastore.createQuery(key);
    const dataQuery: RunQueryResponse = await datastore.runQuery(query);
    const response: object[] = dataQuery[0];

    const data = response.reduce((accumulator: Entity[], task: any): Entity[] => {
      const taskKey = task[datastore.KEY];
      if (task.name) {
        accumulator.push({
          id: taskKey.id,
          name: task.name,
        });
      }
      return accumulator;
    }, []);
    return data;
  }
}

export interface Entity {
  name: string;
  id: number;
}
