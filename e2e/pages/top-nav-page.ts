import { Locator } from "@playwright/test";

export class TopNavPage {
  page: Locator;
  logo: Locator;
  search: Locator;
  settings: Locator;
  info: Locator;
  darkMode: Locator;
  lightMode: Locator;
  login: Locator;
  header: Locator;

  constructor(page) {
    this.page = page;
    this.logo = page.getByRole('link', { name: 'logo' });
    this.search = page.getByTestId('header-right').getByRole('button').first();
    this.settings = page.getByTestId('header--tooltip-settings');
    this.info = page.getByTestId('header--tooltip-info');
    this.darkMode = page.getByTestId('header--button--dark');
    this.lightMode = page.getByTestId('header--button--light');
    this.login = page.getByTestId('header--button-login');
    this.header = page.getByTestId('header');
  }

  async clickOnSettings(): Promise<void> {
    await this.page.getByTestId('header--tooltip-settings').click();
  }

  async clickOnInfo(): Promise<void> {
    await this.page.getByTestId('header--tooltip-info').click();
  }

  async clickOnDarkMode(): Promise<void> {
    await this.page.getByTestId('header--button--dark').click();
  }

  async clickOnLightMode(): Promise<void> {
    await this.page.getByTestId('header--button--light').click();
  }

  async clickOnLogin(): Promise<void> {
    await this.page.getByTestId('header--button-login').click();
  }
}
