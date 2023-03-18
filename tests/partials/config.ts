import { LoggerConfItem, PackageList, Security, UpLinksConfList } from '@verdaccio/types';
import { VerdaccioGoogleStorageConfig } from '../../src/types';

class Config implements VerdaccioGoogleStorageConfig {
  projectId: string;
  keyFileName?: string;
  bucketName: string;
  kind: string;
  self_path: string;
  secret: string;
  secretName: string;
  user_agent: string;
  server_id: string;
  packages: PackageList;
  uplinks: UpLinksConfList;
  logs: LoggerConfItem;
  security: Security;
  $key: any;
  $value: any;

  constructor() {
    this.self_path = './test';
    this.secret = '12345';
    this.secretName = 'some-secret';
    this.security = {} as unknown as Security;
    this.uplinks = {
      npmjs: {
        url: 'http://never_use:0000/'
      }
    };
    this.server_id = '';
    this.user_agent = '';
    this.packages = {};
    this.logs = {format: 'pretty', level: 'info', type: 'stdout'};
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
  clone(): Config {
    return Object.assign(new Config(), JSON.parse(JSON.stringify(this)));
  }
}

export default new Config();
