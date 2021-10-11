# verdaccio-google-cloud-storage
☁️📦 Google Cloud storage plugin for verdaccio

The source code for this project is based on: https://github.com/verdaccio/monorepo/tree/v10.0.6/plugins/google-cloud
and implements missing functionality from the official Verdaccio maintained `google-cloud` storage plugin.

## Requirements
* Google Cloud Platform Account.
* Google Cloud Platform project that is using [Google Firestore in Datastore mode](https://cloud.google.com/firestore/docs/firestore-or-datastore).
* Service account with ability to:
  * read and write to the Verdaccio storage bucket.
  * read and write to the Verdaccio Datastores.
  * read the JWT signing secret stored in secrets manager.

## Configuration
Complete configuration example:
```yaml
store:
  google-cloud-storage:
    ## Google Cloud Platform Project ID.
    projectId: xlts-dev-staging

    ## Optional. Google Cloud Platform only recommends using this file for development.
    # keyFileName: /absolute/path/to/key/file

    ## Mandatory. Name of the GCP Bucket to store packages to.
    ## This plugin does not create the bucket. It has to already exist.
    bucketName: xlts-dev-staging-verdaccio-storage

    ## The name of the GCP Secret Manager JWT signing secret.
    ## This plugin does not create the secret. It has to already exist.
    secretName: 'verdaccio-jwt-secret'

    ## Optional. Name of the GCP Datastore `kind`s to store entities to.
    # kindNames:
      ## Optional. Name of the `kind` to store package names to. Defaults to 'VerdaccioPackage'.
      # packages: VerdaccioPackage
      ## Optional. Name of the `kind` to store token metadata to. Defaults to 'VerdaccioPackage'.
      # tokens: VerdaccioToken

    ## Optional. Specific options when interacting with GCP Bucket storage.
    bucketOptions:
      ## Optional. The type of validation to use when performing write operations. Defaults to 'crc32c'. See:
      ## https://googleapis.dev/nodejs/storage/latest/global.html#CreateWriteStreamOptions
      # validation: crc32c
      ## Enable/disable resumable uploads to GCP Bucket storage
      ## The `@google-cloud/storage` SDK enables this by default.
      ## This may cause failures for small package uploads, so it is recommended to set this value to `false`.
      ## @see https://stackoverflow.com/questions/53172050/google-cloud-storage-invalid-upload-request-error-bad-request
      resumable: false
```

## License
[MIT Licensed](http://www.opensource.org/licenses/mit-license.php)
