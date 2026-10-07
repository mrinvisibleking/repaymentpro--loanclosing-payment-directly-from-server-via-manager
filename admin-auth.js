// ============================================================
// FIREBASE ADMIN AUTHENTICATION
// ============================================================

import {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "./firebase-config.js";


const ADMIN_UID =
  "pC1CqXm1gRUwX2m4XbdbcNNN0p93";


async function login(email, password) {

  const result =
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );


  if (
    result.user.uid !== ADMIN_UID
  ) {

    await signOut(auth);

    throw new Error(
      "This Firebase account is not authorized as an admin."
    );
  }


  console.log(
    "Authorized Firebase admin:",
    result.user.uid
  );


  // Start realtime dashboard listener
  // only after successful authentication.

  if (
    window.paymentTracker?.startAdminSync
  ) {

    window.paymentTracker.startAdminSync();
  }


  return result.user;
}


async function logout() {

  await signOut(auth);

}


window.firebaseAdminAuth = {

  login,

  logout,

  ADMIN_UID

};


// ============================================================
// EXISTING AUTH SESSION
// ============================================================

onAuthStateChanged(
  auth,

  user => {

    if (!user) {

      console.log(
        "No Firebase admin session."
      );

      return;
    }


    if (
      user.uid === ADMIN_UID &&
      window.paymentTracker?.startAdminSync
    ) {

      window.paymentTracker.startAdminSync();
    }

  }
);
