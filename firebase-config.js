import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  remove,
  get
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";


/* =========================================================
   FIREBASE CONFIG
========================================================= */

const firebaseConfig = {

  apiKey:
    "AIzaSyA35EKHWLM7-7WrTAOGQRgshY-k9Ug-AQA",

  authDomain:
    "repayment-tracking.firebaseapp.com",

  databaseURL:
    "https://repayment-tracking-default-rtdb.asia-southeast1.firebasedatabase.app",

  projectId:
    "repayment-tracking",

  storageBucket:
    "repayment-tracking.firebasestorage.app",

  messagingSenderId:
    "617173160765",

  appId:
    "1:617173160765:web:73124d9e1b8df1858f2b54",

  measurementId:
    "G-T4J6PY187V"

};


/* =========================================================
   INITIALIZE FIREBASE
========================================================= */

const app =
  initializeApp(
    firebaseConfig
  );


/* =========================================================
   DATABASE
========================================================= */

export const database =
  getDatabase(
    app
  );


/* =========================================================
   AUTHENTICATION
========================================================= */

export const auth =
  getAuth(
    app
  );


/* =========================================================
   FIREBASE STATUS
========================================================= */

export const isFirebaseConfigured =
  Boolean(

    firebaseConfig.apiKey &&

    firebaseConfig.projectId &&

    firebaseConfig.databaseURL

  );


/* =========================================================
   EXPORTS
========================================================= */

export {

  firebaseConfig,

  ref,

  set,

  update,

  onValue,
  remove,

  getAuth,

  signInAnonymously,

  signInWithEmailAndPassword,

  onAuthStateChanged,

  signOut

};
