import { Locator } from "@playwright/test";

export class PackageDetailPage {
  page: Locator;
  name: Locator;
  version: Locator;
  npm: Locator;
  yarn: Locator;
  pnpm: Locator;
  author: Locator;
  readmeHeader: Locator;
  dependencies: Locator;
  currentTag: Locator;
  uplinks: Locator;
  readmeTab: Locator;
  dependenciesTab: Locator;
  versionsTab: Locator;
  uplinksTab: Locator;

  constructor(page) {
    this.page = page;
    this.name = page.getByText('@xlts.dev-trial/angular-animate', { exact: true });
    this.version = page.getByText('Latest v1.8.2');
    this.npm = page.getByTestId('installListItem-npm');
    this.yarn = page.getByTestId('installListItem-yarn');
    this.pnpm = page.getByTestId('installListItem-pnpm');
    this.author = page.getByRole('button', { name: 'Angular Core Team Angular Core Team' });
    this.readmeHeader = page.getByRole('heading', { name: 'packaged angular-animate' });
    this.dependencies = page.getByRole('heading', { name: '@xlts.dev-trial/angular-animate has no dependencies.' });
    this.currentTag = page.getByText('latest1.8.2');
    this.uplinks = page.getByRole('heading', { name: '@xlts.dev-trial/angular-animate has no uplinks.' });
    this.readmeTab = page.getByTestId('readme-tab');
    this.dependenciesTab = page.getByTestId('dependencies-tab');
    this.versionsTab = this.page.getByTestId('versions-tab');
    this.uplinksTab = page.getByTestId('uplinks-tab');

  }

  async clickOnDependencies(): Promise<void> {
    await this.page.getByTestId('dependencies-tab').click();
  }

  async clickOnVersions(): Promise<void> {
    await this.page.getByTestId('versions-tab').click();
  }

  async clickOnUplinks(): Promise<void> {
    await this.page.getByTestId('uplinks-tab').click();
  }
}
