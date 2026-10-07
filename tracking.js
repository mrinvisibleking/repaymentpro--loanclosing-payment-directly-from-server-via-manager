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
  signInAnonymously
} from "./firebase-config.js";


const HISTORY_KEY =
  "paymentLinkHistory";

const TRACKING_ROOT =
  "paymentLinks";


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

  if (
    !isFirebaseConfigured ||
    !database
  ) {

    throw new Error(
      "Firebase is not configured."
    );

  }


  const currentUser =
    auth.currentUser;


  /*
     Only the Firebase admin account
     can perform Clear History.
  */

  if (
    !currentUser ||
    currentUser.uid !==
      "pC1CqXm1gRUwX2m4XbdbcNNN0p93"
  ) {

    throw new Error(
      "Admin Firebase login required."
    );

  }


  /*
     Stop realtime listener temporarily.
  */

  if (
    unsubscribe
  ) {

    unsubscribe();

    unsubscribe =
      null;

  }


  /*
     Stop missing-record timer.
  */

  if (
    missingRecordTimer
  ) {

    clearInterval(
      missingRecordTimer
    );

    missingRecordTimer =
      null;

  }


  try {

    /*
       Get a fresh Firebase ID token.
    */

    const token =
      await currentUser.getIdToken(
        true
      );


    const baseUrl =
      String(
        firebaseConfig.databaseURL ||
        ""
      ).replace(
        /\/$/,
        ""
      );


    if (!baseUrl) {

      throw new Error(
        "Firebase databaseURL is missing."
      );

    }


    // ========================================================
    // IMPORTANT
    // ========================================================
    //
    // We can READ paymentLinks because the Firebase Rules
    // allow the admin to read it.
    //
    // We MUST NOT read the entire paymentLinkStatus root
    // because its rules intentionally allow reading individual
    // $linkId records, not the complete root.
    //
    // Therefore we get the IDs from paymentLinks and use the
    // same IDs to delete paymentLinkStatus/{id}.
    // ========================================================

    const paymentLinksSnapshot =
      await get(
        ref(
          database,
          "paymentLinks"
        )
      );


    const paymentLinks =
      paymentLinksSnapshot.exists()
        ? (
            paymentLinksSnapshot.val()
            || {}
          )
        : {};


    const ids =
      Object.keys(
        paymentLinks
      );


    console.log(
      "Clear History - Firebase link IDs:",
      ids
    );


    // ========================================================
    // DELETE ONE FIREBASE RECORD
    // ========================================================

    async function deleteRecord(
      rootPath,
      id
    ) {

      const url =
        baseUrl +
        "/" +
        rootPath +
        "/" +
        encodeURIComponent(id) +
        ".json?auth=" +
        encodeURIComponent(token);


      console.log(
        "Deleting Firebase record:",
        rootPath,
        id
      );


      const response =
        await fetch(
          url,
          {
            method:
              "DELETE",

            cache:
              "no-store",

            headers: {
              "Cache-Control":
                "no-cache"
            }
          }
        );


      if (
        !response.ok
      ) {

        const body =
          await response.text();


        throw new Error(
          "Firebase DELETE failed for " +
          rootPath +
          "/" +
          id +
          " (" +
          response.status +
          "): " +
          body
        );

      }


      console.log(
        "Firebase DELETE successful:",
        rootPath,
        id
      );

    }


    // ========================================================
    // DELETE ALL PAYMENT LINKS
    // ========================================================

    for (
      const id of ids
    ) {

      await deleteRecord(
        "paymentLinks",
        id
      );

    }


    // ========================================================
    // DELETE ALL PAYMENT LINK STATUS RECORDS
    // ========================================================
    //
    // We use the same IDs from paymentLinks.
    //
    // We do NOT call:
    //
    // get(ref(database, "paymentLinkStatus"))
    //
    // because Firebase Rules intentionally do not allow
    // reading the complete paymentLinkStatus root.
    // ========================================================

    for (
      const id of ids
    ) {

      await deleteRecord(
        "paymentLinkStatus",
        id
      );

    }


    // ========================================================
    // FIREBASE DELETE SUCCESS
    // ========================================================
    //
    // IMPORTANT:
    // Do NOT use:
    //
    // linkHistory = [];
    //
    // here.
    //
    // linkHistory belongs to index.html and is NOT available
    // inside this ES module.
    //
    // Using it here would cause:
    //
    // ReferenceError: linkHistory is not defined
    //
    // after Firebase had already successfully deleted the
    // records.
    // ========================================================


    cloudRecords =
      {};


    /*
       Remove local browser history.
    */

    localStorage.removeItem(
      HISTORY_KEY
    );


    /*
       Tell index.html that Firebase
       history is now empty.
    */

    window.dispatchEvent(
      new CustomEvent(
        "paymentHistoryCloudUpdated",
        {
          detail: []
        }
      )
    );


    /*
       Start Firebase realtime sync again.
    */

    startAdminSync();


    console.log(
      "ALL PAYMENT LINK HISTORY CLEARED SUCCESSFULLY."
    );


    return true;

  } catch (error) {

    console.error(
      "Firebase clear history failed:",
      error
    );


    /*
       Restart realtime sync even if
       deletion fails.
    */

    startAdminSync();


    throw error;

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
