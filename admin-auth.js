import {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "./firebase-config.js";


/* =========================================================
   AUTHORIZED ADMIN UID
========================================================= */

const ADMIN_UID =
  "pC1CqXm1gRUwX2m4XbdbcNNN0p93";


/* =========================================================
   ADMIN LOGIN
========================================================= */

async function login(
  email,
  password
) {

  await setPersistence(
    auth,
    browserLocalPersistence
  );


  const result =
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );


  /*
     Check that the logged-in Firebase
     account is the authorized admin.
  */

  if (
    result.user.uid !==
    ADMIN_UID
  ) {

    await signOut(
      auth
    );

    throw new Error(
      "This Firebase account is not authorized as an admin."
    );

  }


  console.log(
    "Authorized Firebase admin:",
    result.user.uid
  );


  /*
     Start Firebase realtime
     admin history synchronization.
  */

  if (
    window.paymentTracker &&
    typeof window.paymentTracker.startAdminSync ===
      "function"
  ) {

    window.paymentTracker.startAdminSync();

  }

  window.dispatchEvent(
    new CustomEvent("firebaseAdminReady")
  );


  return result.user;

}


/* =========================================================
   ADMIN LOGOUT
========================================================= */

async function logout() {

  await signOut(
    auth
  );

}


/* =========================================================
   MAKE FUNCTIONS AVAILABLE TO index.html
========================================================= */

window.firebaseAdminAuth = {

  login,

  logout,

  ADMIN_UID

};


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

onAuthStateChanged(
  auth,
  function(user) {

    if (!user) {

      console.log(
        "No Firebase admin session."
      );

      /*
         Firebase has finished signing out. Keep the UI on the
         landing page even when logout was triggered elsewhere.
      */
      if (
        typeof window.handleFirebaseAdminSignedOut ===
          "function"
      ) {
        window.handleFirebaseAdminSignedOut();
      }

      return;

    }


    console.log(
      "Firebase auth user:",
      user.uid
    );


    /*
       Only the authorized admin
       can start dashboard synchronization.
    */

    if (
      user.uid ===
      ADMIN_UID
    ) {

      /* Restore the dashboard UI after page refresh. */
      if (
        typeof window.restoreAdminSession ===
          "function"
      ) {

        window.restoreAdminSession();

      }

      if (
        window.paymentTracker &&
        typeof window.paymentTracker.startAdminSync ===
          "function"
      ) {

        window.paymentTracker.startAdminSync();

      }

      window.dispatchEvent(
        new CustomEvent("firebaseAdminReady")
      );

    }

  }
);
