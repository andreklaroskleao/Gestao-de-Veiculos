import {
  addDoc, collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase-init.js";

const MAX_RECORDS = 250;
const vehicleRef = (vehicleId) => doc(db, "vehicles", vehicleId);
const collectionRef = (vehicleId, name) => collection(db, "vehicles", vehicleId, name);

export async function upsertUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const existing = await getDoc(ref);
  const profile = {
    uid: user.uid,
    name: user.displayName || "Usuário",
    email: (user.email || "").toLowerCase(),
    photoURL: user.photoURL || "",
    updatedAt: serverTimestamp(),
  };
  if (!existing.exists()) profile.createdAt = serverTimestamp();
  await setDoc(ref, profile, { merge: true });
}

export async function listPaymentMethods(userId) {
  const snapshot = await getDocs(collection(db, "users", userId, "paymentMethods"));
  const methods = await Promise.all(snapshot.docs.map(async (item) => {
    const data = item.data();
    if (Object.hasOwn(data, "expiry")) {
      try {
        await updateDoc(item.ref, { expiry: deleteField(), updatedAt: serverTimestamp() });
        delete data.expiry;
      } catch (error) {
        // Older rules may still require the legacy field. Never expose it in the UI.
        console.warn("Could not remove legacy card expiry; publish the updated Firestore rules first.", error);
        delete data.expiry;
      }
    }
    return { id: item.id, ...data };
  }));
  return methods
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function createPaymentMethod(userId, data) {
  const ref = await addDoc(collection(db, "users", userId, "paymentMethods"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePaymentMethod(userId, paymentMethodId, data) {
  await updateDoc(doc(db, "users", userId, "paymentMethods", paymentMethodId), {
    ...data,
    expiry: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function deletePaymentMethod(userId, paymentMethodId) {
  await deleteDoc(doc(db, "users", userId, "paymentMethods", paymentMethodId));
}

export async function listServiceProviders(userId) {
  const snapshot = await getDocs(collection(db, "users", userId, "serviceProviders"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function createServiceProvider(userId, data) {
  const ref = await addDoc(collection(db, "users", userId, "serviceProviders"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateServiceProvider(userId, providerId, data) {
  await updateDoc(doc(db, "users", userId, "serviceProviders", providerId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteServiceProvider(userId, providerId) {
  await deleteDoc(doc(db, "users", userId, "serviceProviders", providerId));
}

export async function listAccessibleVehicles(userId) {
  const ownedQuery = query(collection(db, "vehicles"), where("ownerId", "==", userId), limit(100));
  const [ownedSnapshot, sharesSnapshot] = await Promise.all([
    getDocs(ownedQuery),
    getDocs(query(collectionGroup(db, "shares"), where("userId", "==", userId), limit(100))),
  ]);
  const vehicles = new Map();
  ownedSnapshot.docs.forEach((snapshot) => vehicles.set(snapshot.id, { id: snapshot.id, ...snapshot.data(), role: "owner" }));
  const sharedDocs = sharesSnapshot.docs.filter((snapshot) => snapshot.ref.parent.parent);
  const sharedVehicles = await Promise.all(sharedDocs.map(async (share) => {
    const vehicleDoc = await getDoc(share.ref.parent.parent);
    if (!vehicleDoc.exists()) return null;
    return { id: vehicleDoc.id, ...vehicleDoc.data(), role: share.data().role || "viewer" };
  }));
  sharedVehicles.filter(Boolean).forEach((vehicle) => vehicles.set(vehicle.id, vehicle));
  return [...vehicles.values()].filter((vehicle) => !vehicle.archivedAt).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function createVehicle(user, data) {
  const ref = await addDoc(collection(db, "vehicles"), {
    ...data,
    ownerId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateVehicle(vehicleId, data) {
  await updateDoc(vehicleRef(vehicleId), { ...data, updatedAt: serverTimestamp() });
}

export async function archiveVehicle(vehicleId) {
  await updateDoc(vehicleRef(vehicleId), { archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function deleteVehiclePermanently(vehicleId) {
  const deletePages = async (ref, nestedExpenses = false) => {
    while (true) {
      const page = await getDocs(query(ref, limit(350)));
      if (page.empty) break;
      if (nestedExpenses) {
        for (const trip of page.docs) await deletePages(collection(trip.ref, "expenses"));
      }
      const batch = writeBatch(db);
      page.docs.forEach((snapshot) => batch.delete(snapshot.ref));
      await batch.commit();
    }
  };
  for (const name of ["refuels", "maintenances", "tires", "expenses", "trips", "shares", "shareInvites", "odometerHistory"]) {
    await deletePages(collection(db, "vehicles", vehicleId, name), name === "trips");
  }
  await deleteDoc(vehicleRef(vehicleId));
}

export async function listVehicleRecords(vehicleId, name, dateField = "date") {
  const recordsQuery = query(collectionRef(vehicleId, name), orderBy(dateField, "desc"), limit(MAX_RECORDS));
  const snapshot = await getDocs(recordsQuery);
  return snapshot.docs.map((item) => ({ id: item.id, path: item.ref.path, ...item.data() }));
}

export async function listVehicleExpenses(vehicleId) {
  const expensesQuery = query(collectionGroup(db, "expenses"), where("vehicleId", "==", vehicleId), orderBy("date", "desc"), limit(MAX_RECORDS));
  const snapshot = await getDocs(expensesQuery);
  return snapshot.docs.map((item) => ({ id: item.id, path: item.ref.path, ...item.data() }));
}

export async function loadVehicleData(vehicleId) {
  const [refuels, maintenances, tires, expenses, trips] = await Promise.all([
    listVehicleRecords(vehicleId, "refuels"),
    listVehicleRecords(vehicleId, "maintenances"),
    listVehicleRecords(vehicleId, "tires"),
    listVehicleExpenses(vehicleId),
    listVehicleRecords(vehicleId, "trips", "startDate"),
  ]);
  return { refuels, maintenances, tires, expenses, trips };
}

export async function addRecord(vehicleId, name, data, userId, tripId = "") {
  const destination = name === "expenses" && tripId
    ? collection(db, "vehicles", vehicleId, "trips", tripId, "expenses")
    : collectionRef(vehicleId, name);
  const payload = {
    ...data,
    createdBy: userId,
    vehicleId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (tripId) payload.tripId = tripId;
  return addDoc(destination, payload);
}

export async function saveRecord(path, data) {
  await updateDoc(doc(db, path), { ...data, updatedAt: serverTimestamp() });
}

export async function closeTrip(vehicleId, tripId, { endDate, endOdometer }) {
  const trip = doc(db, "vehicles", vehicleId, "trips", tripId);
  const snapshot = await getDoc(trip);
  if (!snapshot.exists()) throw new Error("Esta viagem não foi encontrada.");
  const startOdometer = Number(snapshot.data().startOdometer);
  const finalOdometer = Number(endOdometer);
  if (!endDate || endDate < snapshot.data().startDate || !Number.isFinite(finalOdometer) || finalOdometer < startOdometer) {
    throw new Error("Informe uma data final e uma quilometragem igual ou maior que a inicial.");
  }
  await updateDoc(trip, {
    status: "closed",
    endDate,
    endOdometer: finalOdometer,
    distance: finalOdometer - startOdometer,
    updatedAt: serverTimestamp(),
  });
}

export async function reopenTrip(vehicleId, tripId) {
  await updateDoc(doc(db, "vehicles", vehicleId, "trips", tripId), {
    status: "open",
    endDate: deleteField(),
    endOdometer: deleteField(),
    distance: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function removeRecord(path) {
  const segments = path.split("/");
  if (segments.length === 4 && segments[2] === "trips") {
    const nested = await getDocs(collection(db, ...segments, "expenses"));
    for (let offset = 0; offset < nested.docs.length; offset += 400) {
      const batch = writeBatch(db);
      nested.docs.slice(offset, offset + 400).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
  }
  await deleteDoc(doc(db, path));
}

export async function listVehicleShares(vehicleId) {
  const snapshot = await getDocs(query(collection(db, "vehicles", vehicleId, "shares"), limit(100)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listVehicleInvites(vehicleId) {
  const snapshot = await getDocs(query(collection(db, "vehicles", vehicleId, "shareInvites"), limit(100)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function changeInviteRole(vehicleId, email, role) {
  await updateDoc(doc(db, "vehicles", vehicleId, "shareInvites", email), { role });
}

export async function shareVehicleByEmail(vehicleId, email, role, user) {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === (user.email || "").toLowerCase()) throw new Error("Você já é proprietário deste veículo.");
  const inviteRef = doc(db, "vehicles", vehicleId, "shareInvites", normalizedEmail);
  const existingInvite = await getDoc(inviteRef);
  if (existingInvite.exists()) {
    await updateDoc(inviteRef, { role });
    return normalizedEmail;
  }
  await setDoc(inviteRef, {
    email: normalizedEmail,
    role,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  return normalizedEmail;
}

export async function claimPendingInvites(user) {
  const email = (user.email || "").toLowerCase();
  if (!email) return 0;
  const snapshot = await getDocs(query(collectionGroup(db, "shareInvites"), where("email", "==", email), limit(100)));
  let claimed = 0;
  for (const invite of snapshot.docs) {
    const vehicle = invite.ref.parent.parent;
    if (!vehicle) continue;
    const shareRef = doc(db, "vehicles", vehicle.id, "shares", user.uid);
    const existing = await getDoc(shareRef);
    const inviteData = invite.data();
    if (existing.exists()) {
      await updateDoc(shareRef, { role: inviteData.role });
    } else {
      await setDoc(shareRef, {
        userId: user.uid,
        email,
        displayName: user.displayName || "Usuário",
        role: inviteData.role,
        createdAt: serverTimestamp(),
        createdBy: inviteData.createdBy,
      });
    }
    await deleteDoc(invite.ref);
    claimed += 1;
  }
  return claimed;
}

export async function changeShareRole(vehicleId, userId, role) {
  await updateDoc(doc(db, "vehicles", vehicleId, "shares", userId), { role });
}

export async function removeShare(vehicleId, userId) {
  await deleteDoc(doc(db, "vehicles", vehicleId, "shares", userId));
}

export async function removeInvite(vehicleId, email) {
  await deleteDoc(doc(db, "vehicles", vehicleId, "shareInvites", email));
}
