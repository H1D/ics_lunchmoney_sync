// @name ICS => LunchMoney
// @description Sync ICS Bank transactions to Lunch Money - fetches transactions with progress tracking
// @image https://lunchmoney.app/favicon.ico

(async () => {
  // Load Tailwind CSS if not already loaded
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

  // --- UI Helpers ---

  const showError = (title, message) => {
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
    const btnRow = Object.assign(document.createElement("div"), {
      className: "flex gap-3 justify-end",
    });
    btnRow.append(closeBtn);
    dialog.append(titleEl, messageEl, btnRow);
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      dialog.close();
      dialog.remove();
    });
  };

  const showPopup = (msg) => {
    const el = Object.assign(document.createElement("div"), {
      textContent: msg,
      className:
        "fixed bottom-5 right-5 px-5 py-3 bg-gray-800 text-white rounded-lg z-[9999]",
    });
    document.body.append(el);
    setTimeout(() => el.remove(), 10000);
  };

  const formatDate = (d) => new Intl.DateTimeFormat("sv-SE").format(d);

  // --- Setup Dialog ---

  const showSetupDialog = () =>
    new Promise((resolve) => {
      const saved = {
        token: localStorage.getItem("LUNCHMONEY_TOKEN") || "",
        assetId: localStorage.getItem("LUNCHMONEY_ASSET_ID") || "",
        days: localStorage.getItem("ICS_SYNC_DAYS") || "50",
      };

      const dialog = document.createElement("dialog");
      dialog.className =
        "backdrop:bg-black/50 bg-white rounded-xl p-6 max-w-lg w-[90%] shadow-2xl";

      const title = Object.assign(document.createElement("h2"), {
        textContent: "ICS → Lunch Money Sync",
        className: "mb-5 text-xl font-semibold text-gray-900",
      });

      // --- Token field ---
      const tokenLabel = Object.assign(document.createElement("label"), {
        textContent: "Lunch Money API Token",
        className: "block text-xs font-medium text-gray-500 mb-1",
      });
      const tokenHelp = Object.assign(document.createElement("a"), {
        href: "https://my.lunchmoney.app/developers",
        target: "_blank",
        textContent: "Get token →",
        className: "text-xs text-green-600 hover:underline ml-2",
      });
      tokenLabel.append(tokenHelp);

      const tokenInput = Object.assign(document.createElement("input"), {
        type: "password",
        value: saved.token,
        placeholder: "Paste your API token",
        className:
          "w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-mono mb-1 focus:outline-none focus:border-green-500",
      });

      const tokenStatus = Object.assign(document.createElement("div"), {
        className: "text-xs mb-4 h-5",
      });

      // --- Lunch Money account dropdown ---
      const lmLabel = Object.assign(document.createElement("label"), {
        textContent: "Lunch Money Account",
        className: "block text-xs font-medium text-gray-500 mb-1",
      });

      const lmSelect = Object.assign(document.createElement("select"), {
        className:
          "w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm mb-4 focus:outline-none focus:border-green-500 bg-white",
        disabled: true,
      });
      lmSelect.innerHTML = `<option value="">Enter token first...</option>`;

      // --- ICS account dropdown ---
      const icsLabel = Object.assign(document.createElement("label"), {
        textContent: "ICS Bank Account",
        className: "block text-xs font-medium text-gray-500 mb-1",
      });

      const icsSelect = Object.assign(document.createElement("select"), {
        className:
          "w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm mb-4 focus:outline-none focus:border-green-500 bg-white",
        disabled: true,
      });
      icsSelect.innerHTML = `<option value="">Loading ICS accounts...</option>`;

      // --- Days field ---
      const daysLabel = Object.assign(document.createElement("label"), {
        textContent: "Days to sync",
        className: "block text-xs font-medium text-gray-500 mb-1",
      });

      const daysInput = Object.assign(document.createElement("input"), {
        type: "number",
        value: saved.days,
        min: "1",
        className:
          "w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm mb-5 focus:outline-none focus:border-green-500",
      });

      // --- Sync button ---
      const syncBtn = Object.assign(document.createElement("button"), {
        textContent: "Sync",
        disabled: true,
        className:
          "w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-5 py-3 rounded-lg text-sm font-medium transition",
      });

      dialog.addEventListener("cancel", (e) => e.preventDefault());

      dialog.append(
        title,
        tokenLabel,
        tokenInput,
        tokenStatus,
        lmLabel,
        lmSelect,
        icsLabel,
        icsSelect,
        daysLabel,
        daysInput,
        syncBtn
      );
      document.body.append(dialog);
      dialog.showModal();
      queueMicrotask(() => (saved.token ? daysInput.focus() : tokenInput.focus()));

      // --- State ---
      let lmAccounts = [];
      let icsAccounts = [];
      let lmLoaded = false;
      let icsLoaded = false;

      const updateSyncBtn = () => {
        syncBtn.disabled = !(
          lmLoaded &&
          icsLoaded &&
          lmSelect.value &&
          icsSelect.value &&
          parseInt(daysInput.value, 10) > 0
        );
      };

      lmSelect.addEventListener("change", updateSyncBtn);
      icsSelect.addEventListener("change", updateSyncBtn);
      daysInput.addEventListener("input", updateSyncBtn);

      // --- Load ICS accounts ---
      const xsrfToken = decodeURIComponent(
        document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ""
      );

      (async () => {
        try {
          const resp = await fetch(
            "/api/nl/sec/frontendservices/allaccountsv2",
            {
              headers: {
                "X-XSRF-TOKEN": xsrfToken,
                Accept: "application/json",
              },
            }
          );
          if (!resp.ok) {
            if (resp.status === 403) {
              icsSelect.innerHTML = `<option value="">Not logged in – log into ICS first</option>`;
              return;
            }
            throw new Error(`${resp.status}`);
          }
          const data = await resp.json();
          icsAccounts = Array.isArray(data) ? data : [data];
          if (icsAccounts.length === 0) {
            icsSelect.innerHTML = `<option value="">No accounts found</option>`;
            return;
          }
          icsSelect.disabled = false;
          icsSelect.innerHTML =
            (icsAccounts.length > 1
              ? `<option value="">Select account...</option>`
              : "") +
            icsAccounts
              .map(
                (a) =>
                  `<option value="${a.accountNumber}">${a.accountNumber}${a.productDescription ? " – " + a.productDescription : ""}</option>`
              )
              .join("");
          icsLoaded = true;
          updateSyncBtn();
        } catch (err) {
          icsSelect.innerHTML = `<option value="">Error: ${err.message}</option>`;
        }
      })();

      // --- Load LM accounts on token change ---
      let fetchTimeout;
      const loadLmAccounts = async (token) => {
        if (!token || token.length < 10) {
          lmSelect.disabled = true;
          lmSelect.innerHTML = `<option value="">Enter token first...</option>`;
          lmLoaded = false;
          tokenStatus.textContent = "";
          updateSyncBtn();
          return;
        }

        tokenStatus.textContent = "Loading accounts...";
        tokenStatus.className = "text-xs mb-4 h-5 text-gray-500";
        lmSelect.disabled = true;
        lmSelect.innerHTML = `<option value="">Loading...</option>`;
        lmLoaded = false;
        updateSyncBtn();

        try {
          const resp = await fetch(
            "https://dev.lunchmoney.app/v1/assets",
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );
          if (!resp.ok) {
            tokenStatus.textContent = resp.status === 401 ? "Invalid token" : `Error: ${resp.status}`;
            tokenStatus.className = "text-xs mb-4 h-5 text-red-500";
            lmSelect.innerHTML = `<option value="">Fix token above</option>`;
            return;
          }
          const data = await resp.json();
          lmAccounts = data.assets || [];

          if (lmAccounts.length === 0) {
            tokenStatus.textContent = "No manual accounts found";
            tokenStatus.className = "text-xs mb-4 h-5 text-orange-500";
            lmSelect.innerHTML = `<option value="">No accounts</option>`;
            return;
          }

          tokenStatus.innerHTML = `✓ ${lmAccounts.length} account${lmAccounts.length > 1 ? "s" : ""} loaded`;
          tokenStatus.className = "text-xs mb-4 h-5 text-green-600";
          lmSelect.disabled = false;

          const fmtBal = (a) => {
            try {
              return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: a.currency,
              }).format(parseFloat(a.balance));
            } catch {
              return `${a.balance} ${a.currency}`;
            }
          };

          lmSelect.innerHTML =
            (lmAccounts.length > 1
              ? `<option value="">Select account...</option>`
              : "") +
            lmAccounts
              .map(
                (a) =>
                  `<option value="${a.id}" ${String(a.id) === saved.assetId ? "selected" : ""}>${a.name} (${fmtBal(a)})</option>`
              )
              .join("");

          lmLoaded = true;
          localStorage.setItem("LUNCHMONEY_TOKEN", token);
          updateSyncBtn();
        } catch (err) {
          tokenStatus.textContent = `Network error`;
          tokenStatus.className = "text-xs mb-4 h-5 text-red-500";
          lmSelect.innerHTML = `<option value="">Error loading accounts</option>`;
        }
      };

      tokenInput.addEventListener("input", () => {
        clearTimeout(fetchTimeout);
        fetchTimeout = setTimeout(
          () => loadLmAccounts(tokenInput.value.trim()),
          500
        );
      });

      // Load immediately if saved token exists
      if (saved.token) loadLmAccounts(saved.token);

      // --- Submit ---
      syncBtn.onclick = () => {
        const token = tokenInput.value.trim();
        const assetId = lmSelect.value;
        const icsAccount = icsSelect.value;
        const days = parseInt(daysInput.value, 10);

        if (!token || !assetId || !icsAccount || days < 1) return;

        localStorage.setItem("LUNCHMONEY_TOKEN", token);
        localStorage.setItem("LUNCHMONEY_ASSET_ID", assetId);
        localStorage.setItem("ICS_SYNC_DAYS", String(days));

        dialog.close();
        dialog.remove();
        resolve({ token, assetId, icsAccount, days, xsrfToken });
      };

      daysInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !syncBtn.disabled) syncBtn.click();
      });
    });

  // --- Get settings from setup dialog ---
  const { token, assetId, icsAccount, days, xsrfToken } =
    await showSetupDialog();

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);

  // --- Progress Dialog ---
  const createProgressDialog = () => {
    const dialog = document.createElement("dialog");
    dialog.className =
      "backdrop:bg-black/80 bg-white rounded-xl p-8 max-w-lg w-[90%] shadow-2xl";
    const title = Object.assign(document.createElement("h2"), {
      textContent: "Syncing Transactions",
      className: "mb-4 text-2xl font-semibold text-gray-900",
    });
    const status = Object.assign(document.createElement("div"), {
      textContent: "Initializing...",
      className: "mb-4 text-sm text-gray-600",
    });
    const progressBar = Object.assign(document.createElement("div"), {
      className: "w-full bg-gray-200 rounded-full h-2 mb-4",
    });
    const progressFill = Object.assign(document.createElement("div"), {
      className: "bg-green-500 h-2 rounded-full transition-all duration-300",
      style: "width: 0%",
    });
    progressBar.append(progressFill);
    const stats = Object.assign(document.createElement("div"), {
      className: "text-sm text-gray-500 space-y-1 mb-2",
    });
    const batchInfo = Object.assign(document.createElement("div"), {
      className: "text-xs text-gray-400 italic",
    });
    dialog.append(title, status, progressBar, stats, batchInfo);
    document.body.append(dialog);
    dialog.showModal();

    return {
      dialog,
      updateStatus: (t) => (status.textContent = t),
      updateProgress: (p) => (progressFill.style.width = `${p}%`),
      updateStats: (fetched, sent) => {
        stats.innerHTML = `
          <div>Fetched from ICS: <strong>${fetched}</strong></div>
          <div>Sent to Lunch Money: <strong>${sent}</strong></div>
        `;
      },
      updateBatch: (cur, total, info) => {
        batchInfo.textContent = `Batch ${cur}/${total} • ${info}`;
      },
      close: () => {
        dialog.close();
        dialog.remove();
      },
    };
  };

  // --- Sync ---
  const progress = createProgressDialog();
  progress.updateStatus(`Fetching from account ${icsAccount}...`);

  let until = new Date(today);
  let totalFetched = 0;
  let totalSent = 0;
  const totalDays = Math.ceil((today - cutoff) / (1000 * 60 * 60 * 24));
  let processedDays = 0;
  let batchNumber = 0;

  // Count total batches
  const batches = [];
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

      const daysInInterval = Math.ceil(
        (until - from) / (1000 * 60 * 60 * 24)
      );
      processedDays += daysInInterval;
      const pct = Math.min((processedDays / totalDays) * 100, 95);
      progress.updateProgress(pct);
      progress.updateStatus(
        `Fetching ${formatDate(from)} to ${formatDate(until)}...`
      );
      progress.updateBatch(
        batchNumber,
        totalBatches,
        `${formatDate(from)} → ${formatDate(until)}`
      );

      const params = new URLSearchParams({
        accountNumber: icsAccount,
        debitCredit: "DEBIT_AND_CREDIT",
        fromDate: formatDate(from),
        untilDate: formatDate(until),
      });

      const bankResp = await fetch(
        `/api/nl/sec/frontendservices/transactionsv3/search?${params}`,
        {
          headers: {
            "X-XSRF-TOKEN": xsrfToken,
            Accept: "application/json",
          },
        }
      );

      if (!bankResp.ok)
        throw new Error(`ICS API error: ${bankResp.status}`);

      const bankData = await bankResp.json();
      if (!Array.isArray(bankData)) break;

      totalFetched += bankData.length;
      progress.updateStats(totalFetched, totalSent);

      // Create import tag
      const tagName = `importedAt:${new Date().toISOString()}`;
      let tagId;
      try {
        const tagResp = await fetch("https://api.lunchmoney.dev/v2/tags", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: tagName }),
        });
        tagId = (await tagResp.json()).id;
      } catch {}

      // Transform transactions
      const lmTxns = bankData.map(
        ({
          transactionDate,
          description = "",
          billingAmount,
          billingCurrency,
          sourceAmount,
          sourceCurrency,
          processingTime,
          batchNr,
          batchSequenceNr,
        }) => ({
          date: transactionDate,
          payee: description,
          amount: Number(billingAmount),
          manual_account_id: Number(assetId),
          tag_ids: tagId ? [tagId] : [],
          notes:
            sourceCurrency && sourceCurrency !== billingCurrency
              ? `Original: ${sourceAmount} ${sourceCurrency}`
              : "",
          external_id: `${transactionDate}-${processingTime || "000000"}-${batchNr}-${batchSequenceNr}-${billingAmount}`,
          status: "unreviewed",
        })
      );

      if (lmTxns.length > 0) {
        progress.updateStatus(
          `Sending ${lmTxns.length} transactions to Lunch Money...`
        );
        progress.updateBatch(
          batchNumber,
          totalBatches,
          `Sending batch ${batchNumber}/${totalBatches}...`
        );

        const lmResp = await fetch(
          "https://api.lunchmoney.dev/v2/transactions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transactions: lmTxns,
              apply_rules: true,
              skip_duplicates: true,
            }),
          }
        );

        if (!lmResp.ok && lmResp.status !== 201) {
          const errText = await lmResp.text();
          throw new Error(
            `Lunch Money API error: ${lmResp.status} – ${errText.substring(0, 200)}`
          );
        }

        const result = await lmResp.json();
        const inserted = result.transactions?.length || 0;
        const skipped = result.skipped_duplicates?.length || 0;
        totalSent += inserted;
        progress.updateStats(totalFetched, totalSent);
        progress.updateBatch(
          batchNumber,
          totalBatches,
          `${inserted} new, ${skipped} skipped • ${formatDate(from)} → ${formatDate(until)}`
        );
        console.log(
          `${formatDate(from)} – ${formatDate(until)}: ${inserted} inserted, ${skipped} skipped`
        );
      }

      until = new Date(from);
      until.setDate(until.getDate() - 1);
    }

    progress.updateProgress(100);
    progress.updateStatus("Sync complete!");
    progress.updateStats(totalFetched, totalSent);

    setTimeout(() => {
      progress.close();
      showPopup(
        `Sync done: ${totalFetched} fetched, ${totalSent} sent to Lunch Money.`
      );
    }, 1500);
  } catch (err) {
    console.error("Sync error:", err);
    progress?.close();
    showError(
      "Sync Failed",
      `${err.message}<br><br>Check the browser console for details.`
    );
  }
})();
