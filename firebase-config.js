// firebase-config.js

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";


// ============================================
// FIREBASE CONFIGURATION
// ============================================

export const firebaseConfig = {
  apiKey: "AIzaSyA35EKHWLM7-7WrTAOGQRgshY-k9Ug-AQA",
  authDomain: "repayment-tracking.firebaseapp.com",
  databaseURL: "https://repayment-tracking-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "repayment-tracking",
  storageBucket: "repayment-tracking.firebasestorage.app",
  messagingSenderId: "617173160765",
  appId: "1:617173160765:web:73124d9e1b8df1858f2b54",
  measurementId: "G-T4J6PY187V"
};


// ============================================
// INITIALIZE FIREBASE
// ============================================

const app = initializeApp(firebaseConfig);


// ============================================
// REALTIME DATABASE
// ============================================

export const database = getDatabase(app);


// ============================================
// FIREBASE CONFIGURED STATUS
// ============================================

export const isFirebaseConfigured =
  Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.databaseURL
  );


// ============================================
// EXPORT FIREBASE FUNCTIONS
// ============================================

export {
  ref,
  set,
  update,
  onValue
};
