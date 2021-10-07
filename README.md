# verdaccio-google-cloud-storage
☁️📦 Google Cloud storage plugin for verdaccio

The source code for this project is based on: https://github.com/verdaccio/monorepo/tree/v10.0.6/plugins/google-cloud
and implements missing functionality from the official Verdaccio maintained `google-cloud` storage plugin.

### Requirements
* Google Cloud Platform Account
* Google Cloud Platform project that is using [Google Firestore in Datastore mode](https://cloud.google.com/firestore/docs/firestore-or-datastore)
* Service account with 'Cloud Datastore Owner' role and read/write access to the storage bucket
* Verdaccio server (see below)

### Configuration
Complete configuration example:
```yaml
store:
  google-cloud:
   ## google project id
   projectId: project-01 || env (GOOGLE_CLOUD_VERDACCIO_PROJECT_ID)

   ## The namespace for metadata database. Defaults to 'VerdaccioDataStore'.
   # kind: someRandomMetadataDatabaseKey

   ## This plugin does not create the bucket. It has to already exist.
   bucket: my-bucket-name

   ## Google Cloud Platform only recommends using this file for development.
   ## This field is optional.
   # keyFilename: /path/project-01.json || env (GOOGLE_CLOUD_VERDACCIO_KEY)

   ## The default validation is crc32c. It can be overridden using the
   ## https://googleapis.dev/nodejs/storage/latest/global.html#CreateWriteStreamOptions
   ## of https://googleapis.dev/nodejs/storage/latest/File.html#createWriteStream
   # validation: crc32c

   ## Enable/disable resumable uploads to GC Storage
   ## By default it's enabled in `@google-cloud/storage`.
   ## This may cause failures for small package uploads so it is recommended to set it to `false`.
   ## @see https://stackoverflow.com/questions/53172050/google-cloud-storage-invalid-upload-request-error-bad-request
   resumable: false
```

## License
[MIT Licensed](http://www.opensource.org/licenses/mit-license.php)
