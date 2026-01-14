// @name ICS => LunchMoney
// @description Sync ICS Bank transactions to Lunch Money - fetches last 50 days of transactions with progress tracking
// @image https://lunchmoney.app/favicon.ico
// @video https://github.com/H1D/ics_lunchmoney_sync/raw/main/bookmarklet/usage.mp4

(async () => {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 50); // Latest 50 days

  // Load Tailwind CSS if not already loaded and wait for it
  if (!document.getElementById("tw-cdn")) {
    await new Promise((resolve) => {
      const tw = Object.assign(document.createElement("script"), {
        id: "tw-cdn",
        src: "https://cdn.tailwindcss.com",
        onload: resolve,
      });
      document.head.append(tw);
    });
  }

  // Modal UI using native dialog element
  const showModal = (title, message, placeholder, isPassword = false) =>
    new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className =
        "backdrop:bg-black/50 bg-white rounded-xl p-6 max-w-md w-[90%] shadow-2xl";

      const titleEl = Object.assign(document.createElement("h2"), {
        textContent: title,
        className: "mb-4 text-xl font-semibold text-gray-900",
      });

      const messageEl = Object.assign(document.createElement("div"), {
        innerHTML: message,
        className: "mb-5 text-sm leading-relaxed text-gray-600",
      });

      const input = Object.assign(document.createElement("input"), {
        type: isPassword ? "password" : "text",
        placeholder,
        className:
          "w-full px-3 py-3 border-2 border-gray-200 rounded-lg text-sm mb-4 font-mono focus:outline-none focus:border-green-500",
      });

      const submitBtn = Object.assign(document.createElement("button"), {
        textContent: "Save",
        className:
          "bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition",
        onclick: () => {
          const value = input.value.trim();
          if (value) {
            dialog.close();
            dialog.remove();
            resolve(value);
          }
        },
      });

      input.addEventListener(
        "keypress",
        (e) => e.key === "Enter" && submitBtn.click()
      );

      // ESC key closes without saving
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
      });

      const buttonContainer = Object.assign(document.createElement("div"), {
        className: "flex gap-3 justify-end",
      });
      buttonContainer.append(submitBtn);

      dialog.append(titleEl, messageEl, input, buttonContainer);
      document.body.append(dialog);
      dialog.showModal();

      queueMicrotask(() => input.focus());
    });

  // Error dialog for user-friendly error messages
  const showErrorDialog = (title, message) => {
    const dialog = document.createElement("dialog");
    dialog.className =
      "backdrop:bg-black/50 bg-white rounded-xl p-6 max-w-md w-[90%] shadow-2xl";

    const titleEl = Object.assign(document.createElement("h2"), {
      textContent: title,
      className: "mb-4 text-xl font-semibold text-red-600",
    });

    const messageEl = Object.assign(document.createElement("div"), {
      innerHTML: message,
      className: "mb-5 text-sm leading-relaxed text-gray-600",
    });

    const closeBtn = Object.assign(document.createElement("button"), {
      textContent: "Close",
      className:
        "bg-gray-500 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition",
      onclick: () => {
        dialog.close();
        dialog.remove();
      },
    });

    const buttonContainer = Object.assign(document.createElement("div"), {
      className: "flex gap-3 justify-end",
    });
    buttonContainer.append(closeBtn);

    dialog.append(titleEl, messageEl, buttonContainer);
    document.body.append(dialog);
    dialog.showModal();

    // ESC key closes
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      dialog.close();
      dialog.remove();
    });
  };

  // Get or request credentials with modern async pattern
  const getOrPrompt = async (
    key,
    title,
    message,
    placeholder,
    isPassword = false
  ) => {
    const value = localStorage.getItem(key);
    if (value) return value;
    const newValue = await showModal(title, message, placeholder, isPassword);
    localStorage.setItem(key, newValue);
    return newValue;
  };

  const ASSET_ID = await getOrPrompt(
    "LUNCHMONEY_ASSET_ID",
    "🏦 Lunch Money Asset ID",
    `Where to find your Asset ID:<br><br>1. Open <a href="https://my.lunchmoney.app/" target="_blank" class="text-green-600 hover:underline">Lunch Money</a><br>2. Click on your ICS/ABN AMRO account<br>3. The Asset ID is in the URL:<br><code class="bg-gray-100 px-2 py-1 rounded block mt-2">https://my.lunchmoney.app/transactions/...?<strong>asset=12345</strong></code><br>Use the number after <code class="bg-gray-100 px-1">asset=</code>`,
    "Example: 12345"
  );

  const LUNCH_MONEY_TOKEN = await getOrPrompt(
    "LUNCHMONEY_TOKEN",
    "🔑 Lunch Money API Token",
    `Where to get your token:<br><br>1. Open <a href="https://my.lunchmoney.app/developers" target="_blank" class="text-green-600 hover:underline">https://my.lunchmoney.app/developers</a><br>2. Click the <strong>"Request new access token"</strong> button<br>3. Copy the generated token`,
    "Paste your API token",
    true
  );

  // Modern date formatting using Intl API
  const formatDate = (d) => new Intl.DateTimeFormat("sv-SE").format(d); // ISO format YYYY-MM-DD

  // Progress dialog overlay
  const createProgressDialog = () => {
    const dialog = document.createElement("dialog");
    dialog.className =
      "backdrop:bg-black/80 bg-white rounded-xl p-8 max-w-lg w-[90%] shadow-2xl";

    const title = Object.assign(document.createElement("h2"), {
      textContent: "🔄 Syncing Transactions",
      className: "mb-4 text-2xl font-semibold text-gray-900",
    });

    const status = Object.assign(document.createElement("div"), {
      textContent: "Initializing...",
      className: "mb-4 text-sm text-gray-600",
    });

    const progress = Object.assign(document.createElement("div"), {
      className: "mb-4",
    });

    const progressBar = Object.assign(document.createElement("div"), {
      className: "w-full bg-gray-200 rounded-full h-2",
    });

    const progressFill = Object.assign(document.createElement("div"), {
      className: "bg-green-500 h-2 rounded-full transition-all duration-300",
      style: "width: 0%",
    });

    progressBar.append(progressFill);
    progress.append(progressBar);

    const stats = Object.assign(document.createElement("div"), {
      className: "text-sm text-gray-500 space-y-1 mb-2",
    });

    const batchInfo = Object.assign(document.createElement("div"), {
      className: "text-xs text-gray-400 italic",
    });

    dialog.append(title, status, progress, stats, batchInfo);
    document.body.append(dialog);
    dialog.showModal();

    return {
      dialog,
      updateStatus: (text) => {
        status.textContent = text;
      },
      updateProgress: (percent) => {
        progressFill.style.width = `${percent}%`;
      },
      updateStats: (fetched, sent) => {
        stats.innerHTML = `
          <div>📥 Fetched FROM ICS: <strong>${fetched}</strong> transactions</div>
          <div>📤 Sent TO Lunch Money: <strong>${sent}</strong> transactions</div>
        `;
      },
      updateBatch: (currentBatch, totalBatches, dateRange) => {
        batchInfo.textContent = `Batch ${currentBatch} of ${totalBatches} • ${dateRange}`;
      },
      close: () => {
        dialog.close();
        dialog.remove();
      },
    };
  };

  // Modern popup notification
  const showPopup = (msg) => {
    const popup = Object.assign(document.createElement("div"), {
      textContent: msg,
      className:
        "fixed bottom-5 right-5 px-5 py-3 bg-gray-800 text-white rounded-lg z-[9999]",
    });
    document.body.append(popup);
    setTimeout(() => popup.remove(), 10000);
  };

  // Get XSRF token using optional chaining
  const xsrfToken = decodeURIComponent(
    document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ""
  );

  // Fetch all accounts and auto-detect
  let accounts;
  try {
    const accountsResp = await fetch(
      "/api/nl/sec/frontendservices/allaccountsv2",
      {
        headers: {
          "X-XSRF-TOKEN": xsrfToken,
          Accept: "application/json",
        },
      }
    );

    if (!accountsResp.ok) {
      if (accountsResp.status === 403) {
        showErrorDialog(
          "❌ Authentication Failed",
          "Please make sure you're logged into ICS Cards and viewing your account page, then try again.<br><br>If you're not logged in, please log in first and navigate to your transactions page."
        );
        return; // Exit early, don't continue
      }
      throw new Error(`Failed to fetch accounts: ${accountsResp.status}`);
    }

    const accountsData = await accountsResp.json();
    accounts = Array.isArray(accountsData) ? accountsData : [accountsData];

    if (accounts.length === 0) {
      showErrorDialog(
        "❌ No Accounts Found",
        "No accounts were found. Please make sure you're logged in and have access to at least one account."
      );
      return; // Exit early
    }
  } catch (err) {
    // Handle network errors or other fetch failures
    if (err.name === "TypeError" && err.message.includes("fetch")) {
      showErrorDialog(
        "❌ Network Error",
        "Failed to connect to ICS Cards. Please check your internet connection and try again."
      );
    } else {
      showErrorDialog(
        "❌ Error",
        `An error occurred: ${err.message}<br><br>Please make sure you're logged into ICS Cards and try again.`
      );
    }
    return; // Exit early
  }

  // Use first account (or only account)
  const ACCOUNT_NUMBER = accounts[0].accountNumber;
  console.log(`Using account: ${ACCOUNT_NUMBER}`);

  // Show progress dialog
  const progress = createProgressDialog();
  progress.updateStatus(`Using account: ${ACCOUNT_NUMBER}`);
  progress.updateProgress(0);

  let until = new Date(today);
  let totalFetched = 0;
  let totalSent = 0;
  const totalDays = Math.ceil((today - cutoff) / (1000 * 60 * 60 * 24));
  let processedDays = 0;
  let batchNumber = 0;
  const batches = [];

  // Calculate total batches first
  let tempUntil = new Date(today);
  while (tempUntil > cutoff) {
    const tempFrom = new Date(tempUntil);
    tempFrom.setDate(tempFrom.getDate() - 30);
    if (tempFrom < cutoff) tempFrom.setTime(cutoff.getTime());
    batches.push({ from: new Date(tempFrom), until: new Date(tempUntil) });
    tempUntil = new Date(tempFrom);
    tempUntil.setDate(tempUntil.getDate() - 1);
  }
  const totalBatches = batches.length;

  try {
    while (until > cutoff) {
      batchNumber++;
      const from = new Date(until);
      from.setDate(from.getDate() - 30);
      if (from < cutoff) from.setTime(cutoff.getTime());

      const daysInInterval = Math.ceil((until - from) / (1000 * 60 * 60 * 24));
      processedDays += daysInInterval;
      const progressPercent = Math.min((processedDays / totalDays) * 100, 95);
      progress.updateProgress(progressPercent);
      progress.updateStatus(
        `Fetching transactions from ${formatDate(from)} to ${formatDate(
          until
        )}...`
      );
      progress.updateBatch(
        batchNumber,
        totalBatches,
        `${formatDate(from)} → ${formatDate(until)}`
      );

      // Build bank API URL with URLSearchParams
      const params = new URLSearchParams({
        accountNumber: ACCOUNT_NUMBER,
        debitCredit: "DEBIT_AND_CREDIT",
        fromDate: formatDate(from),
        untilDate: formatDate(until),
      });
      const bankUrl = `/api/nl/sec/frontendservices/transactionsv3/search?${params}`;

      // Fetch transactions from bank
      const bankResp = await fetch(bankUrl, {
        headers: {
          "X-XSRF-TOKEN": xsrfToken,
          Accept: "application/json",
        },
      });

      if (!bankResp.ok) {
        throw new Error(
          `Bank API error: ${bankResp.status} ${bankResp.statusText}`
        );
      }

      const bankData = await bankResp.json();
      if (!Array.isArray(bankData)) {
        console.error("Bank API error:", bankData);
        break;
      }

      // Number of transactions fetched in this interval
      totalFetched += bankData.length;
      progress.updateStats(totalFetched, totalSent);

      // Prepare import tag
      const importTag = `importedAt:${formatDate(today)}`;

      // Transform transactions for Lunch Money with modern syntax
      const lmTransactions = bankData.map(
        ({
          transactionDate,
          description = "",
          billingAmount,
          billingCurrency,
          sourceAmount,
          sourceCurrency,
          merchantCategoryCodeDescription,
          typeOfPurchase,
          countryCode,
          lastFourDigits,
          processingTime,
          batchNr,
          batchSequenceNr,
        }) => ({
          date: transactionDate,
          payee: description,
          amount: -Number(billingAmount),
          asset_id: ASSET_ID,
          category_name: merchantCategoryCodeDescription,
          tags: [
            merchantCategoryCodeDescription &&
              `ics:category:${merchantCategoryCodeDescription}`,
            typeOfPurchase && `ics:type:${typeOfPurchase}`,
            countryCode && `ics:country:${countryCode}`,
            lastFourDigits && `ics:card:${lastFourDigits}`,
            importTag,
          ].filter(Boolean),
          notes: sourceCurrency && sourceCurrency !== billingCurrency
            ? `Original: ${sourceAmount} ${sourceCurrency}`
            : "",
          external_id: `${transactionDate}-${processingTime || "000000"}-${batchNr}-${batchSequenceNr}-${billingAmount}`,
        })
      );

      // Send to Lunch Money
      if (lmTransactions.length > 0) {
        progress.updateStatus(
          `Sending ${lmTransactions.length} transactions to Lunch Money...`
        );
        progress.updateBatch(
          batchNumber,
          totalBatches,
          `Sending batch ${batchNumber}/${totalBatches}...`
        );

        const lmResp = await fetch(
          "https://dev.lunchmoney.app/v1/transactions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LUNCH_MONEY_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transactions: lmTransactions,
              apply_rules: true,
              check_for_recurring: true,
              skip_duplicates: true,
            }),
          }
        );

        if (!lmResp.ok) {
          throw new Error(
            `Lunch Money API error: ${lmResp.status} ${lmResp.statusText}`
          );
        }

        const lmResult = await lmResp.json();
        totalSent += lmTransactions.length;
        progress.updateStats(totalFetched, totalSent);
        progress.updateBatch(
          batchNumber,
          totalBatches,
          `Batch ${batchNumber}/${totalBatches} complete • ${formatDate(
            from
          )} → ${formatDate(until)}`
        );
        console.log(
          `Interval ${formatDate(from)} – ${formatDate(until)}:`,
          lmResult
        );
      }

      // Move until to one day before the start of current interval
      until = new Date(from);
      until.setDate(until.getDate() - 1);
    }

    // Complete!
    progress.updateProgress(100);
    progress.updateStatus("✅ Sync complete!");
    progress.updateStats(totalFetched, totalSent);

    setTimeout(() => {
      progress.close();
      showPopup(
        `Sync complete. Fetched ${totalFetched} transactions, sent ${totalSent}.`
      );
    }, 1500);
  } catch (err) {
    console.error("Error syncing historical data:", err);
    // Close progress dialog if it exists
    if (typeof progress !== "undefined" && progress) {
      progress.close();
    }
    // Show user-friendly error dialog
    showErrorDialog(
      "❌ Sync Failed",
      `An error occurred while syncing transactions: ${err.message}<br><br>Please try again or check the browser console for more details.`
    );
  }
})();
