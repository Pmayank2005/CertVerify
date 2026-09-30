const { test, expect } = require('@playwright/test');
const { ethers } = require('ethers');
const { PDFDocument } = require('pdf-lib');
const QRCode = require('qrcode');
const abi = require('../frontend/abi');
const registry = new ethers.utils.Interface(abi);
const account = '0x1111111111111111111111111111111111111111';
const hash = '0x' + 'ab'.repeat(32);

test.beforeEach(async ({ page }) => {
  await page.route('**/deployments/CertificateRegistry-ganache.json', route => route.fulfill({ json: { contractAddress: account } }));
  await page.route('**/data/certificates.json', route => route.fulfill({ json: {} }));
  await page.route('http://127.0.0.1:8545/**', route => {
    const request = route.request().postDataJSON();
    const respond = req => {
      let result = '0x0';
      if (req.method === 'eth_chainId') result = '0x539';
      if (req.method === 'net_version') result = '1337';
      if (req.method === 'eth_call') {
        const call = registry.parseTransaction({ data: req.params[0].data });
        const values = {
          issuer: [account], getTotalIssuedCount: [0], getCertificateStatus: [0],
          getCertificate: [[call.args[0], ethers.constants.AddressZero, 0, '', 0]],
        };
        result = registry.encodeFunctionResult(call.name, values[call.name]);
      }
      return { jsonrpc: '2.0', id: req.id, result };
    };
    return route.fulfill({ json: Array.isArray(request) ? request.map(respond) : respond(request) });
  });
});

test('Angular navigates between all pages without reloading or losing the design', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('app-root')).toHaveAttribute('ng-version', /^21\./);
  await expect(page.locator('h1')).toContainText("can't be forged");
  await page.evaluate(() => window.navigationMarker = 'same-document');
  await page.getByRole('link', { name: 'Issuer Portal', exact: true }).click();
  await expect(page).toHaveURL(/\/issuer$/);
  await page.getByRole('button', { name: 'Issue with Raw Data' }).click();
  await expect(page.locator('#rawIssuancePanel')).toBeVisible();
  await expect(page.locator('#rawTemplateId option')).toHaveCount(4);
  await page.locator('nav').getByRole('link', { name: 'Verify', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Verify a certificate');
  await expect(page.locator('#walletStatus')).toHaveText('Not connected');
  expect(await page.evaluate(() => window.navigationMarker)).toBe('same-document');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('legacy hash and ID deep links retain their query parameters', async ({ page }) => {
  await page.goto('/verifier.html?hash=' + hash);
  await expect(page).toHaveURL('/verify?hash=' + hash);
  await expect(page.locator('#verifyHash')).toHaveValue(hash);
  await expect(page.locator('#verifyResult')).toContainText('Not Found');
  await page.goto('/verifier.html?id=CERT-MISSING');
  await expect(page).toHaveURL('/verify?id=CERT-MISSING');
  await expect(page.locator('#verifyResult')).toContainText('Certificate ID was not found');
  await page.goto('/issuer.html');
  await expect(page).toHaveURL('/issuer');
});

test('verification form submits once with Enter and clears', async ({ page }) => {
  let statusCalls = 0;
  page.on('request', request => {
    if (request.url().startsWith('http://127.0.0.1:8545') && request.postData()?.includes(registry.getSighash('getCertificateStatus').slice(2))) statusCalls++;
  });
  await page.goto('/verify');
  await page.locator('#verifyHash').fill(hash);
  await page.locator('#verifyHash').press('Enter');
  await expect(page.locator('#verifyResult')).toContainText('Not Found');
  expect(statusCalls).toBe(1);
  await page.locator('#clearBtn').click();
  await expect(page.locator('#verifyHash')).toHaveValue('');
  await expect(page.locator('#verifyPlaceholder')).toBeVisible();
});

test('raw certificate preview generates a PDF and invalidates after editing', async ({ page }) => {
  await page.goto('/issuer');
  await page.getByRole('button', { name: 'Issue with Raw Data' }).click();
  for (const [id, value] of Object.entries({ rawStudentName: 'Angular Student', rawCourse: 'Computer Science', rawInstitution: 'Test University', rawIssueDate: '2026-09-30' })) await page.locator('#' + id).fill(value);
  await page.locator('#generateRawPreviewBtn').click();
  await expect(page.locator('#rawReview')).toBeVisible();
  await expect(page.locator('#rawReviewSummary')).toContainText('Angular Student');
  await expect(page.locator('#rawCertificatePreview')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#issueRawBtn')).toBeDisabled();
  await page.locator('#confirmRawIssue').check();
  await expect(page.locator('#issueRawBtn')).toBeEnabled();
  await page.locator('#rawStudentName').fill('Changed Student');
  await expect(page.locator('#rawReview')).toBeHidden();
});

test('CSV validation and ZIP generation work', async ({ page }) => {
  await page.goto('/issuer');
  await page.getByRole('button', { name: 'Issue with Raw Data' }).click();
  await page.getByRole('button', { name: 'Multiple students' }).click();
  await page.locator('#bulkCsvInput').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from('studentName,course,institution,issueDate\nAngular Student,CS,Test University,2026-09-30') });
  await expect(page.locator('#bulkColumnMapping')).toBeVisible();
  for (const field of ['studentName', 'course', 'institution', 'issueDate']) await page.locator('#bulkMap_' + field).selectOption(field);
  await page.locator('#validateBulkRowsBtn').click();
  await expect(page.locator('#generateBulkCertificatesBtn')).toBeEnabled();
  await page.locator('#generateBulkCertificatesBtn').click();
  await expect(page.locator('#downloadBulkZipBtn')).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.locator('#downloadBulkZipBtn').click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});

test('PDF upload hashes locally and the issuer can review its metadata', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const buffer = Buffer.from(await pdf.save());
  await page.goto('/verify');
  await page.locator('#verifyPdfInput').setInputFiles({ name: 'certificate.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('#verifyHash')).toHaveValue(ethers.utils.sha256(buffer));
  await expect(page.locator('#verifyResult')).toContainText('Not Found');
  await page.locator('nav').getByRole('link', { name: 'Issuer Portal' }).click();
  await page.getByRole('button', { name: 'Issue with PDF' }).click();
  await page.locator('#pdfFileInput').setInputFiles({ name: 'certificate.pdf', mimeType: 'application/pdf', buffer });
  for (const [id, value] of Object.entries({ pdfStudentName: 'PDF Student', pdfCourse: 'CS', pdfInstitution: 'Test University', pdfIssueDate: '2026-09-30', pdfIssuerName: 'Issuer' })) await page.locator('#' + id).fill(value);
  await page.locator('#preparePdfReviewBtn').click();
  await expect(page.locator('#pdfReview')).toBeVisible();
  await expect(page.locator('#pdfReviewSummary')).toContainText(ethers.utils.sha256(buffer));
});

test('QR scanner accepts repeated uploads and survives route changes', async ({ page }) => {
  const buffer = await QRCode.toBuffer('http://127.0.0.1:8089/verifier.html?hash=' + hash);
  await page.goto('/verify');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('#qrFileInput').setInputFiles({ name: `qr-${attempt}.png`, mimeType: 'image/png', buffer });
    await expect(page.locator('#verifyResult')).toContainText('Not Found');
    await page.locator('#clearBtn').click();
  }
  await page.locator('nav').getByRole('link', { name: 'Overview' }).click();
  await page.locator('nav').getByRole('link', { name: 'Verify', exact: true }).click();
  await page.locator('#qrFileInput').setInputFiles({ name: 'qr-return.png', mimeType: 'image/png', buffer });
  await expect(page.locator('#verifyResult')).toContainText('Not Found');
});

test('wallet state survives navigation and account events update the Angular header', async ({ page }) => {
  await page.addInitScript(({ account }) => {
    const listeners = {};
    window.ethereum = {
      request: async ({ method }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
        if (method === 'eth_chainId') return '0x539';
        return null;
      },
      on: (name, listener) => { (listeners[name] ||= []).push(listener); },
      emit: (name, value) => { for (const listener of listeners[name] || []) listener(value); },
    };
  }, { account });
  await page.goto('/');
  await expect(page.locator('#walletStatus')).toHaveText('Connected');
  await page.locator('nav').getByRole('link', { name: 'Verify', exact: true }).click();
  await expect(page.locator('#walletStatus')).toHaveText('Connected');
  await page.evaluate(() => window.ethereum.emit('chainChanged', '0x1'));
  await expect(page.locator('#networkTag')).toContainText('Wrong network');
  await page.locator('#connectBtn').click();
  await expect(page.locator('#walletStatus')).toHaveText('Not connected');
  await page.locator('nav').getByRole('link', { name: 'Overview' }).click();
  await expect(page.locator('#walletStatus')).toHaveText('Not connected');
});
