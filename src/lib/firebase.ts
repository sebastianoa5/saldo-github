import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDw2rMUXiDrWozvTAZu1xh7caXvhyFFOPE",
  authDomain: "saldo-personale-abcb8.firebaseapp.com",
  projectId: "saldo-personale-abcb8",
  storageBucket: "saldo-personale-abcb8.firebasestorage.app",
  messagingSenderId: "85146673012",
  appId: "1:85146673012:web:e7f0b1b49a5643e28c5621"
};


const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);