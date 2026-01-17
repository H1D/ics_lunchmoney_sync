// @name ICS Export
// @description Export ICS Bank transactions to CSV - view and download your transactions

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

  // Prompt for number of days
  const showDaysPrompt = () =>
    new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className =
        "backdrop:bg-black/50 bg-white rounded-xl p-6 max-w-md w-[90%] shadow-2xl";

      const title = Object.assign(document.createElement("h2"), {
        textContent: "ICS Transaction Export",
        className: "mb-4 text-xl font-semibold text-gray-900",
      });

      const message = Object.assign(document.createElement("p"), {
        textContent: "How many days back would you like to fetch?",
        className: "mb-5 text-sm text-gray-600",
      });

      const input = Object.assign(document.createElement("input"), {
        type: "number",
        value: "30",
        min: "1",
        className:
          "w-full px-3 py-3 border-2 border-gray-200 rounded-lg text-sm mb-2 focus:outline-none focus:border-blue-500",
      });

      const hint = Object.assign(document.createElement("p"), {
        textContent: "",
        className: "text-xs text-red-500 mb-2 h-4",
      });

      const submitBtn = Object.assign(document.createElement("button"), {
        textContent: "Fetch Transactions",
        className:
          "bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition w-full",
        onclick: () => {
          const value = parseInt(input.value, 10);
          if (value > 0) {
            dialog.close();
            dialog.remove();
            resolve(value);
          } else {
            hint.textContent = "Please enter a positive number";
          }
        },
      });

      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") submitBtn.click();
      });

      dialog.addEventListener("cancel", (e) => e.preventDefault());

      dialog.append(title, message, input, hint, submitBtn);
      document.body.append(dialog);
      dialog.showModal();
      input.select();
    });

  // Error dialog
  const showError = (title, message) => {
    const dialog = document.createElement("dialog");
    dialog.className =
      "backdrop:bg-black/50 bg-white rounded-xl p-6 max-w-md w-[90%] shadow-2xl";

    dialog.innerHTML = `
      <h2 class="mb-4 text-xl font-semibold text-red-600">${title}</h2>
      <p class="mb-5 text-sm text-gray-600">${message}</p>
      <button class="bg-gray-500 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">Close</button>
    `;

    dialog.querySelector("button").onclick = () => {
      dialog.close();
      dialog.remove();
    };

    document.body.append(dialog);
    dialog.showModal();
  };

  // Show results table with CSV download
  const showResults = (transactions) => {
    const dialog = document.createElement("dialog");
    dialog.className =
      "backdrop:bg-black/50 bg-white rounded-xl p-6 max-w-6xl w-[95%] max-h-[90vh] shadow-2xl flex flex-col";

    // Header
    const header = document.createElement("div");
    header.className = "flex justify-between items-center mb-4";

    const title = Object.assign(document.createElement("h2"), {
      textContent: `${transactions.length} Transactions`,
      className: "text-xl font-semibold text-gray-900",
    });

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "flex gap-2";

    const downloadBtn = Object.assign(document.createElement("button"), {
      textContent: "Download CSV",
      className:
        "bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition",
    });

    const closeBtn = Object.assign(document.createElement("button"), {
      textContent: "Close",
      className:
        "bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition",
    });

    // CSV download handler
    downloadBtn.onclick = () => {
      const headers = [
        "Date",
        "Time",
        "Description",
        "Amount",
        "Currency",
        "Original Amount",
        "Original Currency",
        "Category",
        "Country",
        "Card",
        "Cardholder",
        "Transaction Type",
        "Purchase Type",
        "Batch Number",
        "Batch Sequence",
        "Wallet Provider",
        "Extra Card Indicator",
        "Direct Debit State",
        "Mobile",
        "Loyalty Points",
        "Chargeback Allowed",
      ];

      const rows = transactions.map((t) => [
        t.transactionDate,
        t.processingTime || "",
        `"${(t.description || "").replace(/"/g, '""')}"`,
        t.billingAmount,
        t.billingCurrency,
        t.sourceAmount,
        t.sourceCurrency,
        `"${(t.merchantCategoryCodeDescription || "").replace(/"/g, '""')}"`,
        t.countryCode || "",
        t.lastFourDigits || "",
        `"${(t.embossingName || "").replace(/"/g, '""')}"`,
        t.typeOfTransaction || "",
        t.typeOfPurchase || "",
        t.batchNr || "",
        t.batchSequenceNr || "",
        t.walletProvider || "",
        t.indicatorExtraCard || "",
        t.directDebitState || "",
        t.mobile ?? "",
        t.loyaltyPoints ?? "",
        t.chargeBackAllowed ?? "",
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join(
        "\n"
      );

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `ics-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      a.click();
      URL.revokeObjectURL(url);
    };

    closeBtn.onclick = () => {
      dialog.close();
      dialog.remove();
    };

    buttonGroup.append(downloadBtn, closeBtn);
    header.append(title, buttonGroup);

    // Table container
    const tableContainer = document.createElement("div");
    tableContainer.className = "overflow-auto flex-1";

    const table = document.createElement("table");
    table.className = "w-full text-sm border-collapse";

    // Table header
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr class="bg-gray-100 sticky top-0">
        <th class="px-3 py-2 text-left font-medium text-gray-700 border-b">Date</th>
        <th class="px-3 py-2 text-left font-medium text-gray-700 border-b">Description</th>
        <th class="px-3 py-2 text-right font-medium text-gray-700 border-b">Amount</th>
        <th class="px-3 py-2 text-left font-medium text-gray-700 border-b">Category</th>
        <th class="px-3 py-2 text-left font-medium text-gray-700 border-b">Country</th>
      </tr>
    `;

    // Table body
    const tbody = document.createElement("tbody");
    transactions.forEach((t) => {
      const tr = document.createElement("tr");
      tr.className = "border-b hover:bg-gray-50";

      const amount = Number(t.billingAmount);
      const amountClass = amount < 0 ? "text-green-600" : "text-gray-900";
      const fxNote =
        t.sourceCurrency && t.sourceCurrency !== t.billingCurrency
          ? `<span class="text-xs text-gray-400 block">${t.sourceAmount} ${t.sourceCurrency}</span>`
          : "";

      tr.innerHTML = `
        <td class="px-3 py-2 whitespace-nowrap">${t.transactionDate}</td>
        <td class="px-3 py-2">${t.description || "-"}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap ${amountClass}">
          ${amount.toFixed(2)} ${t.billingCurrency}${fxNote}
        </td>
        <td class="px-3 py-2 text-xs text-gray-500">${t.merchantCategoryCodeDescription || "-"}</td>
        <td class="px-3 py-2">${t.countryCode || "-"}</td>
      `;
      tbody.append(tr);
    });

    table.append(thead, tbody);
    tableContainer.append(table);

    dialog.append(header, tableContainer);
    document.body.append(dialog);
    dialog.showModal();
  };

  // Progress dialog
  const showProgress = (message) => {
    const dialog = document.createElement("dialog");
    dialog.className =
      "backdrop:bg-black/50 bg-white rounded-xl p-6 max-w-md w-[90%] shadow-2xl";

    dialog.innerHTML = `
      <h2 class="mb-4 text-xl font-semibold text-gray-900">Fetching Transactions</h2>
      <p class="text-sm text-gray-600 mb-4">${message}</p>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
      </div>
    `;

    document.body.append(dialog);
    dialog.showModal();

    return {
      update: (msg, percent) => {
        dialog.querySelector("p").textContent = msg;
        dialog.querySelector(".bg-blue-500").style.width = `${percent}%`;
      },
      close: () => {
        dialog.close();
        dialog.remove();
      },
    };
  };

  // Date formatting (YYYY-MM-DD)
  const formatDate = (d) => new Intl.DateTimeFormat("sv-SE").format(d);

  // Get XSRF token
  const xsrfToken = decodeURIComponent(
    document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ""
  );

  // Start: ask for days
  const days = await showDaysPrompt();

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);

  // Fetch accounts
  let accountNumber;
  try {
    const resp = await fetch("/api/nl/sec/frontendservices/allaccountsv2", {
      headers: { "X-XSRF-TOKEN": xsrfToken, Accept: "application/json" },
    });

    if (!resp.ok) {
      if (resp.status === 403) {
        showError(
          "Authentication Failed",
          "Please log into ICS Cards first, then try again."
        );
        return;
      }
      throw new Error(`Failed to fetch accounts: ${resp.status}`);
    }

    const data = await resp.json();
    const accounts = Array.isArray(data) ? data : [data];
    if (accounts.length === 0) {
      showError("No Accounts", "No accounts found.");
      return;
    }
    accountNumber = accounts[0].accountNumber;
  } catch (err) {
    showError("Error", err.message);
    return;
  }

  // Fetch transactions in chunks
  const progress = showProgress("Starting...");
  const allTransactions = [];
  let until = new Date(today);
  let batchNum = 0;
  const totalDays = Math.ceil((today - cutoff) / (1000 * 60 * 60 * 24));

  try {
    while (until > cutoff) {
      batchNum++;
      const from = new Date(until);
      from.setDate(from.getDate() - 30);
      if (from < cutoff) from.setTime(cutoff.getTime());

      const daysProcessed = Math.ceil((today - from) / (1000 * 60 * 60 * 24));
      const percent = Math.min((daysProcessed / totalDays) * 100, 95);
      progress.update(
        `Fetching ${formatDate(from)} to ${formatDate(until)}...`,
        percent
      );

      const params = new URLSearchParams({
        accountNumber,
        debitCredit: "DEBIT_AND_CREDIT",
        fromDate: formatDate(from),
        untilDate: formatDate(until),
      });

      const resp = await fetch(
        `/api/nl/sec/frontendservices/transactionsv3/search?${params}`,
        {
          headers: { "X-XSRF-TOKEN": xsrfToken, Accept: "application/json" },
        }
      );

      if (!resp.ok) throw new Error(`API error: ${resp.status}`);

      const data = await resp.json();
      if (Array.isArray(data)) {
        allTransactions.push(...data);
      }

      until = new Date(from);
      until.setDate(until.getDate() - 1);
    }

    progress.update("Done!", 100);
    setTimeout(() => {
      progress.close();
      showResults(allTransactions);
    }, 500);
  } catch (err) {
    progress.close();
    showError("Fetch Failed", err.message);
  }
})();
