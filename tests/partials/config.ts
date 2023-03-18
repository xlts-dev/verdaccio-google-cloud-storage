import { VerdaccioGoogleStorageConfig } from '../../src/types';

class Config implements VerdaccioGoogleStorageConfig {
  projectId: string;
  keyFileName: string;
  bucketName: string;
  kind: string;
  self_path: string;
  secret: string;
  secretName: string;
  user_agent: string;
  server_id: string;
  packages: PackageList;
  uplinks: UpLinksConfList;
  logs: LoggerConf[];
  // @ts-ignore
  security: Security;
  $key: any;
  $value: any;

  constructor() {
    this.self_path = './test';
    this.secretName = '12345';
    this.uplinks = {
      npmjs: {
        url: 'http://never_use:0000/'
      }
    };
    this.server_id = '';
    this.user_agent = '';
    this.packages = {};
    this.logs = [];
    this.kind = 'partial_test_metadataDatabaseKey';
    this.bucketName = 'verdaccio-plugin';
    this.projectId = 'verdaccio-01';
    // this.keyFileName = './verdaccio-01-56f693e3aab0.json';
  }
  checkSecretKey(): string {
    return '';
  }
  getMatchedPackagesSpec(): void {
    return;
  }
}

export default new Config();
