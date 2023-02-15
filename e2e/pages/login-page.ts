import { Locator } from "@playwright/test";

export class LoginPage {
  page: Locator;
  loginDialog: Locator;
  lockIcon: Locator;
  loginHeader: Locator;
  userName: Locator;
  password: Locator;

  constructor(page) {
    this.page = page;
    this.loginDialog = page.getByTestId('dialogContentLogin');
    this.lockIcon = page.getByTestId('LockOutlinedIcon');
    this.loginHeader = page.getByRole('heading', { name: 'Login' });
    this.userName = page.getByPlaceholder('Your username');
    this.password = page.getByPlaceholder('Your strong password');
  }

  async closeSettings(): Promise<void> {
    await this.page.getByRole('button', { name: 'Close' }).click();
  }

  async login(): Promise<void> {
    await this.page.getByPlaceholder('Your username').fill('admin');
    await this.page.getByPlaceholder('Your strong password').fill('password');
    await this.page.getByTestId('login-dialog-form-login-button').click();
  }
}

