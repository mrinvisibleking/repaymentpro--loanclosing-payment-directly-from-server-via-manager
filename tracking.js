// ============================================================
// SHARED PAYMENT TRACKING
// ============================================================
// Works across:
// - Different phones
// - Different browsers
// - WhatsApp
// - Telegram
// - Incognito
// - Cross-device admin tracking
//
// Firebase Realtime Database is the primary tracking system.
// localStorage is only used as a local/admin cache.
// ============================================================

import {
  database,
  ref,
  set,
  update,
  onValue,
  isFirebaseConfigured,
  firebaseConfig,
  auth,
  signInAnonymously
} from "./firebase-config.js";


const HISTORY_KEY =
  "paymentLinkHistory";

const TRACKING_ROOT =
  "paymentLinks";


let cloudRecords = {};

let unsubscribe = null;


// ============================================================
// LOCAL STORAGE
// ============================================================

function readLocalHistory() {

  try {

    const parsed =
      JSON.parse(
        localStorage.getItem(
          HISTORY_KEY
        ) || "[]"
      );


    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch (error) {

    console.error(
      "Could not read local history:",
      error
    );

    return [];

  }

}


// ============================================================
// NORMALIZE RECORD
// ============================================================

function normalizeItem(item) {

  const id =
    String(
      item?.id || ""
    ).trim();


  if (!id) {

    return null;

  }


  const link =
    item.link ||
    item.url ||
    "";


  return {

    ...item,

    id,

    link,

    url:
      item.url ||
      link,

    visited:
      Boolean(item.visited),

    copied:
      Boolean(item.copied),

    status:
      item.status ||
      "Pending",

    utr:
      item.utr ||
      "",

    createdAt:
      item.createdAt ||
      new Date().toISOString()

  };

}


// ============================================================
// SORT HISTORY
// ============================================================

function sortHistory(items) {

  return items.sort(
    (a, b) => {

      const aTime =
        Date.parse(
          a.createdAt || ""
        ) || 0;


      const bTime =
        Date.parse(
          b.createdAt || ""
        ) || 0;


      return bTime - aTime;

    }
  );

}


// ============================================================
// MERGE FIREBASE + LOCAL HISTORY
// ============================================================

function saveMergedHistory() {

  const local =
    new Map();


  // Local records

  for (
    const item of readLocalHistory()
  ) {

    const normalized =
      normalizeItem(item);


    if (normalized) {

      local.set(
        normalized.id,
        normalized
      );

    }

  }


  // Firebase records

  for (
    const [id, value]
    of Object.entries(
      cloudRecords
    )
  ) {

    const normalized =
      normalizeItem({

        ...value,

        id

      });


    if (normalized) {

      local.set(
        id,
        normalized
      );

    }

  }


  const merged =
    sortHistory(
      [...local.values()]
    );


  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(merged)
  );


  // Tell Admin Dashboard
  // Firebase data changed.

  window.dispatchEvent(
    new CustomEvent(
      "paymentHistoryCloudUpdated",
      {
        detail: merged
      }
    )
  );


  return merged;

}


// ============================================================
// CREATE MISSING FIREBASE RECORDS
// ============================================================

async function upsertMissingLocalRecords() {

  if (
    !isFirebaseConfigured ||
    !database
  ) {

    console.warn(
      "Firebase is not configured."
    );

    return;

  }


  const local =
    readLocalHistory();


  for (
    const rawItem of local
  ) {

    const item =
      normalizeItem(rawItem);


    if (!item) {

      continue;

    }


    if (
      cloudRecords[item.id]
    ) {

      continue;

    }


    try {

      await set(
        ref(
          database,
          `${TRACKING_ROOT}/${item.id}`
        ),
        item
      );


      console.log(
        "Firebase record created:",
        item.id
      );


    } catch (error) {

      console.error(
        "Could not create Firebase tracking record:",
        error
      );

    }

  }

}


// ============================================================
// FIREBASE AUTHENTICATION
// ============================================================

let anonymousAuthPromise =
  null;


async function ensurePaymentPageAuth() {

  if (!auth) {

    throw new Error(
      "Firebase Authentication is not initialized."
    );

  }


  if (auth.currentUser) {

    return auth.currentUser;

  }


  if (!anonymousAuthPromise) {

    anonymousAuthPromise =
      signInAnonymously(auth)

        .then(result => {

          console.log(
            "Anonymous Firebase login successful:",
            result.user.uid
          );

          return result.user;

        })

        .catch(error => {

          anonymousAuthPromise =
            null;

          console.error(
            "Anonymous Firebase login failed:",
            error
          );

          throw error;

        });

  }


  return anonymousAuthPromise;

}


// ============================================================
// UPDATE FIREBASE
// ============================================================

async function cloudUpdate(
  id,
  patch,
  keepalive = false
) {

  if (
    !isFirebaseConfigured ||
    !database ||
    !id
  ) {

    console.warn(
      "Firebase update skipped:",
      {
        id,
        isFirebaseConfigured,
        databaseExists:
          Boolean(database)
      }
    );

    return false;

  }


  // Payment pages use Anonymous Authentication.
  // Admin pages use Email/Password Authentication.

  try {

    if (!auth.currentUser) {

      await ensurePaymentPageAuth();

    }

  } catch (error) {

    console.error(
      "Firebase authentication is required before tracking:",
      error
    );

    return false;

  }


  const safePatch = {

    ...patch,

    updatedAt:
      new Date().toISOString()

  };


  // ==========================================================
  // KEEPALIVE UPDATE
  // ==========================================================

  if (keepalive) {

    const baseUrl =
      String(
        firebaseConfig.databaseURL ||
        ""
      ).replace(
        /\/$/,
        ""
      );


    if (!baseUrl) {

      console.error(
        "Firebase databaseURL is missing."
      );

      return false;

    }


    try {

      const token =
        auth.currentUser
          ? await auth.currentUser.getIdToken()
          : "";


      const authQuery =
        token
          ? `?auth=${encodeURIComponent(token)}`
          : "";


      const response =
        await fetch(

          `${baseUrl}/${TRACKING_ROOT}/${encodeURIComponent(id)}.json${authQuery}`,

          {

            method:
              "PATCH",

            headers: {

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify(
                safePatch
              ),

            keepalive:
              true

          }

        );


      if (!response.ok) {

        console.error(
          "Firebase REST update failed:",
          response.status,
          response.statusText
        );

        return false;

      }


      console.log(
        "Firebase tracking updated:",
        id,
        safePatch
      );


      return true;


    } catch (error) {

      console.error(
        "Firebase keepalive update failed:",
        error
      );

      return false;

    }

  }


  // ==========================================================
  // NORMAL FIREBASE UPDATE
  // ==========================================================

  try {

    await update(
      ref(
        database,
        `${TRACKING_ROOT}/${id}`
      ),
      safePatch
    );


    console.log(
      "Firebase tracking updated:",
      id,
      safePatch
    );


    return true;


  } catch (error) {

    console.error(
      "Could not update Firebase tracking:",
      error
    );

    return false;

  }

}


// ============================================================
// ADMIN REALTIME SYNC
// ============================================================

function startAdminSync() {

  if (
    !isFirebaseConfigured ||
    !database
  ) {

    console.error(
      "Firebase Admin Sync cannot start."
    );


    window.paymentTrackingEnabled =
      false;


    return;

  }


  console.log(
    "Firebase Admin Sync started."
  );


  window.paymentTrackingEnabled =
    true;


  // Remove previous listener

  if (unsubscribe) {

    unsubscribe();

  }


  // ==========================================================
  // REALTIME LISTENER
  // ==========================================================

  unsubscribe =
    onValue(

      ref(
        database,
        TRACKING_ROOT
      ),

      snapshot => {

        cloudRecords =
          snapshot.val() || {};


        console.log(
          "Firebase data received:",
          cloudRecords
        );


        saveMergedHistory();


        upsertMissingLocalRecords();

      },


      error => {

        console.error(
          "Firebase realtime read failed:",
          error
        );

      }

    );


  // Create missing local records

  upsertMissingLocalRecords();


  // Check newly-created local records

  setInterval(
    upsertMissingLocalRecords,
    2500
  );

}


// ============================================================
// PAYMENT PAGE TRACKING
// ============================================================

function startPaymentTracking() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const linkId =
    params.get("id");


  if (!linkId) {

    console.warn(
      "No payment link ID found."
    );

    return;

  }


  if (
    !isFirebaseConfigured ||
    !database
  ) {

    console.error(
      "Firebase is not configured on payment page."
    );

    return;

  }


  console.log(
    "Payment tracking started:",
    linkId
  );


  // ==========================================================
  // VISITED
  // ==========================================================

  cloudUpdate(

    linkId,

    {

      visited:
        true,

      visitedAt:
        new Date().toISOString()

    },

    true

  );


  // ==========================================================
  // CLICK TRACKING
  // ==========================================================

  document.addEventListener(

    "click",

    event => {

      // ------------------------------------------------------
      // COPY UPI
      // ------------------------------------------------------

      const copyButton =
        event.target.closest(
          ".copy-btn"
        );


      if (copyButton) {

        console.log(
          "UPI Copy clicked"
        );


        cloudUpdate(

          linkId,

          {

            copied:
              true,

            copiedAt:
              new Date().toISOString()

          },

          true

        );

      }


      // ------------------------------------------------------
      // SUBMIT UTR
      // ------------------------------------------------------

      const submitButton =
        event.target.closest(
          ".submit-btn"
        );


      if (submitButton) {

        const utrInput =
          document.getElementById(
            "utrInput"
          );


        const utr =
          String(
            utrInput?.value || ""
          ).trim();


        if (
          /^\d{12}$/.test(utr)
        ) {

          console.log(
            "UTR submitted:",
            utr
          );


          cloudUpdate(

            linkId,

            {

              status:
                "UTR: " + utr,

              utr,

              utrSubmittedAt:
                new Date().toISOString()

            },

            true

          );

        }

      }

    },

    true

  );

}


// ============================================================
// GLOBAL TRACKING OBJECT
// ============================================================

window.paymentTracker = {

  enabled:
    isFirebaseConfigured,

  update:
    cloudUpdate,

  startAdminSync,

  startPaymentTracking

};


// ============================================================
// AUTOMATIC PAGE DETECTION
// ============================================================

// Admin Dashboard
// Admin sync is NOT started automatically.
// It starts only after Firebase Email/Password authentication.
//
// Payment page starts tracking automatically.

if (
  new URLSearchParams(
    window.location.search
  ).has("id")
) {

  startPaymentTracking();

}
