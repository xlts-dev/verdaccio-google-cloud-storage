import { Locator } from "@playwright/test";

export class LogoutPage {
  page: Locator;
  logoutButton: Locator;

  constructor(page) {
    this.page = page;
    this.logoutButton = page.getByTestId('logInDialogIcon');
  }

  async logout(): Promise<void> {
    await this.page.getByTestId('logInDialogIcon').click()
    await this.page.getByTestId('logOutDialogIcon').click();
  }
}

