import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAnDFA1ZWg5HZCN9nuvUwVWzP69tvuGHRU",
  authDomain: "rentiq-f100f.firebaseapp.com",
  projectId: "rentiq-f100f",
  storageBucket: "rentiq-f100f.firebasestorage.app",
  messagingSenderId: "805990007850",
  appId: "1:805990007850:web:b99000d0fb4a0d7aa5af53"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);