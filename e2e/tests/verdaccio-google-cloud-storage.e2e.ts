import { test, expect } from '@playwright/test';
import { TopNavPage } from "../pages/top-nav-page";
import { SettingsPage } from "../pages/settings-page";
import { InfoPage } from "../pages/info-page";
import { LoginPage } from "../pages/login-page";
import { PackageListPage } from "../pages/package-list-page";
import { AnonymousPage } from "../pages/anonymous-page";
import { LogoutPage } from "../pages/logout-page";
import { PackageDetailPage } from "../pages/package-detail-page";

test.describe('verdaccio-google-cloud-storage', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:52454/');
  });

  test.use({
    colorScheme: 'dark'
  })

  test('should display title', async ({ page }) => {
    const anonymousPage = new AnonymousPage(page);
    await page.waitForEvent('requestfinished', request => request.url().includes('/packages'));
    await expect(anonymousPage.header).toHaveText('No Package Published Yet.');
  });

  test('Top Nav', async ({ page }) => {
    const topNavPage = new TopNavPage(page);

    await expect(topNavPage.logo).toBeVisible();
    await expect(topNavPage.search).toBeVisible();
    await expect(topNavPage.settings).toBeVisible();
    await expect(topNavPage.info).toBeVisible();
    await expect(topNavPage.darkMode).toBeVisible();
    await expect(topNavPage.login).toBeVisible();
  });

  test('Settings', async ({ page }) => {
    const topNavPage = new TopNavPage(page);
    const settingsPage = new SettingsPage(page);

    await topNavPage.clickOnSettings();
    await expect(settingsPage.settingsHeader).toHaveText('Configuration');

    await settingsPage.closeSettings();
    await expect(settingsPage.settingsHeader).not.toBeVisible();
  });

  test('Info', async ({ page }) => {
    const topNavPage = new TopNavPage(page);
    const infoPage = new InfoPage(page);

    await topNavPage.clickOnInfo();
    await expect(infoPage.infoHeader).toHaveText('Information');

    await infoPage.closeInfo();
    await expect(infoPage.infoHeader).not.toBeVisible();
  });

  test('Dark Light mode', async ({ page }) => {
    const topNavPage = new TopNavPage(page);

    await topNavPage.clickOnDarkMode();
    await expect(topNavPage.header).toHaveCSS('background-color', 'rgb(25, 118, 209)');

    await topNavPage.clickOnLightMode();
    await expect(topNavPage.header).toHaveCSS('background-color', 'rgb(37, 51, 65)');
  });

  test('Login', async ({ page }) => {
    const topNavPage = new TopNavPage(page);
    const loginPage = new LoginPage(page);
    const packageListPage = new PackageListPage(page);

    await topNavPage.clickOnLogin();
    await expect(loginPage.loginDialog).toBeVisible();
    await expect(loginPage.lockIcon).toBeVisible();
    await expect(loginPage.loginHeader).toHaveText('Login');
    await expect(loginPage.userName).toBeVisible();
    await expect(loginPage.password).toBeVisible();


    await loginPage.login();
    await page.waitForEvent('requestfinished', request => request.url().includes('/packages'));

    await expect(packageListPage.packageName).toHaveText('@xlts.dev-trial/angular-animate');
    await expect(packageListPage.packageDescription).toHaveText('AngularJS module for animations');
    await expect(packageListPage.packageVersion).toHaveText('v1.8.2');

  });

  test('Package Detail', async ({ page }) => {
    const packageDetailPage = new PackageDetailPage(page);
    const packageListPage = new PackageListPage(page);
    const loginPage = new LoginPage(page);
    const topNavPage = new TopNavPage(page);

    await topNavPage.clickOnLogin();
    await loginPage.login();
    await page.waitForEvent('requestfinished', request => request.url().includes('/packages'));

    await packageListPage.clickOnPackage();
    await page.waitForURL(url => url.toString().includes('detail/@xlts.dev-trial/angular-animate'))
    await expect(page.url()).toContain('detail/@xlts.dev-trial/angular-animate')

    await expect(packageDetailPage.name).toHaveText('@xlts.dev-trial/angular-animate');
    await expect(packageDetailPage.version).toHaveText('Latest v1.8.2');
    await expect(packageDetailPage.npm).toBeVisible();
    await expect(packageDetailPage.yarn).toBeVisible();
    await expect(packageDetailPage.pnpm).toBeVisible();
    await expect(packageDetailPage.author).toHaveText('Angular Core Team');

    await expect(packageDetailPage.readmeTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(packageDetailPage.readmeHeader).toHaveText('packaged angular-animate');


    await packageDetailPage.clickOnDependencies();
    await expect(packageDetailPage.dependenciesTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(packageDetailPage.dependencies).toHaveText('@xlts.dev-trial/angular-animate has no dependencies.');

    await packageDetailPage.clickOnVersions();
    await expect(packageDetailPage.versionsTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(packageDetailPage.currentTag).toContainText('1.8.2');

    await packageDetailPage.clickOnUplinks();
    await expect(packageDetailPage.uplinksTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(packageDetailPage.uplinks).toHaveText('@xlts.dev-trial/angular-animate has no uplinks.');
  });

  test('Logout', async ({ page }) => {
    const logoutPage = new LogoutPage(page);
    const loginPage = new LoginPage(page);
    const topNavPage = new TopNavPage(page);

    await topNavPage.clickOnLogin();
    await loginPage.login();
    await page.waitForEvent('requestfinished', request => request.url().includes('/packages'));

    await logoutPage.logout();

    await expect(loginPage.loginDialog).toBeVisible();
    await expect(topNavPage.login).toHaveText('Login');
  });
});
