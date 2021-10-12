# verdaccio-google-cloud-storage
☁️📦 Google Cloud storage plugin for verdaccio

The source code for this project is based on: https://github.com/verdaccio/monorepo/tree/v10.0.6/plugins/google-cloud
and implements missing functionality from the official Verdaccio maintained `google-cloud` storage plugin.

## Requirements
* Google Cloud Platform Account.
* Google Cloud Platform project that is using [Google Firestore in Datastore mode](https://cloud.google.com/firestore/docs/firestore-or-datastore).
* Service account with ability to:
  * read and write to the Verdaccio GCP Storage Bucket.
  * read and write to the Verdaccio GCP Datastores.
  * read the JWT signing secret stored in GCP Secrets Manager.

### GCP Project Service Account Permissions
The below permissions (JSON format) should be attached to the Verdaccio Service Account when running command:
```bash
gcloud projects get-iam-policy <PROJECT_NAME> --format=json
```
```json
{
  "bindings": [
    {
      "role": "roles/datastore.user",
      "members": ["serviceAccount:<SERVICE_ACCOUNT_NAME>"]
    },
    {
      "role": "roles/storage.objectAdmin",
      "members": ["serviceAccount:<SERVICE_ACCOUNT_NAME>"],
      "condition": {
        "title": "Verdaccio Bucket",
        "description": "Allow access only to bucket '<VERDACCIO_BUCKET>'",
        "expression": "resource.name.startsWith(\"projects/_/buckets/<VERDACCIO_BUCKET>\")"
      }
    },
    {
      "role": "roles/secretmanager.secretAccessor",
      "members": ["serviceAccount:<SERVICE_ACCOUNT_NAME>"],
      "condition": {
        "title": "Verdaccio Secret",
        "description": "Allow access only to secret '<VERDACCIO_SECRET>'",
        "expression": "resource.name.startsWith(\"projects/<PROJECT_NUMBER>/secrets/<VERDACCIO_SECRET>\")"
      }
    }
  ]
}
```

## TODO
The following items still need to be addressed:
- [ ] Implement the `search` method in `storage.ts` that allows the `npm search <string>` command to work against the
  registry.
- [ ] Fix unit tests. Unit tests have are busted since refactoring the code to clean up `storage.ts` and add missing
  token methods: `saveToken`, `deleteToken`, and `readTokens`.
- [ ] Fix `npm run build:types` script. It fails in the [original monorepo](https://github.com/verdaccio/monorepo/tree/v10.0.6/plugins/google-cloud) as well.
- [ ] Update dev dependencies. Many of them are out of date and have `high` vulnerability warnings.

## Configuration
Complete configuration example:
```yaml
store:
  google-cloud-storage:
    ## Mandatory. Google Cloud Platform Project ID.
    projectId: name-of-your-project

    ## Optional. Google Cloud Platform only recommends using this file for development.
    # keyFileName: /absolute/path/to/key/file

    ## Mandatory. Name of the GCP Bucket to store packages to.
    ## This plugin does not create the bucket. It has to already exist.
    bucketName: name-of-the-bucket

    ## Mandatory. The name of the GCP Secret Manager JWT signing secret.
    ## This plugin does not create the secret. It has to already exist.
    secretName: 'name-of-the-secret'

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
