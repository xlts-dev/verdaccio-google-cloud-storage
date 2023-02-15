import { Locator } from "@playwright/test";

export class SettingsPage {
  page: Locator;
  settingsHeader: Locator;

  constructor(page) {
    this.page = page;
    this.settingsHeader = page.getByRole('heading', { name: 'Configuration' });
  }

  async closeSettings(): Promise<void> {
    await this.page.getByRole('button', { name: 'Close' }).click();
  }
}
