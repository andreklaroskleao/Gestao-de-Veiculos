import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "./firebase-init.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  // The app is hosted outside Firebase Hosting; popup avoids the cross-site
  // storage dependency that can prevent redirect sign-in on mobile browsers.
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}
