// Shared payment tracking.
// Works across different phones, browsers, WhatsApp and Telegram in-app browsers
// when Firebase is configured. localStorage remains as a fallback.

import {
  database,
  ref,
  set,
  update,
  onValue,
  isFirebaseConfigured,
  firebaseConfig
} from "./firebase-config.js";

const HISTORY_KEY = "paymentLinkHistory";
const TRACKING_ROOT = "paymentLinks";

let cloudRecords = {};
let unsubscribe = null;

function readLocalHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeItem(item) {
  const id = String(item?.id || "").trim();
  if (!id) return null;

  const link = item.link || item.url || "";
  const normalized = {
    ...item,
    id,
    link,
    url: item.url || link,
    visited: Boolean(item.visited),
    copied: Boolean(item.copied),
    status: item.status || "Pending",
    utr: item.utr || "",
    createdAt: item.createdAt || new Date().toISOString()
  };

  return normalized;
}

function sortHistory(items) {
  return items.sort((a, b) => {
    const aTime = Date.parse(a.createdAt || "") || 0;
    const bTime = Date.parse(b.createdAt || "") || 0;
    return bTime - aTime;
  });
}

function saveMergedHistory() {
  const local = new Map();

  for (const item of readLocalHistory()) {
    const normalized = normalizeItem(item);
    if (normalized) local.set(normalized.id, normalized);
  }

  for (const [id, value] of Object.entries(cloudRecords)) {
    const normalized = normalizeItem({ ...value, id });
    if (normalized) local.set(id, normalized);
  }

  const merged = sortHistory([...local.values()]);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));

  window.dispatchEvent(
    new CustomEvent("paymentHistoryCloudUpdated", {
      detail: merged
    })
  );

  return merged;
}

async function upsertMissingLocalRecords() {
  if (!isFirebaseConfigured || !database) return;

  const local = readLocalHistory();

  for (const rawItem of local) {
    const item = normalizeItem(rawItem);
    if (!item || cloudRecords[item.id]) continue;

    try {
      await set(ref(database, `${TRACKING_ROOT}/${item.id}`), item);
    } catch (error) {
      console.error("Could not create cloud tracking record:", error);
    }
  }
}

async function cloudUpdate(id, patch, keepalive = false) {
  if (!isFirebaseConfigured || !database || !id) return false;

  const safePatch = {
    ...patch,
    updatedAt: new Date().toISOString()
  };

  // keepalive is important when the payment page immediately redirects
  // after submitting UTR or launching another app.
  if (keepalive) {
    const baseUrl = String(firebaseConfig.databaseURL || "").replace(/\/$/, "");
    if (!baseUrl) return false;

    try {
      fetch(
        `${baseUrl}/${TRACKING_ROOT}/${encodeURIComponent(id)}.json`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(safePatch),
          keepalive: true
        }
      ).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  try {
    await update(
      ref(database, `${TRACKING_ROOT}/${id}`),
      safePatch
    );
    return true;
  } catch (error) {
    console.error("Could not update cloud tracking record:", error);
    return false;
  }
}

function startAdminSync() {
  if (!isFirebaseConfigured || !database) {
    window.paymentTrackingEnabled = false;
    return;
  }

  window.paymentTrackingEnabled = true;

  if (unsubscribe) {
    unsubscribe();
  }

  unsubscribe = onValue(
    ref(database, TRACKING_ROOT),
    snapshot => {
      cloudRecords = snapshot.val() || {};
      saveMergedHistory();
      upsertMissingLocalRecords();
    },
    error => {
      console.error("Firebase tracking read failed:", error);
    }
  );

  // Catch a newly generated local record, including records created by either
  // of the two existing admin dashboard pages.
  upsertMissingLocalRecords();
  setInterval(upsertMissingLocalRecords, 2500);
}

function startPaymentTracking() {
  const params = new URLSearchParams(window.location.search);
  const linkId = params.get("id");

  if (!linkId || !isFirebaseConfigured || !database) {
    return;
  }

  // Mark visit immediately and use fetch keepalive so this works even when
  // the page was opened from WhatsApp/Telegram and is later navigated away.
  cloudUpdate(
    linkId,
    {
      visited: true,
      visitedAt: new Date().toISOString()
    },
    true
  );

  // Capture clicks before the existing inline onclick handlers.
  document.addEventListener(
    "click",
    event => {
      const copyButton = event.target.closest(".copy-btn");
      if (copyButton) {
        cloudUpdate(
          linkId,
          {
            copied: true,
            copiedAt: new Date().toISOString()
          },
          true
        );
      }

      const submitButton = event.target.closest(".submit-btn");
      if (submitButton) {
        const utrInput = document.getElementById("utrInput");
        const utr = String(utrInput?.value || "").trim();

        if (/^\d{12}$/.test(utr)) {
          cloudUpdate(
            linkId,
            {
              status: "UTR: " + utr,
              utr,
              utrSubmittedAt: new Date().toISOString()
            },
            true
          );
        }
      }
    },
    true
  );
}

window.paymentTracker = {
  enabled: isFirebaseConfigured,
  update: cloudUpdate,
  startAdminSync,
  startPaymentTracking
};

// Start automatically based on the page that loaded this module.
if (
  document.getElementById("historyTableBody") ||
  document.getElementById("history-table-body")
) {
  startAdminSync();
}

if (new URLSearchParams(window.location.search).has("id")) {
  startPaymentTracking();
}
