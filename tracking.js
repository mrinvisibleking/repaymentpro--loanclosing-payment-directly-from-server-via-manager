// ============================================================
// SHARED PAYMENT TRACKING
// ============================================================
// Firebase Realtime Database based tracking
//
// Tracks:
// - Visited
// - UPI Copied
// - UTR / Status
//
// Works across:
// - WhatsApp
// - Telegram
// - Different phones
// - Different browsers
// - Incognito
// ============================================================

import {
  database,
  ref,
  set,
  update,
  onValue,
  get,
  isFirebaseConfigured,
  firebaseConfig,
  auth,
  signInAnonymously,
  onAuthStateChanged
} from "./firebase-config.js";


const HISTORY_KEY =
  "paymentLinkHistory";

const TRACKING_ROOT =
  "paymentLinks";

const ADMIN_UID =
  "pC1CqXm1gRUwX2m4XbdbcNNN0p93";


let cloudRecords = {};

let unsubscribe = null;

let missingRecordTimer = null;

let paymentAuthPromise = null;


// ============================================================
// LOCAL STORAGE
// ============================================================

function readLocalHistory() {

  try {

    const data =
      JSON.parse(
        localStorage.getItem(
          HISTORY_KEY
        ) || "[]"
      );

    return Array.isArray(data)
      ? data
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

  if (!item) {
    return null;
  }

  const id =
    String(
      item.id || ""
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
      Boolean(
        item.visited
      ),

    copied:
      Boolean(
        item.copied
      ),

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
// SORT
// ============================================================

function sortHistory(items) {

  return items.sort(
    function(a, b) {

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
// MERGE FIREBASE + LOCAL
// ============================================================

function saveMergedHistory() {

  const records =
    new Map();


  /*
     First load local records.
  */

  for (
    const item of readLocalHistory()
  ) {

    const normalized =
      normalizeItem(
        item
      );

    if (normalized) {

      records.set(
        normalized.id,
        normalized
      );

    }

  }


  /*
     Then Firebase records override
     the local versions.
  */

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

      records.set(
        id,
        normalized
      );

    }

  }


  const merged =
    sortHistory(
      Array.from(
        records.values()
      )
    );


  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(
      merged
    )
  );


  /*
     Notify index.html
  */

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
// ENSURE PAYMENT PAGE AUTH
// ============================================================

async function ensurePaymentPageAuth() {

  if (!auth) {

    throw new Error(
      "Firebase Authentication is not initialized."
    );

  }


  /*
     Already authenticated?
  */

  if (
    auth.currentUser
  ) {

    return auth.currentUser;

  }


  /*
     Prevent multiple anonymous
     authentication requests.
  */

  if (
    paymentAuthPromise
  ) {

    return paymentAuthPromise;

  }


  paymentAuthPromise =
    signInAnonymously(
      auth
    )
      .then(
        function(result) {

          console.log(
            "Anonymous Firebase authentication successful:",
            result.user.uid
          );

          return result.user;

        }
      )
      .catch(
        function(error) {

          paymentAuthPromise =
            null;

          console.error(
            "Anonymous Firebase authentication failed:",
            error
          );

          throw error;

        }
      );


  return paymentAuthPromise;

}


// ============================================================
// CLOUD UPDATE
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
      "Firebase update skipped."
    );

    return false;

  }


  /*
     Make sure payment page has
     Firebase authentication.
  */

  try {

    if (
      !auth.currentUser
    ) {

      await ensurePaymentPageAuth();

    }

  } catch (error) {

    console.error(
      "Firebase authentication required:",
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

      /*
         Firebase REST API needs
         the Firebase ID token.
      */

      const token =
        await auth.currentUser.getIdToken();


      const url =
        `${baseUrl}/${TRACKING_ROOT}/${encodeURIComponent(id)}.json` +
        `?auth=${encodeURIComponent(token)}`;


      const response =
        await fetch(
          url,
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
  // NORMAL SDK UPDATE
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
      "Firebase update failed:",
      error
    );

    return false;

  }

}


// ============================================================
// CLEAR ALL FIREBASE PAYMENT HISTORY
// ============================================================

async function clearAllCloudHistory() {

  if (!isFirebaseConfigured || !database) {
    throw new Error("Firebase is not configured.");
  }

  const currentUser = auth.currentUser;

  if (
    !currentUser ||
    currentUser.uid !== "pC1CqXm1gRUwX2m4XbdbcNNN0p93"
  ) {
    throw new Error("Admin Firebase login required.");
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (missingRecordTimer) {
    clearInterval(missingRecordTimer);
    missingRecordTimer = null;
  }

  try {
    console.log("Clear History: deleting Firebase roots...");

    // Root deletion is admin-only in the Firebase Rules.
    await set(ref(database, "paymentLinks"), null);
    await set(ref(database, "paymentLinkStatus"), null);

    cloudRecords = {};
    localStorage.removeItem(HISTORY_KEY);

    window.dispatchEvent(
      new CustomEvent("paymentHistoryCloudUpdated", {
        detail: []
      })
    );

    console.log("ALL PAYMENT LINK HISTORY CLEARED SUCCESSFULLY.");

    startAdminSync();

    return true;

  } catch (error) {
    console.error("Firebase clear history failed:", error);

    startAdminSync();

    throw error;
  }
}

// ============================================================
// ADMIN AUTH READY / REALTIME SYNC RECOVERY
// ============================================================

/*
   Firebase Auth and ES modules initialize independently.
   On refresh, the auth session can be restored before the
   tracking module has exposed window.paymentTracker.

   Listen directly to Firebase Auth so the realtime listener
   always starts for the authorized admin.
*/
onAuthStateChanged(
  auth,
  function(user) {

    if (
      user &&
      user.uid === ADMIN_UID
    ) {

      console.log(
        "Tracking: authorized admin session detected."
      );

      startAdminSync();

    }

  }
);


/*
   Also listen for the explicit admin-ready event. This covers
   login/session timing between admin-auth.js and tracking.js.
*/
window.addEventListener(
  "firebaseAdminReady",
  function() {

    if (
      auth.currentUser &&
      auth.currentUser.uid === ADMIN_UID
    ) {

      startAdminSync();

    }

  }
);


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

    return;

  }


  /*
     Avoid creating multiple
     realtime listeners.
  */

  if (
    unsubscribe
  ) {

    console.log(
      "Firebase Admin Sync already running."
    );

    return;

  }


  console.log(
    "Firebase Admin Sync started."
  );


  unsubscribe =
    onValue(

      ref(
        database,
        TRACKING_ROOT
      ),

      function(snapshot) {

        cloudRecords =
          snapshot.val() || {};


        console.log(
          "Firebase data received:",
          cloudRecords
        );


        /*
           Merge Firebase data
           into dashboard history.
        */

        saveMergedHistory();


        /*
           If there are local records
           that Firebase doesn't have yet,
           create them.
        */

        upsertMissingLocalRecords();

      },

      function(error) {

        console.error(
          "Firebase realtime read failed:",
          error
        );

      }

    );


  /*
     Check local records immediately.
  */

  upsertMissingLocalRecords();


  /*
     Keep checking for newly created
     local records.
  */

  if (
    !missingRecordTimer
  ) {

    missingRecordTimer =
      setInterval(
        function() {

          upsertMissingLocalRecords();

        },
        3000
      );

  }

}


// ============================================================
// CREATE MISSING FIREBASE RECORDS
// ============================================================

async function upsertMissingLocalRecords() {

  if (
    !isFirebaseConfigured ||
    !database
  ) {

    return;

  }


  /*
     Only authenticated admin should
     create complete payment records.
  */

  if (
    !auth.currentUser
  ) {

    return;

  }


  const local =
    readLocalHistory();


  for (
    const rawItem of local
  ) {

    const item =
      normalizeItem(
        rawItem
      );


    if (!item) {

      continue;

    }


    /*
       Already exists in Firebase.
    */

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
        {

          ...item,

          updatedAt:
            new Date().toISOString()

        }
      );


      console.log(
        "Firebase record created:",
        item.id
      );


    } catch (error) {

      console.error(
        "Could not create Firebase record:",
        error
      );

    }

  }

}


// ============================================================
// PAYMENT PAGE TRACKING
// ============================================================

async function startPaymentTracking() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const linkId =
    params.get(
      "id"
    );


  /*
     No ID = not a payment page.
  */

  if (!linkId) {

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


  /*
     IMPORTANT:
     Authenticate first.
  */

  try {

    await ensurePaymentPageAuth();

  } catch (error) {

    console.error(
      "Could not authenticate payment page:",
      error
    );

    return;

  }


  // ==========================================================
  // VISITED
  // ==========================================================

  await cloudUpdate(

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

    function(event) {

      /*
         UPI COPY BUTTON
      */

      const copyButton =
        event.target.closest(
          ".copy-btn"
        );


      if (
        copyButton
      ) {

        console.log(
          "UPI Copy button clicked."
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


      /*
         UTR SUBMIT BUTTON
      */

      const submitButton =
        event.target.closest(
          ".submit-btn"
        );


      if (
        submitButton
      ) {

        const utrInput =
          document.getElementById(
            "utrInput"
          );


        const utr =
          String(
            utrInput?.value || ""
          ).trim();


        /*
           Only accept exactly
           12 digits.
        */

        if (
          /^\d{12}$/.test(
            utr
          )
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

        } else {

          console.warn(
            "Invalid UTR. Expected exactly 12 digits."
          );

        }

      }

    },

    true

  );

}


// ============================================================
// GLOBAL PAYMENT TRACKER
// ============================================================

window.paymentTracker = {

  enabled:
    isFirebaseConfigured,

  update:
    cloudUpdate,

  startAdminSync,

  startPaymentTracking,

  clearAllCloudHistory

};


// ============================================================
// AUTOMATIC PAYMENT PAGE DETECTION
// ============================================================

/*
   If URL contains ?id=...
   start payment tracking automatically.
*/

if (
  new URLSearchParams(
    window.location.search
  ).has("id")
) {

  startPaymentTracking();

}
