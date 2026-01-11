import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAjWpYMV0xKUVqD2MdhmHdsv-CONgZ8iDM",
  authDomain: "zabini-mvp.firebaseapp.com",
  projectId: "zabini-mvp",
  storageBucket: "zabini-mvp.firebasestorage.app",
  messagingSenderId: "757946103220",
  appId: "1:757946103220:web:d56c1371db8c84aac7eee1"
};

const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);

export async function ensureAnonAuth() {
  await signInAnonymously(auth);
}