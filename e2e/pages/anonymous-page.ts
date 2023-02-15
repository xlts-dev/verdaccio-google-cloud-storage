import { Locator } from "@playwright/test";

export class AnonymousPage {
  page: Locator;
  homeContainer: Locator;
  header: Locator;

  constructor(page) {
    this.page = page;
    this.homeContainer = page.getByTestId('home-page-container');
    this.header = page.getByRole('heading', { name: 'No Package Published Yet.' });
  }
}
