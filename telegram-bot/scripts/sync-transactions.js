#!/usr/bin/env bun

/**
 * ICS Bank to Lunch Money Transaction Sync (Puppeteer-based)
 *
 * This script uses Puppeteer to automate:
 * 1. Login to ICS bank with email/password
 * 2. Wait for 2FA confirmation
 * 3. Fetch transactions for configured period
 * 4. Sync transactions to Lunch Money
 */

import puppeteer from "puppeteer-core";

// Read environment variables
const ICS_EMAIL = process.env.ICS_EMAIL;
const ICS_PASSWORD = process.env.ICS_PASSWORD;
const ICS_ACCOUNT_NUMBER = process.env.ICS_ACCOUNT_NUMBER; // Optional - will auto-detect if not set
const LUNCHMONEY_TOKEN = process.env.LUNCHMONEY_TOKEN;
const LUNCHMONEY_ASSET_ID = process.env.LUNCHMONEY_ASSET_ID;
const SYNC_DAYS_STR = process.env.SYNC_DAYS;
const SYNC_DAYS = SYNC_DAYS_STR ? parseInt(SYNC_DAYS_STR) : null;

// Validate required environment variables
const requiredVars = {
  ICS_EMAIL,
  ICS_PASSWORD,
  LUNCHMONEY_TOKEN,
  LUNCHMONEY_ASSET_ID,
  SYNC_DAYS: SYNC_DAYS_STR, // Validate as string before parsing
};

for (const [key, value] of Object.entries(requiredVars)) {
  if (!value || (typeof value === "string" && value.includes("your_"))) {
    console.error(
      JSON.stringify({
        success: false,
        error: `Missing or invalid environment variable: ${key}`,
        step: "validation",
      })
    );
    process.exit(1);
  }
}

// Parse SYNC_DAYS after validation
const SYNC_DAYS_PARSED = SYNC_DAYS || 30;

// Variables to be determined during runtime
let accountNumber = ICS_ACCOUNT_NUMBER;
const assetId = parseInt(LUNCHMONEY_ASSET_ID);

// ICS Bank base URL
const ICS_BASE_URL = "https://www.icscards.nl";
const LUNCHMONEY_API_URL = "https://api.lunchmoney.dev/v2/transactions";

/**
 * Simple text logging for sync script (Bun-friendly)
 */
function formatLog(level, step, message, context = {}) {
  const timestamp = new Date().toISOString();
  const contextParts = [];
  
  // Only include important context fields to avoid clutter
  const importantFields = ['accountNumber', 'transactionsCount', 'chunkIndex', 'totalChunks', 'error',
    'date', 'description', 'billingAmount', 'debitCredit', 'signedAmount'];
  for (const [key, value] of Object.entries(context)) {
    if (importantFields.includes(key) && value !== undefined) {
      contextParts.push(`${key}=${value}`);
    }
  }
  
  const contextStr = contextParts.length > 0 ? ' | ' + contextParts.join(' ') : '';
  return `${timestamp} [${level}] ${step}: ${message}${contextStr}`;
}

function logInfo(step, message, context = {}) {
  console.error(formatLog('INFO', step, message, context));
  
  // Also log as JSON for bot parsing (backward compatibility)
  console.error(JSON.stringify({ step, message }));
}

function logError(step, message, error, context = {}) {
  const errorContext = {
    ...context,
    error: error?.message || String(error),
  };
  console.error(formatLog('ERROR', step, message, errorContext));
}

function logDebug(step, message, context = {}) {
  if (process.env.LOG_LEVEL === 'DEBUG') {
    console.error(formatLog('DEBUG', step, message, context));
  }
}

// Puppeteer configuration
const PUPPETEER_EXECUTABLE_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/chromium");
const PUPPETEER_HEADLESS = process.env.PUPPETEER_HEADLESS !== "false";

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get date chunks (30-day intervals) for transaction fetching
 */
function getDateChunks(syncDays) {
  const chunks = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - syncDays);

  let current = new Date(startDate);
  while (current < today) {
    let chunkEnd = new Date(current);
    chunkEnd.setDate(current.getDate() + 30);
    if (chunkEnd > today) chunkEnd = today;

    chunks.push({
      from: formatDate(current),
      to: formatDate(chunkEnd),
    });

    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);
  }

  return chunks;
}

/**
 * Launch browser
 */
async function launchBrowser() {
  logInfo("browser_launch", "Launching browser...", {
    executablePath: PUPPETEER_EXECUTABLE_PATH,
    headless: PUPPETEER_HEADLESS,
  });

  try {
    const browser = await puppeteer.launch({
      executablePath: PUPPETEER_EXECUTABLE_PATH,
      headless: PUPPETEER_HEADLESS,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    logInfo("browser_launch", "Browser launched successfully", {
      headless: PUPPETEER_HEADLESS,
    });

    return browser;
  } catch (error) {
    logError("browser_launch", "Failed to launch browser", error, {
      executablePath: PUPPETEER_EXECUTABLE_PATH,
    });
    throw error;
  }
}

/**
 * Login flow: navigate to login page, fill form, submit
 */
async function login(page) {
  logInfo("page_load", "Loading login page...", {
    url: `${ICS_BASE_URL}/web/consumer/abnamro/sca-login`,
  });

  const loginUrl = `${ICS_BASE_URL}/web/consumer/abnamro/sca-login?URL=abnamro%2Fdashboard`;

  try {
    const response = await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 30000 });
    logInfo("page_load", "Login page loaded", {
      status: response?.status(),
      finalUrl: page.url(),
    });
  } catch (error) {
    logError("page_load", "Failed to load login page", error, {
      url: loginUrl,
      currentUrl: page.url(),
    });
    throw error;
  }

  // Handle cookie consent banner
  try {
    const cookieButtonSelectors = [
      '[data-cookiefirst-action="accept"]',
      'button[id*="accept"]',
      "#truste-consent-button",
    ];

    let cookieAccepted = false;
    for (const selector of cookieButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await page.waitForTimeout(500);
          cookieAccepted = true;
          logDebug("page_load", "Cookie consent accepted", { selector });
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    if (!cookieAccepted) {
      logDebug("page_load", "No cookie banner found or already accepted");
    }
  } catch (e) {
    logDebug("page_load", "Cookie banner handling error (non-fatal)", { error: e.message });
  }

  logInfo("fill_form", "Filling credentials...", {
    emailLength: ICS_EMAIL?.length || 0,
    passwordLength: ICS_PASSWORD?.length || 0,
  });

  // Wait for form inputs to be visible - use XPath to find by aria-label or visible text
  let submitButton = null;
  try {
    // Wait for any input field to appear
    await page.waitForSelector(
      'input[type="text"], input[type="email"], input:not([type])',
      { timeout: 10000 }
    );

    // Set values directly via JavaScript
    const result = await page.evaluate(
      (email, password) => {
        const inputs = Array.from(document.querySelectorAll("input"));

        // Find username field
        const usernameField = inputs.find((input) => {
          const type = input.type;
          const isVisible = input.offsetParent !== null;
          const isTextInput = !type || type === "text" || type === "email";
          return isVisible && isTextInput;
        });

        // Find password field
        const passwordField = inputs.find((input) => {
          const type = input.type;
          const isVisible = input.offsetParent !== null;
          return isVisible && type === "password";
        });

        if (usernameField) {
          usernameField.value = email;
          usernameField.dispatchEvent(new Event("input", { bubbles: true }));
          usernameField.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (passwordField) {
          passwordField.value = password;
          passwordField.dispatchEvent(new Event("input", { bubbles: true }));
          passwordField.dispatchEvent(new Event("change", { bubbles: true }));
        }

        return {
          usernameFound: !!usernameField,
          passwordFound: !!passwordField,
          usernameLength: usernameField ? usernameField.value.length : 0,
          passwordLength: passwordField ? passwordField.value.length : 0,
        };
      },
      ICS_EMAIL,
      ICS_PASSWORD
    );

    logDebug("fill_form", "Form fields found", {
      usernameFound: result.usernameFound,
      passwordFound: result.passwordFound,
      usernameLength: result.usernameLength,
      passwordLength: result.passwordLength,
    });

    if (!result.usernameFound || !result.passwordFound) {
      logError("fill_form", "Could not find username or password field", null, {
        usernameFound: result.usernameFound,
        passwordFound: result.passwordFound,
      });
      throw new Error("Could not find username or password field");
    }

    await page.waitForTimeout(500);

    // Find login button by text
    const loginButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find(
        (btn) =>
          btn.textContent.includes("Inloggen") ||
          btn.textContent.includes("Login") ||
          btn.getAttribute("type") === "submit"
      );
    });

    if (!loginButton || !(await loginButton.asElement())) {
      throw new Error("Could not find login button");
    }

    submitButton = loginButton.asElement();
    logDebug("fill_form", "Login button found");
  } catch (error) {
    logError("fill_form", "Failed to find or fill form fields", error);
    throw error;
  }

  logInfo("submit_form", "Submitting login form...");

  try {
    // Click submit button
    await submitButton.click();
    await page.waitForTimeout(1000);
    logDebug("submit_form", "Login form submitted, waiting for navigation");
  } catch (error) {
    logError("submit_form", "Failed to submit login form", error);
    throw error;
  }

  // Try to wait for navigation, but don't fail if it doesn't happen immediately
  try {
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 });
    logDebug("submit_form", "Navigation completed after form submit", {
      url: page.url(),
    });
  } catch (navError) {
    logDebug("submit_form", "Navigation timeout (expected, will check in 2FA wait)", {
      currentUrl: page.url(),
      error: navError.message,
    });
    // Navigation might not happen immediately - that's OK, we'll check in wait2FA
  }
}

/**
 * Wait for 2FA confirmation
 */
async function wait2FA(page) {
  const startTime = Date.now();
  logInfo("2fa_wait", "Waiting for 2FA confirmation (check your phone)...", {
    timeout: 120000,
    currentUrl: page.url(),
  });

  // Wait for navigation to dashboard or 2FA completion
  // The page should navigate after 2FA is confirmed
  try {
    await page.waitForFunction(
      () => {
        const currentUrl = window.location.href;
        // Check if URL changed from login page
        return (
          !currentUrl.includes("sca-login") &&
          (currentUrl.includes("dashboard") ||
            currentUrl.includes("account") ||
            currentUrl.includes("abnamro"))
        );
      },
      { timeout: 120000 }
    );

    const finalUrl = page.url();
    const waitTime = Date.now() - startTime;
    logInfo("2fa_verified", `2FA confirmed! Navigated to: ${finalUrl}`, {
      finalUrl,
      waitTimeMs: waitTime,
    });

    // Wait a bit for page to settle and set cookies
    await page.waitForTimeout(1000);
    logDebug("2fa_verified", "Page settled, cookies should be set");
  } catch (error) {
    const currentUrl = page.url();
    const waitTime = Date.now() - startTime;
    logError("2fa_timeout", `Timeout waiting for 2FA. Current URL: ${currentUrl}`, error, {
      currentUrl,
      waitTimeMs: waitTime,
      timeout: 120000,
    });
    throw new Error(
      "2FA verification timeout - please confirm on your phone and try again"
    );
  }
}

/**
 * Extract cookies and XSRF token from page
 */
async function extractCookies(page) {
  try {
    const cookies = await page.cookies();
    const cookieMap = new Map();
    let xsrfToken = null;

    for (const cookie of cookies) {
      cookieMap.set(cookie.name, cookie.value);
      if (cookie.name === "XSRF-TOKEN") {
        xsrfToken = decodeURIComponent(cookie.value);
      }
    }

    logDebug("extract_cookies", "Cookies extracted", {
      cookieCount: cookies.length,
      hasXsrfToken: !!xsrfToken,
      cookieNames: Array.from(cookieMap.keys()),
    });

    return { cookies: cookieMap, xsrfToken };
  } catch (error) {
    logError("extract_cookies", "Failed to extract cookies", error);
    throw error;
  }
}

/**
 * Determine account number (auto-detect or use env var)
 */
async function determineAccountNumber(page, cookieMap, xsrfToken) {
  logInfo("determine_account", "Determining account...", {
    accountNumberProvided: !!accountNumber,
  });

  try {
    // Use browser context to make API call (cookies are automatically included)
    logDebug("determine_account", "Fetching accounts from API", {
      hasXsrfToken: !!xsrfToken,
    });
    
    const accountsData = await page.evaluate(async (xsrfToken) => {
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
    };

    if (xsrfToken) {
      headers["X-XSRF-TOKEN"] = xsrfToken;
    }

    const response = await fetch("/api/nl/sec/frontendservices/allaccountsv2", {
      method: "GET",
      headers: headers,
      credentials: "include", // Important: include cookies
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch accounts: ${response.status} ${errorText}`
      );
    }

    return await response.json();
  }, xsrfToken);

    logInfo("determine_account", "Accounts fetched", {
      accountsCount: Array.isArray(accountsData) ? accountsData.length : 1,
    });

    // Update cookies from page (in case new ones were set)
    const { cookies: updatedCookieMap, xsrfToken: updatedToken } =
      await extractCookies(page);
    const accounts = Array.isArray(accountsData) ? accountsData : [accountsData];

    if (accounts.length === 0) {
      logError("determine_account", "No accounts found", null);
      throw new Error("No accounts found");
    }

    // If account number is already set, validate it exists
    if (accountNumber) {
      const foundAccount = accounts.find(
        (acc) => acc.accountNumber === accountNumber
      );
      if (!foundAccount) {
        logError("determine_account", `Account ${accountNumber} not found in available accounts`, null, {
          requestedAccount: accountNumber,
          availableAccounts: accounts.map(a => a.accountNumber),
        });
        throw new Error(
          `Account ${accountNumber} not found in available accounts`
        );
      }
      logInfo("account_selected", `Using account: ${accountNumber}`, {
        accountNumber,
        accountName: foundAccount.accountName || foundAccount.productName,
      });
      return {
        accountNumber,
        cookieMap: updatedCookieMap,
        xsrfToken: updatedToken,
      };
    }

    // If only one account, use it automatically
    if (accounts.length === 1) {
      accountNumber = accounts[0].accountNumber;
      logInfo("account_auto_detected", `Auto-detected single account: ${accountNumber}`, {
        accountNumber,
        accountName: accounts[0].accountName || accounts[0].productName,
      });
      return {
        accountNumber,
        cookieMap: updatedCookieMap,
        xsrfToken: updatedToken,
      };
    }

    // Multiple accounts found - fetch latest transaction for each to help user decide
    logInfo("fetch_account_details", `Found ${accounts.length} accounts, fetching details...`, {
      accountsCount: accounts.length,
      accountNumbers: accounts.map(a => a.accountNumber),
    });

  const accountDetails = [];

  for (const account of accounts) {
    try {
      const until = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);

      // Use browser context for API call
      const transactions = await page.evaluate(
        async (accountNumber, fromDate, untilDate, xsrfToken) => {
          const url =
            `/api/nl/sec/frontendservices/transactionsv3/search` +
            `?accountNumber=${accountNumber}` +
            `&debitCredit=DEBIT_AND_CREDIT` +
            `&fromDate=${fromDate}` +
            `&untilDate=${untilDate}`;

          const headers = {
            Accept: "application/json, text/plain, */*",
          };

          if (xsrfToken) {
            headers["X-XSRF-TOKEN"] = xsrfToken;
          }

          const response = await fetch(url, {
            method: "GET",
            headers: headers,
            credentials: "include",
          });

          if (!response.ok) {
            return null;
          }

          return await response.json();
        },
        account.accountNumber,
        formatDate(from),
        formatDate(until),
        updatedToken
      );

      let latestTransaction = null;
      if (
        transactions &&
        Array.isArray(transactions) &&
        transactions.length > 0
      ) {
        latestTransaction = transactions[0];
      }

      accountDetails.push({
        accountNumber: account.accountNumber,
        accountName: account.accountName || account.productName || "Unknown",
        balance: account.balance || "N/A",
        latestTransaction: latestTransaction
          ? {
              date: latestTransaction.transactionDate,
              description: latestTransaction.description,
              amount: latestTransaction.billingAmount,
            }
          : null,
      });
      } catch (err) {
        logError("fetch_account_details", `Failed to fetch details for account ${account.accountNumber}`, err, {
          accountNumber: account.accountNumber,
        });
        accountDetails.push({
          accountNumber: account.accountNumber,
          accountName: account.accountName || "Unknown",
          balance: "N/A",
          latestTransaction: null,
        });
      }
    }

  // Format error message with account details
  let errorMessage = `Multiple accounts found (${accounts.length}). Please set ICS_ACCOUNT_NUMBER in .env:\n\n`;

  for (const detail of accountDetails) {
    errorMessage += `Account: ${detail.accountNumber}\n`;
    errorMessage += `Name: ${detail.accountName}\n`;
    if (detail.balance !== "N/A") {
      errorMessage += `Balance: ${detail.balance}\n`;
    }
    if (detail.latestTransaction) {
      errorMessage += `Latest transaction:\n`;
      errorMessage += `  - Date: ${detail.latestTransaction.date}\n`;
      errorMessage += `  - Amount: ${detail.latestTransaction.amount}\n`;
      errorMessage += `  - Description: ${detail.latestTransaction.description}\n`;
    } else {
      errorMessage += `No recent transactions found\n`;
    }
    errorMessage += "\n";
  }

    errorMessage +=
      "Add one of these account numbers to your .env file:\nICS_ACCOUNT_NUMBER=<account_number>";

    logError("determine_account", "Multiple accounts found, user must specify", null, {
      accountsCount: accounts.length,
      accountDetails: accountDetails.map(d => ({
        accountNumber: d.accountNumber,
        accountName: d.accountName,
      })),
    });
    throw new Error(errorMessage);
  } catch (error) {
    if (error.message.includes("Multiple accounts")) {
      throw error; // Re-throw our formatted error
    }
    logError("determine_account", "Failed to determine account", error);
    throw error;
  }
}

/**
 * Fetch transactions in chunks
 */
async function fetchTransactions(page, accountNumber, cookieMap, xsrfToken) {
  logInfo("fetch_transactions", "Fetching transactions...", {
    accountNumber,
    syncDays: SYNC_DAYS_PARSED,
  });

  const chunks = getDateChunks(SYNC_DAYS_PARSED);
  const allTransactions = [];

  logInfo("fetch_transactions", `Prepared ${chunks.length} date chunks`, {
    chunksCount: chunks.length,
    chunks: chunks.map(c => `${c.from} to ${c.to}`),
  });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    logInfo("fetch_chunk", `Fetching transactions from ${chunk.from} to ${chunk.to} (chunk ${i + 1}/${chunks.length})...`, {
      chunkIndex: i + 1,
      totalChunks: chunks.length,
      fromDate: chunk.from,
      untilDate: chunk.to,
    });

    // Use browser context for API call (cookies are automatically included)
    const transactions = await page.evaluate(
      async (accountNumber, fromDate, untilDate, xsrfToken) => {
        const url =
          `/api/nl/sec/frontendservices/transactionsv3/search` +
          `?accountNumber=${accountNumber}` +
          `&debitCredit=DEBIT_AND_CREDIT` +
          `&fromDate=${fromDate}` +
          `&untilDate=${untilDate}`;

        const headers = {
          Accept: "application/json, text/plain, */*",
        };

        if (xsrfToken) {
          headers["X-XSRF-TOKEN"] = xsrfToken;
        }

        const response = await fetch(url, {
          method: "GET",
          headers: headers,
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to fetch transactions: ${response.status} ${errorText}`
          );
        }

        return await response.json();
      },
      accountNumber,
      chunk.from,
      chunk.to,
      xsrfToken
    );

    if (!Array.isArray(transactions)) {
      logError("fetch_chunk", "Invalid transactions response", null, {
        chunkIndex: i + 1,
        responseType: typeof transactions,
        responsePreview: JSON.stringify(transactions).substring(0, 200),
      });
      throw new Error(
        `Invalid transactions response: ${JSON.stringify(transactions)}`
      );
    }

    allTransactions.push(...transactions);

    logInfo("chunk_complete", `Fetched ${transactions.length} transactions from ${chunk.from} to ${chunk.to}`, {
      chunkIndex: i + 1,
      totalChunks: chunks.length,
      transactionsInChunk: transactions.length,
      totalTransactionsSoFar: allTransactions.length,
      fromDate: chunk.from,
      untilDate: chunk.to,
    });
  }

  logInfo("fetch_transactions", "All transactions fetched", {
    totalTransactions: allTransactions.length,
    chunksProcessed: chunks.length,
    accountNumber,
  });

  return { transactions: allTransactions };
}

/**
 * Create a tag in Lunch Money v2 API (returns existing if duplicate)
 */
async function createTag(tagName) {
  logDebug("tag_create", `Creating tag: ${tagName}`);

  try {
    const resp = await fetch("https://api.lunchmoney.dev/v2/tags", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LUNCHMONEY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: tagName }),
    });

    const responseText = await resp.text();
    logDebug("tag_create_response", "Tag creation response", {
      status: resp.status,
      statusText: resp.statusText,
      responsePreview: responseText.substring(0, 200),
    });

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logError("tag_parse_error", "Failed to parse tag response", parseError, {
        responseText: responseText.substring(0, 200),
      });
      throw new Error(`Invalid JSON response from Lunch Money tags endpoint: ${responseText.substring(0, 100)}`);
    }

    // 201 = created, 400 with existing tag = already exists
    if (resp.status === 201) {
      if (!data.id) {
        logError("tag_missing_id", "Tag created but no ID returned", null, {
          response: JSON.stringify(data).substring(0, 200),
        });
        throw new Error("Tag created but no ID returned from Lunch Money");
      }
      logInfo("tag_created", `Created tag: ${tagName}`, { tagId: data.id });
      return data.id;
    }

    // Check for error in response
    if (data.error) {
      logDebug("tag_error_response", "Tag creation returned error", {
        error: data.error,
        status: resp.status,
      });
    }

    // If tag exists, fetch it
    if (resp.status === 400) {
      logDebug("tag_fetch_existing", "Tag may already exist, fetching all tags");
      const getResp = await fetch("https://api.lunchmoney.dev/v2/tags", {
        headers: { Authorization: `Bearer ${LUNCHMONEY_TOKEN}` },
      });

      if (!getResp.ok) {
        logError("tag_fetch_error", "Failed to fetch tags list", null, {
          status: getResp.status,
          statusText: getResp.statusText,
        });
        throw new Error(`Failed to fetch tags: ${getResp.status}`);
      }

      const getResponseText = await getResp.text();
      let tagsData;
      try {
        tagsData = JSON.parse(getResponseText);
      } catch (parseError) {
        logError("tags_list_parse_error", "Failed to parse tags list response", parseError, {
          responseText: getResponseText.substring(0, 200),
        });
        throw new Error("Failed to parse tags list from Lunch Money");
      }

      const tags = tagsData.tags || tagsData;
      if (!Array.isArray(tags)) {
        logError("tags_not_array", "Tags response is not an array", null, {
          responseKeys: Object.keys(tagsData),
          responsePreview: JSON.stringify(tagsData).substring(0, 200),
        });
        throw new Error("Unexpected tags response format from Lunch Money");
      }

      const existing = tags.find((t) => t.name === tagName);
      if (existing) {
        logInfo("tag_found", `Using existing tag: ${tagName}`, { tagId: existing.id });
        return existing.id;
      }

      logError("tag_not_found", "Tag creation failed and tag not found in existing tags", null, {
        tagName,
        existingTagNames: tags.map(t => t.name).slice(0, 10),
      });
    }

    // Log unexpected status
    logError("tag_unexpected_status", "Unexpected response from tag creation", null, {
      status: resp.status,
      statusText: resp.statusText,
      response: JSON.stringify(data).substring(0, 500),
    });

    throw new Error(`Failed to create tag: ${resp.status} - ${JSON.stringify(data).substring(0, 200)}`);
  } catch (error) {
    if (error.message.includes("Failed to create tag") || error.message.includes("Lunch Money")) {
      throw error;
    }
    logError("tag_create_exception", "Exception during tag creation", error, {
      tagName,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Transform transactions for Lunch Money v2 API
 */
function transformTransactions(transactions, tagId) {
  return transactions.map((t) => {
    // Determine amount sign for Lunch Money v2 API:
    // NEGATIVE amounts = expenses (debits, money out)
    // POSITIVE amounts = income (credits, money in)
    const amount = parseFloat(t.billingAmount);
    const signedAmount =
      t.debitCredit === "DEBIT" ? -Math.abs(amount) : Math.abs(amount);

    // Debug log for each transaction to verify debitCredit from ICS
    logDebug("transform_transaction", "Processing transaction", {
      date: t.transactionDate,
      description: t.description?.substring(0, 50),
      billingAmount: t.billingAmount,
      debitCredit: t.debitCredit,
      signedAmount,
    });

    // Build notes for foreign currency transactions
    let notes = "";
    if (t.sourceCurrency && t.sourceCurrency !== t.billingCurrency) {
      notes = `Original: ${t.sourceAmount} ${t.sourceCurrency}`;
    }

    // Build unique external_id
    // Set EXTERNAL_ID_SUFFIX env var to force reimport (e.g., "v2", "v3")
    const suffix = process.env.EXTERNAL_ID_SUFFIX;
    const baseId = `${t.transactionDate}-${t.processingTime || "000000"}-${t.batchNr}-${t.batchSequenceNr}-${t.billingAmount}`;
    const externalId = suffix ? `${baseId}-${suffix}` : baseId;

    return {
      date: t.transactionDate,
      payee: t.description || "",
      amount: signedAmount,
      manual_account_id: assetId,
      tag_ids: [tagId],
      notes: notes,
      external_id: externalId,
      status: "unreviewed",
    };
  });
}

/**
 * Send transactions to Lunch Money v2 API in batches
 */
async function sendToLunchMoney(transactions) {
  const sampleExternalId = transactions[0]?.external_id || 'none';
  logInfo("sync_lunchmoney", `Sending ${transactions.length} transactions to Lunch Money v2...`, {
    totalTransactions: transactions.length,
    manualAccountId: assetId,
  });
  logInfo("sync_lunchmoney", `External ID format: ${sampleExternalId}`, {
    externalIdSuffix: process.env.EXTERNAL_ID_SUFFIX || 'not set',
  });

  const batchSize = 500; // v2 API supports up to 500 per request
  const batches = [];

  for (let i = 0; i < transactions.length; i += batchSize) {
    batches.push(transactions.slice(i, i + batchSize));
  }

  logInfo("sync_lunchmoney", `Prepared ${batches.length} batches`, {
    batchesCount: batches.length,
    batchSize,
    totalTransactions: transactions.length,
  });

  const results = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Log before sending - use console.error directly to ensure order
    const sendingMsg = `Sending batch ${i + 1}/${batches.length} (${batch.length} transactions) to Lunch Money...`;
    console.error(formatLog('INFO', 'sync_batch_start', sendingMsg, {
      batchIndex: i + 1,
      totalBatches: batches.length,
      transactionsInBatch: batch.length,
    }));
    console.error(JSON.stringify({ step: 'sync_batch_start', message: sendingMsg }));

    try {
      // Log first transaction for debugging (without sensitive data)
      if (batch.length > 0) {
        const sampleTx = batch[0];
        logDebug("sync_batch_sample", "First transaction in batch", {
          date: sampleTx.date,
          amount: sampleTx.amount,
          payee: sampleTx.payee?.substring(0, 30),
          manual_account_id: sampleTx.manual_account_id,
          external_id: sampleTx.external_id,
          status: sampleTx.status,
          has_tag_ids: Array.isArray(sampleTx.tag_ids) && sampleTx.tag_ids.length > 0,
        });
      }

      // skip_duplicates dedupes by date/payee/amount (separate from external_id)
      // external_id deduplication always happens automatically
      const skipDuplicates = process.env.SKIP_DUPLICATES !== 'false';

      const requestBody = {
        transactions: batch,
        apply_rules: true,
        skip_duplicates: skipDuplicates,
      };

      logDebug("sync_batch_request", "Request payload", {
        batchIndex: i + 1,
        url: LUNCHMONEY_API_URL,
        transactionsCount: batch.length,
        requestBodySize: JSON.stringify(requestBody).length,
      });

      const response = await fetch(LUNCHMONEY_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LUNCHMONEY_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      // Get raw response text first for debugging
      const responseText = await response.text();

      // Log raw response for debugging
      logDebug("sync_batch_response_raw", "Raw API response", {
        batchIndex: i + 1,
        status: response.status,
        statusText: response.statusText,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
      });

      // v2 API returns 201 Created on success
      if (!response.ok && response.status !== 201) {
        const status = response.status;

        // Better error messages based on status code
        let userMessage = `Lunch Money API error (${status})`;
        if (status === 503) {
          userMessage = "Lunch Money service is temporarily unavailable (503). Please try again in a few minutes.";
        } else if (status === 401) {
          userMessage = "Invalid Lunch Money API token. Please check your LUNCHMONEY_TOKEN.";
        } else if (status === 400) {
          userMessage = `Lunch Money bad request (400): ${responseText.substring(0, 200)}`;
        } else if (status === 404) {
          userMessage = "Lunch Money resource not found (404). Check your manual_account_id.";
        } else if (status === 429) {
          userMessage = "Lunch Money rate limit exceeded (429). Please try again later.";
        } else if (status === 500) {
          userMessage = "Lunch Money server error. Please try again later.";
        } else if (status >= 400 && status < 500) {
          userMessage = `Lunch Money client error (${status}). Please check your configuration.`;
        } else if (status >= 500) {
          userMessage = `Lunch Money server error (${status}). The service may be experiencing issues.`;
        }

        logError("sync_batch_error", "Lunch Money API error", null, {
          batchIndex: i + 1,
          totalBatches: batches.length,
          statusCode: status,
          statusText: response.statusText,
          responseBody: responseText.substring(0, 1000),
          userMessage,
        });

        throw new Error(userMessage);
      }

      // Parse JSON response
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        logError("sync_batch_parse_error", "Failed to parse Lunch Money response as JSON", parseError, {
          batchIndex: i + 1,
          responseText: responseText.substring(0, 500),
        });
        throw new Error(`Invalid JSON response from Lunch Money: ${responseText.substring(0, 200)}`);
      }

      // Check for error field in response (API might return 200/201 with error in body)
      if (result.error) {
        const errorMsg = Array.isArray(result.error) ? result.error.join(', ') : String(result.error);
        logError("sync_batch_api_error", "Lunch Money returned error in response body", null, {
          batchIndex: i + 1,
          status: response.status,
          errorField: errorMsg,
          fullResponse: JSON.stringify(result).substring(0, 1000),
        });
        throw new Error(`Lunch Money API error: ${errorMsg}`);
      }

      // v2 API returns { transactions: [...], skipped_duplicates: [...] }
      // v1 API returns { ids: [...] }
      // Handle both formats for compatibility
      let insertedCount = 0;
      let skippedCount = 0;

      if (result.transactions) {
        // v2 format
        insertedCount = result.transactions.length;
        skippedCount = result.skipped_duplicates?.length || 0;
      } else if (result.ids) {
        // v1 format (fallback)
        insertedCount = result.ids.length;
        skippedCount = 0;
      } else {
        // Unknown format - log warning
        logError("sync_batch_unknown_format", "Unexpected response format from Lunch Money", null, {
          batchIndex: i + 1,
          responseKeys: Object.keys(result),
          fullResponse: JSON.stringify(result).substring(0, 1000),
        });
      }

      // Log successful response with details
      const successMsg = `Batch ${i + 1}/${batches.length}: ${insertedCount} inserted, ${skippedCount} skipped (of ${batch.length} sent)`;
      console.error(formatLog('INFO', 'sync_batch_complete', successMsg, {
        batchIndex: i + 1,
        totalBatches: batches.length,
        transactionsInBatch: batch.length,
        insertedCount,
        skippedCount,
        responseStatus: response.status,
      }));
      console.error(JSON.stringify({
        step: 'sync_batch_complete',
        message: successMsg,
        insertedCount,
        skippedCount,
      }));

      // Warn if nothing was inserted
      if (insertedCount === 0 && batch.length > 0) {
        logError("sync_batch_warning", "No transactions were inserted - all may have been skipped as duplicates or rejected", null, {
          batchIndex: i + 1,
          transactionsSent: batch.length,
          skippedCount,
          responseStatus: response.status,
          fullResponse: JSON.stringify(result).substring(0, 1000),
        });
      }

      results.push(result);
    } catch (error) {
      if (error.message.includes("Lunch Money")) {
        throw error; // Re-throw Lunch Money errors
      }
      logError("sync_batch_failed", "Failed to send batch to Lunch Money", error, {
        batchIndex: i + 1,
        totalBatches: batches.length,
        transactionsInBatch: batch.length,
        errorMessage: error.message,
        errorStack: error.stack,
      });
      throw error;
    }
  }

  // Calculate totals from all batches
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const r of results) {
    if (r.transactions) {
      totalInserted += r.transactions.length;
      totalSkipped += r.skipped_duplicates?.length || 0;
    } else if (r.ids) {
      totalInserted += r.ids.length;
    }
  }

  // Log final summary
  const summaryMsg = `Sync complete: ${totalInserted} inserted, ${totalSkipped} skipped (of ${transactions.length} total)`;
  console.error(formatLog('INFO', 'sync_lunchmoney_complete', summaryMsg, {
    totalBatches: batches.length,
    totalTransactions: transactions.length,
    totalInserted,
    totalSkipped,
  }));
  console.error(JSON.stringify({
    step: 'sync_lunchmoney_complete',
    message: summaryMsg,
    totalInserted,
    totalSkipped,
  }));

  // Warn if totals don't add up
  if (totalInserted + totalSkipped !== transactions.length) {
    logError("sync_count_mismatch", "Transaction count mismatch - some transactions may have been silently rejected", null, {
      totalSent: transactions.length,
      totalInserted,
      totalSkipped,
      difference: transactions.length - totalInserted - totalSkipped,
    });
  }

  return results;
}

/**
 * Main sync function
 */
async function sync() {
  const syncStartTime = Date.now();
  logInfo("sync_start", "Starting sync process", {
    syncDays: SYNC_DAYS_PARSED,
    accountNumber: accountNumber || "auto-detect",
    assetId,
  });

  let browser;
  try {
    // Launch browser
    browser = await launchBrowser();
    const page = await browser.newPage();
    logDebug("sync_start", "New page created");

    // Login flow
    await login(page);

    // Wait for 2FA
    await wait2FA(page);

    // Wait for page to be fully loaded after 2FA
    await page.waitForTimeout(1000);

    // Extract cookies and XSRF token
    const { cookies: cookieMap, xsrfToken } = await extractCookies(page);

    // Determine account number - use browser context for API calls
    const {
      accountNumber: finalAccountNumber,
      cookieMap: updatedCookies,
      xsrfToken: updatedToken,
    } = await determineAccountNumber(page, cookieMap, xsrfToken);

    accountNumber = finalAccountNumber;
    logInfo("sync_progress", "Account determined", {
      accountNumber: finalAccountNumber,
      hasCookies: updatedCookies.size > 0,
      hasXsrfToken: !!updatedToken,
    });

    // Fetch transactions
    const { transactions } = await fetchTransactions(
      page,
      accountNumber,
      updatedCookies,
      updatedToken
    );

    const today = new Date();
    const fromDate = new Date();
    fromDate.setDate(today.getDate() - SYNC_DAYS_PARSED);

    if (transactions.length === 0) {

      logInfo("sync_complete", "No transactions found", {
        accountNumber,
        fromDate: formatDate(fromDate),
        untilDate: formatDate(today),
        syncDays: SYNC_DAYS_PARSED,
      });

      const result = {
        success: true,
        message: `No transactions found for period ${formatDate(
          fromDate
        )} to ${formatDate(today)}`,
        transactionsCount: 0,
        syncedCount: 0,
        accountNumber,
      };
      console.log(JSON.stringify(result));
      return result;
    }

    logInfo("sync_progress", "Transactions fetched, transforming for Lunch Money", {
      transactionsCount: transactions.length,
      accountNumber,
    });

    // Create import tag
    const importTag = `importedAt:${new Date().toISOString()}`;
    const tagId = await createTag(importTag);

    // Transform transactions
    const lmTransactions = transformTransactions(transactions, tagId);

    logInfo("sync_progress", "Transactions transformed", {
      originalCount: transactions.length,
      transformedCount: lmTransactions.length,
    });

    // Send to Lunch Money
    const syncResults = await sendToLunchMoney(lmTransactions);

    // Calculate totals from results
    let totalInserted = 0;
    let totalSkipped = 0;
    for (const r of syncResults) {
      if (r.transactions) {
        totalInserted += r.transactions.length;
        totalSkipped += r.skipped_duplicates?.length || 0;
      } else if (r.ids) {
        totalInserted += r.ids.length;
      }
    }

    const syncDuration = Date.now() - syncStartTime;
    const result = {
      success: true,
      message: `Synced: ${totalInserted} inserted, ${totalSkipped} skipped (of ${lmTransactions.length} total)`,
      transactionsCount: transactions.length,
      syncedCount: lmTransactions.length,
      insertedCount: totalInserted,
      skippedCount: totalSkipped,
      fromDate: formatDate(fromDate),
      untilDate: formatDate(today),
      accountNumber,
      assetId,
    };

    // Warn if nothing was inserted
    if (totalInserted === 0 && lmTransactions.length > 0) {
      result.warning = "No transactions were inserted - all were likely skipped as duplicates";
      logError("sync_no_inserts", "Sync completed but no transactions were inserted", null, {
        totalSent: lmTransactions.length,
        totalSkipped,
        message: result.warning,
      });
    }

    logInfo("sync_complete", "Sync completed successfully", {
      ...result,
      durationMs: syncDuration,
      durationSeconds: Math.round(syncDuration / 1000),
    });

    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    const syncDuration = Date.now() - syncStartTime;
    const result = {
      success: false,
      error: error.message,
      step: error.step || "unknown",
      stack: error.stack, // Include stack trace for debugging
    };

    logError("sync_error", "Sync failed", error, {
      step: error.step || "unknown",
      durationMs: syncDuration,
      accountNumber: accountNumber || "unknown",
    });

    // Ensure error is logged to stderr for Docker logs
    console.error(JSON.stringify(result));

    process.exit(1);
  } finally {
    if (browser) {
      logDebug("sync_cleanup", "Closing browser");
      try {
        await browser.close();
        logDebug("sync_cleanup", "Browser closed successfully");
      } catch (error) {
        logError("sync_cleanup", "Failed to close browser", error);
      }
    }
  }
}

// Add global error handlers for uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error(JSON.stringify({
    success: false,
    error: 'Unhandled promise rejection',
    details: String(reason),
    step: 'unhandled_error',
  }));
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    success: false,
    error: 'Uncaught exception',
    details: error.message,
    stack: error.stack,
    step: 'unhandled_error',
  }));
  process.exit(1);
});

// Run sync
sync();
