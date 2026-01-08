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
const LUNCHMONEY_API_URL = "https://dev.lunchmoney.app/v1/transactions";

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
  console.error(
    JSON.stringify({ step: "browser_launch", message: "Launching browser..." })
  );

  const browser = await puppeteer.launch({
    executablePath: PUPPETEER_EXECUTABLE_PATH,
    headless: PUPPETEER_HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  return browser;
}

/**
 * Login flow: navigate to login page, fill form, submit
 */
async function login(page) {
  console.error(
    JSON.stringify({ step: "page_load", message: "Loading login page..." })
  );

  const loginUrl = `${ICS_BASE_URL}/web/consumer/abnamro/sca-login?URL=abnamro%2Fdashboard`;

  await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 30000 });

  // Handle cookie consent banner
  try {
    const cookieButtonSelectors = [
      '[data-cookiefirst-action="accept"]',
      'button[id*="accept"]',
      "#truste-consent-button",
    ];

    for (const selector of cookieButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await page.waitForTimeout(500);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
  } catch (e) {
    // Cookie banner not found or already accepted - continue
  }

  console.error(
    JSON.stringify({ step: "fill_form", message: "Filling credentials..." })
  );

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

    if (!result.usernameFound || !result.passwordFound) {
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
  } catch (error) {
    throw error;
  }

  console.error(
    JSON.stringify({ step: "submit_form", message: "Submitting login form..." })
  );

  // Click submit button
  await submitButton.click();
  await page.waitForTimeout(1000);

  // Try to wait for navigation, but don't fail if it doesn't happen immediately
  try {
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 });
  } catch (navError) {
    // Navigation might not happen immediately - that's OK, we'll check in wait2FA
  }
}

/**
 * Wait for 2FA confirmation
 */
async function wait2FA(page) {
  console.error(
    JSON.stringify({
      step: "2fa_wait",
      message: "Waiting for 2FA confirmation (check your phone)...",
    })
  );

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
    console.error(
      JSON.stringify({
        step: "2fa_verified",
        message: `2FA confirmed! Navigated to: ${finalUrl}`,
      })
    );

    // Wait a bit for page to settle and set cookies
    await page.waitForTimeout(1000);
  } catch (error) {
    const currentUrl = page.url();
    console.error(
      JSON.stringify({
        step: "2fa_timeout",
        message: `Timeout waiting for 2FA. Current URL: ${currentUrl}`,
      })
    );
    throw new Error(
      "2FA verification timeout - please confirm on your phone and try again"
    );
  }
}

/**
 * Extract cookies and XSRF token from page
 */
function extractCookies(page) {
  return page.cookies().then((cookies) => {
    const cookieMap = new Map();
    let xsrfToken = null;

    for (const cookie of cookies) {
      cookieMap.set(cookie.name, cookie.value);
      if (cookie.name === "XSRF-TOKEN") {
        xsrfToken = decodeURIComponent(cookie.value);
      }
    }

    return { cookies: cookieMap, xsrfToken };
  });
}

/**
 * Determine account number (auto-detect or use env var)
 */
async function determineAccountNumber(page, cookieMap, xsrfToken) {
  console.error(
    JSON.stringify({
      step: "determine_account",
      message: "Determining account...",
    })
  );

  // Use browser context to make API call (cookies are automatically included)
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

  // Update cookies from page (in case new ones were set)
  const { cookies: updatedCookieMap, xsrfToken: updatedToken } =
    await extractCookies(page);
  const accounts = Array.isArray(accountsData) ? accountsData : [accountsData];

  if (accounts.length === 0) {
    throw new Error("No accounts found");
  }

  // If account number is already set, validate it exists
  if (accountNumber) {
    const foundAccount = accounts.find(
      (acc) => acc.accountNumber === accountNumber
    );
    if (!foundAccount) {
      throw new Error(
        `Account ${accountNumber} not found in available accounts`
      );
    }
    console.error(
      JSON.stringify({
        step: "account_selected",
        message: `Using account: ${accountNumber}`,
      })
    );
    return {
      accountNumber,
      cookieMap: updatedCookieMap,
      xsrfToken: updatedToken,
    };
  }

  // If only one account, use it automatically
  if (accounts.length === 1) {
    accountNumber = accounts[0].accountNumber;
    console.error(
      JSON.stringify({
        step: "account_auto_detected",
        message: `Auto-detected single account: ${accountNumber}`,
      })
    );
    return {
      accountNumber,
      cookieMap: updatedCookieMap,
      xsrfToken: updatedToken,
    };
  }

  // Multiple accounts found - fetch latest transaction for each to help user decide
  console.error(
    JSON.stringify({
      step: "fetch_account_details",
      message: `Found ${accounts.length} accounts, fetching details...`,
    })
  );

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
      console.error(
        JSON.stringify({
          step: "error",
          message: `Failed to fetch details for account ${account.accountNumber}: ${err.message}`,
        })
      );
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

  throw new Error(errorMessage);
}

/**
 * Fetch transactions in chunks
 */
async function fetchTransactions(page, accountNumber, cookieMap, xsrfToken) {
  console.error(
    JSON.stringify({
      step: "fetch_transactions",
      message: "Fetching transactions...",
    })
  );

  const chunks = getDateChunks(SYNC_DAYS_PARSED);
  const allTransactions = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.error(
      JSON.stringify({
        step: "fetch_chunk",
        message: `Fetching transactions from ${chunk.from} to ${
          chunk.to
        } (chunk ${i + 1}/${chunks.length})...`,
      })
    );

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
      throw new Error(
        `Invalid transactions response: ${JSON.stringify(transactions)}`
      );
    }

    allTransactions.push(...transactions);

    console.error(
      JSON.stringify({
        step: "chunk_complete",
        message: `Fetched ${transactions.length} transactions from ${chunk.from} to ${chunk.to}`,
      })
    );
  }

  return { transactions: allTransactions };
}

/**
 * Transform transactions for Lunch Money
 */
function transformTransactions(transactions, untilDate) {
  const importTag = `importedAt:${untilDate}`;

  return transactions.map((t) => {
    const tags = [];

    if (t.merchantCategoryCodeDescription) {
      tags.push(`ics:category:${t.merchantCategoryCodeDescription}`);
    }

    if (t.typeOfPurchase) {
      tags.push(`ics:type:${t.typeOfPurchase}`);
    }

    tags.push(importTag);

    // Determine amount sign: negative for debits, positive for credits
    const amount = parseFloat(t.billingAmount);
    const signedAmount =
      t.debitCredit === "DEBIT" ? -Math.abs(amount) : Math.abs(amount);

    return {
      date: t.transactionDate,
      payee: t.description || "",
      amount: signedAmount,
      asset_id: assetId,
      category_name: t.merchantCategoryCodeDescription || undefined,
      tags: tags,
      notes: "",
      external_id: `${t.batchNr}-${t.batchSequenceNr}`,
    };
  });
}

/**
 * Send transactions to Lunch Money in batches
 */
async function sendToLunchMoney(transactions) {
  console.error(
    JSON.stringify({
      step: "sync_lunchmoney",
      message: `Sending ${transactions.length} transactions to Lunch Money...`,
    })
  );

  const batchSize = 100;
  const batches = [];

  for (let i = 0; i < transactions.length; i += batchSize) {
    batches.push(transactions.slice(i, i + batchSize));
  }

  const results = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.error(
      JSON.stringify({
        step: "sync_batch",
        message: `Sending batch ${i + 1}/${batches.length} (${
          batch.length
        } transactions)...`,
      })
    );

    const response = await fetch(LUNCHMONEY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LUNCHMONEY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactions: batch,
        apply_rules: true,
        check_for_recurring: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;

      // Better error messages based on status code
      let userMessage = `Lunch Money API error (${status})`;
      if (status === 503) {
        userMessage = "Lunch Money service is temporarily unavailable (503). Please try again in a few minutes.";
      } else if (status === 401) {
        userMessage = "Invalid Lunch Money API token. Please check your LUNCHMONEY_TOKEN.";
      } else if (status === 500) {
        userMessage = "Lunch Money server error. Please try again later.";
      } else if (status >= 400 && status < 500) {
        userMessage = `Lunch Money client error (${status}). Please check your configuration.`;
      } else if (status >= 500) {
        userMessage = `Lunch Money server error (${status}). The service may be experiencing issues.`;
      }

      // Log detailed error for debugging
      console.error(JSON.stringify({
        success: false,
        error: userMessage,
        details: `Status ${status}: ${errorText.substring(0, 200)}`,
        step: "sync_lunchmoney",
        statusCode: status,
      }));

      throw new Error(userMessage);
    }

    const result = await response.json();
    results.push(result);
  }

  return results;
}

/**
 * Main sync function
 */
async function sync() {
  let browser;
  try {
    // Launch browser
    browser = await launchBrowser();
    const page = await browser.newPage();

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

    // Fetch transactions
    const { transactions } = await fetchTransactions(
      page,
      accountNumber,
      updatedCookies,
      updatedToken
    );

    if (transactions.length === 0) {
      const today = new Date();
      const fromDate = new Date();
      fromDate.setDate(today.getDate() - SYNC_DAYS_PARSED);

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

    // Transform transactions
    const today = new Date();
    const lmTransactions = transformTransactions(
      transactions,
      formatDate(today)
    );

    // Send to Lunch Money
    await sendToLunchMoney(lmTransactions);

    const result = {
      success: true,
      message: `Successfully synced ${lmTransactions.length} transactions`,
      transactionsCount: transactions.length,
      syncedCount: lmTransactions.length,
      fromDate: formatDate(
        new Date(Date.now() - SYNC_DAYS_PARSED * 24 * 60 * 60 * 1000)
      ),
      untilDate: formatDate(today),
      accountNumber,
      assetId,
    };

    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    const result = {
      success: false,
      error: error.message,
      step: error.step || "unknown",
      stack: error.stack, // Include stack trace for debugging
    };

    // Ensure error is logged to stderr for Docker logs
    console.error(JSON.stringify(result));

    // Also log plain text for easier reading
    console.error(`\n❌ ERROR: ${error.message}`);
    console.error(`Step: ${error.step || 'unknown'}`);

    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
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
