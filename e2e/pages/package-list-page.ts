import { Locator } from "@playwright/test";

export class PackageListPage {
  page: Locator;
  packageName: Locator;
  packageDescription: Locator;
  packageVersion: Locator;

  constructor(page) {
    this.page = page;
    this.packageName = page.getByRole('link', { name: '@xlts.dev-trial/angular-animate' });
    this.packageDescription = page.getByText('AngularJS module for animations');
    this.packageVersion = page.getByText('v1.8.2', { exact: true }).first();
  }

  async clickOnPackage(): Promise<void> {
    await this.page.getByRole('link', { name: '@xlts.dev-trial/angular-animate' }).click();
  }
}
