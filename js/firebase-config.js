/**
 * Church QR Attendance System - Resilient Firebase & Offline Synchronization Engine
 * Integrated with Project: qrcode-bbb68 (كنيسة مارمينا العجايبي بكوم المحرص)
 */

/* ==========================================================================
   Firebase Project Credentials (Provided by User)
   ========================================================================== */
export const firebaseConfig = {
  apiKey: "AIzaSyAur2HYLvGAE6LQUePG2KpuytAhcqLG-kM",
  authDomain: "k-ilo-eb1f2.firebaseapp.com",
  projectId: "k-ilo-eb1f2",
  storageBucket: "k-ilo-eb1f2.firebasestorage.app",
  messagingSenderId: "298963682526",
  appId: "1:298963682526:web:4e8d29d37156cc0731ee4f",
  measurementId: "G-84K7317P7C"
};

export const isConfigured = Boolean(
  firebaseConfig.apiKey && 
  !firebaseConfig.apiKey.includes("YOUR_API_KEY") &&
  firebaseConfig.projectId === "k-ilo-eb1f2"
);

export let isDemoMode = !isConfigured;

export function setDemoModeState(value) {
  isDemoMode = Boolean(value);
}

export let app = null;
export let auth = null;
export let db = null;

// SDK references
let _firestoreSdk = null;
let _authSdk = null;

/**
 * Asynchronously initialize Firebase without blocking ES Module loading or DOM rendering
 */
async function initFirebaseCloud() {
  if (typeof window === 'undefined') return;
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js");
    const { 
      getAuth, 
      signInAnonymously: _signInAnonymously, 
      onAuthStateChanged: _onAuthStateChanged, 
      signInWithEmailAndPassword: _signInWithEmailAndPassword, 
      signOut: _signOut 
    } = await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js");
    
    const { 
      getFirestore, 
      collection: _collection, 
      doc: _doc, 
      getDoc: _getDoc, 
      getDocs: _getDocs, 
      setDoc: _setDoc, 
      updateDoc: _updateDoc, 
      deleteDoc: _deleteDoc, 
      query: _query, 
      where: _where, 
      orderBy: _orderBy,
      limit: _limit,
      writeBatch: _writeBatch,
      serverTimestamp: _serverTimestamp,
      onSnapshot: _onSnapshot
    } = await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Auto-authenticate anonymously if not signed in, enabling immediate Firestore permissions
    try {
      if (!auth.currentUser && _signInAnonymously) {
        _signInAnonymously(auth).catch(e => console.log("Firebase Auth notice:", e.message));
      }
    } catch (authErr) {}

    _firestoreSdk = {
      collection: _collection,
      doc: _doc,
      getDoc: _getDoc,
      getDocs: _getDocs,
      setDoc: _setDoc,
      updateDoc: _updateDoc,
      deleteDoc: _deleteDoc,
      query: _query,
      where: _where,
      orderBy: _orderBy,
      limit: _limit,
      writeBatch: _writeBatch,
      serverTimestamp: _serverTimestamp,
      onSnapshot: _onSnapshot
    };

    _authSdk = {
      onAuthStateChanged: _onAuthStateChanged,
      signInWithEmailAndPassword: _signInWithEmailAndPassword,
      signOut: _signOut
    };

    // Setup Real-time Live Synchronization Streams across all devices
    try {
      // 1. Students Live Sync
      const studentsColl = _collection(db, "students");
      _onSnapshot(studentsColl, (snapshot) => {
        if (!snapshot.empty) {
          const liveList = snapshot.docs.map(d => ({ studentId: d.id, ...d.data() }));
          localStorage.setItem("church_attendance_students", JSON.stringify(liveList));
          window.dispatchEvent(new CustomEvent("church_students_updated", { detail: liveList }));
          console.log(`🔄 [Realtime Cloud Sync] Synchronized ${liveList.length} students from cloud across all devices!`);
        }
      }, (err) => console.log("Students sync listener notice:", err.message));

      // 2. Attendance Records Live Sync
      const attendanceColl = _collection(db, "attendance");
      _onSnapshot(attendanceColl, (snapshot) => {
        if (!snapshot.empty) {
          const liveRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          localStorage.setItem("church_attendance_records", JSON.stringify(liveRecords));
          window.dispatchEvent(new CustomEvent("church_attendance_updated", { detail: liveRecords }));
          console.log(`🔄 [Realtime Cloud Sync] Synchronized ${liveRecords.length} attendance records across all devices!`);
        }
      }, (err) => console.log("Attendance sync listener notice:", err.message));
    } catch (syncErr) {
      console.warn("Realtime stream listener notice:", syncErr.message);
    }

    console.log("🔥 Firebase Cloud Initialized Successfully with Realtime Synchronization for: qrcode-bbb68");
  } catch (err) {
    console.warn("⚠️ Running in resilient local storage fallback mode:", err.message);
    setDemoModeState(true);
  }
}

// Start cloud initialization in background (Non-blocking)
if (typeof window !== 'undefined') {
  initFirebaseCloud();
}

/* ==========================================================================
   Resilient CRUD & Query Bridge (Seamless Cloud + Instant Local Fallback)
   ========================================================================== */

export function collection(database, collectionName) {
  if (db && _firestoreSdk) {
    try { return _firestoreSdk.collection(db, collectionName); } catch (e) {}
  }
  return { collection: collectionName };
}

export function doc(database, collectionName, docId) {
  if (db && _firestoreSdk && typeof collectionName === 'string' && docId) {
    try { return _firestoreSdk.doc(db, collectionName, docId); } catch (e) {}
  }
  return { collection: collectionName, id: docId };
}

export async function getDoc(docRef) {
  const collName = docRef.collection || docRef.parent?.id || "records";
  const docId = docRef.id;

  // 1. Try Live Firestore
  if (db && _firestoreSdk) {
    try {
      const realDoc = _firestoreSdk.doc(db, collName, docId);
      const snap = await _firestoreSdk.getDoc(realDoc);
      if (snap.exists()) {
        return {
          exists: () => true,
          data: () => snap.data(),
          id: snap.id
        };
      }
    } catch (e) {}
  }

  // 2. Local Fallback
  const collectionKey = `church_attendance_${collName}`;
  const data = JSON.parse(safeGetLocalStorage(collectionKey) || "[]");
  const found = Array.isArray(data) 
    ? data.find(item => item.id === docId || item.studentId === docId) 
    : data[docId];

  return {
    exists: () => Boolean(found),
    data: () => found || null,
    id: docId
  };
}

export async function getDocs(queryObj) {
  const collName = queryObj.collection || queryObj._query?.path?.segments?.[0] || "students";

  // 1. Try Live Firestore
  if (db && _firestoreSdk) {
    try {
      const collRef = _firestoreSdk.collection(db, collName);
      const snap = await _firestoreSdk.getDocs(collRef);
      if (!snap.empty) {
        return {
          empty: false,
          size: snap.size,
          docs: snap.docs.map(d => ({ id: d.id, data: () => d.data() })),
          forEach: (cb) => snap.docs.forEach(d => cb({ id: d.id, data: () => d.data() }))
        };
      }
    } catch (e) {}
  }

  // 2. Local Fallback
  const collectionKey = `church_attendance_${collName}`;
  const items = JSON.parse(safeGetLocalStorage(collectionKey) || "[]");
  const docs = (Array.isArray(items) ? items : Object.values(items)).map(item => ({
    id: item.id || item.studentId,
    data: () => item
  }));

  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (cb) => docs.forEach(cb)
  };
}

export async function setDoc(docRef, data, options = { merge: true }) {
  const collName = docRef.collection || docRef.parent?.id || "records";
  const docId = docRef.id;

  // 1. Save to Local Persistence Immediately (0ms)
  const collectionKey = `church_attendance_${collName}`;
  let items = JSON.parse(safeGetLocalStorage(collectionKey) || "[]");
  const itemData = { ...data, id: docId };
  if (Array.isArray(items)) {
    const idx = items.findIndex(item => item.id === docId || item.studentId === docId);
    if (idx >= 0) items[idx] = itemData;
    else items.unshift(itemData);
  } else {
    items[docId] = itemData;
  }
  safeSetLocalStorage(collectionKey, JSON.stringify(items));

  // 2. Sync to Live Firestore in Background (Non-blocking)
  if (db && _firestoreSdk) {
    try {
      const realDoc = _firestoreSdk.doc(db, collName, docId);
      const cleanData = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) cleanData[k] = v;
      }
      cleanData.id = docId;
      _firestoreSdk.setDoc(realDoc, cleanData, options)
        .then(() => console.log(`☁️ Synced document [${docId}] to Firestore collection [${collName}]`))
        .catch(err => console.warn(`Firestore sync note for [${docId}]:`, err.message));
    } catch (err) {}
  }
  return true;
}

export async function updateDoc(docRef, updates) {
  const collName = docRef.collection || docRef.parent?.id || "records";
  const docId = docRef.id;

  const collectionKey = `church_attendance_${collName}`;
  let items = JSON.parse(safeGetLocalStorage(collectionKey) || "[]");
  if (Array.isArray(items)) {
    const idx = items.findIndex(item => item.id === docId || item.studentId === docId);
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...updates };
      safeSetLocalStorage(collectionKey, JSON.stringify(items));
    }
  }

  if (db && _firestoreSdk) {
    try {
      const realDoc = _firestoreSdk.doc(db, collName, docId);
      const cleanUpdates = {};
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) cleanUpdates[k] = v;
      }
      _firestoreSdk.updateDoc(realDoc, cleanUpdates).catch(() => {});
    } catch (e) {}
  }
  return true;
}

export async function deleteDoc(docRef) {
  const collName = docRef.collection || docRef.parent?.id || "records";
  const docId = docRef.id;

  const collectionKey = `church_attendance_${collName}`;
  let items = JSON.parse(safeGetLocalStorage(collectionKey) || "[]");
  if (Array.isArray(items)) {
    items = items.filter(item => item.id !== docId && item.studentId !== docId);
    safeSetLocalStorage(collectionKey, JSON.stringify(items));
  }

  if (db && _firestoreSdk) {
    try {
      const realDoc = _firestoreSdk.doc(db, collName, docId);
      _firestoreSdk.deleteDoc(realDoc).catch(() => {});
    } catch (e) {}
  }
  return true;
}

export function query(collectionRef, ...constraints) {
  if (db && _firestoreSdk && collectionRef) {
    try { return _firestoreSdk.query(collectionRef, ...constraints); } catch (e) {}
  }
  return { collection: collectionRef.collection || "records", constraints };
}

export function where(field, op, val) {
  if (_firestoreSdk) {
    try { return _firestoreSdk.where(field, op, val); } catch (e) {}
  }
  return { type: "where", field, op, val };
}

export function orderBy(field, dir = "asc") {
  if (_firestoreSdk) {
    try { return _firestoreSdk.orderBy(field, dir); } catch (e) {}
  }
  return { type: "orderBy", field, dir };
}

export function limit(count) {
  if (_firestoreSdk?.limit) {
    try { return _firestoreSdk.limit(count); } catch (e) {}
  }
  return { type: "limit", count };
}

export function writeBatch(database) {
  if (db && _firestoreSdk) {
    try { return _firestoreSdk.writeBatch(db); } catch (e) {}
  }
  return {
    set: (docRef, data) => setDoc(docRef, data),
    update: (docRef, data) => updateDoc(docRef, data),
    delete: (docRef) => deleteDoc(docRef),
    commit: async () => true
  };
}

export function onSnapshot(targetRef, onNext, onError) {
  if (db && _firestoreSdk && targetRef) {
    try {
      return _firestoreSdk.onSnapshot(targetRef, onNext, onError);
    } catch (e) {}
  }
  return () => {};
}

export function serverTimestamp() {
  if (_firestoreSdk) {
    try { return _firestoreSdk.serverTimestamp(); } catch (e) {}
  }
  return new Date().toISOString();
}

export function onAuthStateChanged(authInstance, callback) {
  if (_authSdk && authInstance) {
    return _authSdk.onAuthStateChanged(authInstance, callback);
  }
  // Immediately invoke with default admin
  callback({ uid: "admin-01", email: "admin@marinachurch.org", displayName: "خادم كنيسة مارمينا" });
  return () => {};
}

export async function signInWithEmailAndPassword(authInstance, email, password) {
  if (_authSdk && authInstance) {
    return _authSdk.signInWithEmailAndPassword(authInstance, email, password);
  }
  return { user: { email, uid: "admin-01" } };
}

export async function signOut(authInstance) {
  if (_authSdk && authInstance) {
    return _authSdk.signOut(authInstance);
  }
  return true;
}

function safeGetLocalStorage(key) {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch (e) {}
  return null;
}

function safeSetLocalStorage(key, val) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, val);
  } catch (e) {}
}
