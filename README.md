# verdaccio-google-cloud-storage [![CircleCI](https://circleci.com/gh/xlts-dev/verdaccio-google-cloud-storage.svg?style=svg)](https://circleci.com/gh/xlts-dev/verdaccio-google-cloud-storage)
☁️📦 Google Cloud storage plugin for Verdaccio.

The source code for this project started based on: https://github.com/verdaccio/monorepo/tree/v10.0.6/plugins/google-cloud
and implements missing functionality from the official Verdaccio maintained `google-cloud` storage plugin.

## Requirements
* Google Cloud Platform Account.
* Google Cloud Platform project that is using [Google Firestore in Datastore mode](https://cloud.google.com/firestore/docs/firestore-or-datastore).
* Service account with ability to:
  * read and write to the Verdaccio GCS Bucket.
  * read and write to Cloud Firestore in Datastore mode.
  * read the JWT signing secret stored in GCP Secret Manager.

## Installation
Verdaccio loads storage plugins in a very specific manner where the name of the plugin under the `storage` property of
the `config.yaml` needs to line up exactly with the folder the plugin resides in under the `plugins` folder configuration
value that is configured in the same `config.yaml` file.

So, when Verdaccio sees this configuration in the `config.yaml` file:
```yaml
# path to the plugins directory
plugins: /verdaccio/plugins

store:
  google-cloud-storage: {} # assume the rest of the `@xlts.dev/verdaccio-google-cloud-store` config is present
```

Verdaccio will look for the plugin at this path: `/verdaccio/plugins/verdaccio-google-cloud-storage`. Verdaccio
**automatically adds** the `verdaccio-` prefix to the directory path when looking for the plugin. Assuming the Verdaccio
`plugins` directory has been configured to `/verdaccio/plugins`, the below commands can be used to install the
`@xlts.dev/verdaccio-google-cloud-store` plugin:
```bash
mkdir /tmp/verdaccio-plugin
cd /tmp/verdaccio-plugin
npm install --global-style --no-bin-links --no-optional verdaccio-google-cloud-storage@npm:@xlts.dev/verdaccio-google-cloud-storage
mv node_modules/verdaccio-google-cloud-storage /verdaccio/plugins
```

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

## Configuration
Complete configuration example:
```yaml
store:
  google-cloud-storage:
    ## Mandatory. Google Cloud Platform Project ID.
    projectId: name-of-your-project

    ## Optional. Google Cloud Platform only recommends using this file for development.
    # keyFileName: /absolute/path/to/key/file

    ## Mandatory. Name of the GCS Bucket to store packages in.
    ## This plugin does not create the bucket. It has to already exist.
    bucketName: name-of-the-bucket

    ## Mandatory. The name of the GCP Secret Manager JWT signing secret.
    ## This plugin does not create the secret. It has to already exist.
    secretName: 'name-of-the-secret'

    ## Optional. Name of the GCP Datastore `kind`s to store entities to.
    # kindNames:
      ## Optional. Name of the `kind` to store package names to. Defaults to 'VerdaccioPackage'.
      # packages: VerdaccioPackage
      ## Optional. Name of the `kind` to store token metadata to. Defaults to 'VerdaccioToken'.
      # tokens: VerdaccioToken
      ## Optional. The namespace to store entities in.
      # namespace: default
      
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
