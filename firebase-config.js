// Firebase configuration for shared cross-device payment tracking.
// Replace the YOUR_* placeholders with the Web App configuration
// from your Firebase project.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const isFirebaseConfigured =
  Object.values(firebaseConfig).every(
    value =>
      typeof value === "string" &&
      value.length > 0 &&
      !value.includes("YOUR_")
  );

let app = null;
let database = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
}

export {
  app,
  database,
  ref,
  set,
  update,
  onValue,
  isFirebaseConfigured,
  firebaseConfig
};
