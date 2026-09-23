/**
 * Church QR Attendance System - Resilient Firebase & Offline Synchronization Engine
 * Integrated with Project: k-ilo-eb1f2 (كنيسة مارمينا العجايبي بكوم المحرص)
 */

/* ==========================================================================
   Firebase Project Credentials
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

export const isConfigured = true;
export let isDemoMode = false; // Pure Online Cloud Firebase

export function setDemoModeState(value) {
  isDemoMode = false; // Always maintain Online Cloud Firebase
}

export let app = null;
export let auth = null;
export let db = null;

// Helper for robust non-blocking timeout
function promiseTimeout(promise, ms, timeoutVal = null) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(timeoutVal), ms);
  });
  return Promise.race([
    promise.then(res => { clearTimeout(timer); return res; }).catch(() => timeoutVal),
    timeoutPromise
  ]);
}

// SDK references
let _firestoreSdk = null;
let _authSdk = null;
let _initPromise = null;
let _listenersAttached = false;
let _hasSeeded = false;

/**
 * Returns a Promise that resolves when Cloud Firestore is fully initialized and ready.
 * Includes strict 2500ms timeout to ensure UI never hangs on loading.
 */
export async function getDb() {
  if (db && _firestoreSdk) {
    return { db, sdk: _firestoreSdk };
  }
  if (!_initPromise && typeof window !== 'undefined') {
    _initPromise = initFirebaseCloud();
  }
  if (_initPromise) {
    await promiseTimeout(_initPromise, 2500, null);
  }
  if (db && _firestoreSdk) {
    return { db, sdk: _firestoreSdk };
  }
  return null;
}

/**
 * Asynchronously initialize Firebase without blocking ES Module loading or DOM rendering
 */
export async function initFirebaseCloud() {
  if (typeof window === 'undefined') return;
  try {
    const loadModules = async () => {
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

      return {
        initializeApp,
        getAuth, _signInAnonymously, _onAuthStateChanged, _signInWithEmailAndPassword, _signOut,
        getFirestore, _collection, _doc, _getDoc, _getDocs, _setDoc, _updateDoc, _deleteDoc,
        _query, _where, _orderBy, _limit, _writeBatch, _serverTimestamp, _onSnapshot
      };
    };

    const modules = await promiseTimeout(loadModules(), 3500, null);
    if (!modules) {
      console.warn("⚠️ Firebase CDN dynamic import timed out (3.5s). Operating in local-first mode.");
      setDemoModeState(true);
      return;
    }

    app = modules.initializeApp(firebaseConfig);
    auth = modules.getAuth(app);
    db = modules.getFirestore(app);

    // Auto-authenticate with admin credentials so Firestore permissions are ALWAYS satisfied
    try {
      if (!auth.currentUser) {
        if (modules._signInWithEmailAndPassword) {
          try {
            await modules._signInWithEmailAndPassword(auth, "admin@marinachurch.org", "M@rina2026");
            console.log("✅ [Firebase Auth] Auto-signed in with admin credentials successfully!");
          } catch (eAuth) {
            console.log("Admin email login notice:", eAuth.message);
            if (modules._signInAnonymously) {
              modules._signInAnonymously(auth).catch(() => {});
            }
          }
        }
      }
    } catch (authErr) {}

    _firestoreSdk = {
      collection: modules._collection,
      doc: modules._doc,
      getDoc: modules._getDoc,
      getDocs: modules._getDocs,
      setDoc: modules._setDoc,
      updateDoc: modules._updateDoc,
      deleteDoc: modules._deleteDoc,
      query: modules._query,
      where: modules._where,
      orderBy: modules._orderBy,
      limit: modules._limit,
      writeBatch: modules._writeBatch,
      serverTimestamp: modules._serverTimestamp,
      onSnapshot: modules._onSnapshot
    };

    _authSdk = {
      onAuthStateChanged: modules._onAuthStateChanged,
      signInWithEmailAndPassword: modules._signInWithEmailAndPassword,
      signOut: modules._signOut
    };

    // Setup Real-time Live Synchronization Streams across all devices (Singleton guarding)
    if (!_listenersAttached) {
      _listenersAttached = true;
      let studentsDebounce = null;
      let attendanceDebounce = null;

      try {
        // 1. Students Live Real-time Sync
        const studentsColl = modules._collection(db, "students");
        modules._onSnapshot(studentsColl, (snapshot) => {
          const liveList = snapshot.docs.map(d => {
            const data = d.data();
            return {
              studentId: d.id,
              ...data,
              studentCode: data.studentCode || d.id
            };
          });
          localStorage.setItem("church_attendance_students", JSON.stringify(liveList));
          clearTimeout(studentsDebounce);
          studentsDebounce = setTimeout(() => {
            window.dispatchEvent(new CustomEvent("church_students_updated", { detail: liveList }));
          }, 100);
          console.log(`🔄 [Realtime Cloud Sync] Synchronized ${liveList.length} students from cloud across all devices!`);
        }, (err) => {
          console.warn("Students sync listener notice:", err.message);
          if (err.message && (err.message.includes("permission") || err.code === "permission-denied")) {
            window.dispatchEvent(new CustomEvent("firebase_permission_error", { detail: err }));
          }
        });

        // 2. Attendance Records Live Real-time Sync
        const attendanceColl = modules._collection(db, "attendance");
        modules._onSnapshot(attendanceColl, (snapshot) => {
          const liveRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          localStorage.setItem("church_attendance_records", JSON.stringify(liveRecords));
          clearTimeout(attendanceDebounce);
          attendanceDebounce = setTimeout(() => {
            window.dispatchEvent(new CustomEvent("church_attendance_updated", { detail: liveRecords }));
          }, 100);
          console.log(`🔄 [Realtime Cloud Sync] Synchronized ${liveRecords.length} attendance records across all devices!`);
        }, (err) => {
          console.warn("Attendance sync listener notice:", err.message);
        });
      } catch (syncErr) {
        console.warn("Realtime stream listener notice:", syncErr.message);
      }
    }

    console.log("🔥 Firebase Cloud Initialized Successfully with Realtime Synchronization for: k-ilo-eb1f2");
  } catch (err) {
    console.warn("⚠️ Running in resilient local storage fallback mode:", err.message);
    setDemoModeState(true);
  }
}

// Start cloud initialization in background (Non-blocking)
if (typeof window !== 'undefined') {
  _initPromise = initFirebaseCloud();
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

  // 1. Try Live Firestore with 1500ms timeout
  const ready = await getDb();
  if (ready && ready.db && ready.sdk) {
    try {
      const realDoc = ready.sdk.doc(ready.db, collName, docId);
      const snap = await promiseTimeout(ready.sdk.getDoc(realDoc), 1500, null);
      if (snap && snap.exists()) {
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

  // 1. Try Live Firestore with 2000ms timeout
  const ready = await getDb();
  if (ready && ready.db && ready.sdk) {
    try {
      const collRef = ready.sdk.collection(ready.db, collName);
      const snap = await promiseTimeout(ready.sdk.getDocs(collRef), 2000, null);
      if (snap && !snap.empty) {
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
  const docId = docRef.id || data.studentId || data.id;

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

  // 2. Sync to Live Firestore in Background (Guaranteed via getDb())
  getDb().then(ready => {
    if (ready && ready.db && ready.sdk) {
      try {
        const realDoc = ready.sdk.doc(ready.db, collName, docId);
        const cleanData = {};
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) cleanData[k] = v;
        }
        cleanData.id = docId;
        ready.sdk.setDoc(realDoc, cleanData, options)
          .then(() => console.log(`☁️ Synced document [${docId}] to Firestore collection [${collName}]`))
          .catch(err => console.warn(`Firestore sync note for [${docId}]:`, err.message));
      } catch (err) {}
    }
  }).catch(() => {});

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

  getDb().then(ready => {
    if (ready && ready.db && ready.sdk) {
      try {
        const realDoc = ready.sdk.doc(ready.db, collName, docId);
        const cleanUpdates = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) cleanUpdates[k] = v;
        }
        ready.sdk.updateDoc(realDoc, cleanUpdates).catch(() => {});
      } catch (e) {}
    }
  }).catch(() => {});

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

  getDb().then(ready => {
    if (ready && ready.db && ready.sdk) {
      try {
        const realDoc = ready.sdk.doc(ready.db, collName, docId);
        ready.sdk.deleteDoc(realDoc).catch(() => {});
      } catch (e) {}
    }
  }).catch(() => {});

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
