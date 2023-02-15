import { Locator } from "@playwright/test";

export class InfoPage {
  page: Locator;
  infoHeader: Locator;

  constructor(page) {
    this.page = page;
    this.infoHeader = page.getByRole('heading', { name: 'Information' });
  }

  async closeInfo(): Promise<void> {
    await this.page.getByRole('button', { name: 'Close' }).click();
  }
}
