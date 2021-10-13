import { Config } from '@verdaccio/types';

export interface VerdaccioGoogleStorageConfig extends Config {
  // The GCP project ID.
  // https://cloud.google.com/resource-manager/docs/creating-managing-projects
  projectId: string;
  // Absolute path to a GCP Key file to use. This should ONLY be used for local development.
  // https://cloud.google.com/iam/docs/creating-managing-service-account-keys
  keyFileName?: string;
  // Name of the bucket to store package files to.
  bucketName: string;
  // The name of the GCP Secret Manager JWT signing secret.
  secretName: string;
  // The name of the GCP Datastore kinds to use.
  // https://cloud.google.com/datastore/docs/concepts/entities
  kindNames?: VerdaccioGoogleStorageConfigKindNames;
  // Options when interacting with GCP bucket.
  bucketOptions?: VerdaccioGoogleStorageConfigBucketOptions;
}

export interface VerdaccioGoogleStorageConfigKindNames {
  // The name of the `kind` to store package names to.
  packages?: string;
  // The name of the `kind` to store token metadata to.
  tokens?: string;
}

export interface VerdaccioGoogleStorageConfigBucketOptions {
  // The type of validation to perform when writing data to the storage bucket.
  // https://cloud.google.com/storage/docs/hashes-etags
  validation?: 'crc32c' | 'md5' | false;
  // Whether resumable uploads are enabled for the storage bucket.
  // Usually should be set to `false` due to the referenced stack overflow issue.
  // https://stackoverflow.com/questions/53172050/google-cloud-storage-invalid-upload-request-error-bad-request
  // https://cloud.google.com/storage/docs/resumable-uploads
  resumable?: boolean;
}
