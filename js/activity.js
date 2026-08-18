/**
 * Church QR Attendance System - Activity Logs Management
 */

import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  isDemoMode 
} from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";

const ACTIVITY_STORAGE_KEY = "church_attendance_activity_logs";

let memoryActivityStore = [];

export async function logActivity(action, details = {}, targetId = null, targetType = null) {
  const user = getCurrentUser();
  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    action,
    details,
    targetId,
    targetType,
    adminId: user ? user.uid : "system",
    adminEmail: user ? (user.email || user.displayName) : "النظام",
    timestamp: new Date().toISOString()
  };

  if (isDemoMode) {
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || "[]");
        existing.unshift(logEntry);
        if (existing.length > 200) existing.pop();
        localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(existing));
        return logEntry;
      }
    } catch (e) {}
    memoryActivityStore.unshift(logEntry);
    if (memoryActivityStore.length > 200) memoryActivityStore.pop();
    return logEntry;
  }

  try {
    const logDocRef = doc(collection(db, "activityLogs"), logEntry.id);
    await setDoc(logDocRef, {
      ...logEntry,
      timestamp: serverTimestamp()
    });
    return logEntry;
  } catch (error) {
    console.error("Error logging activity:", error);
    return null;
  }
}

export async function fetchRecentActivities(limitCount = 20) {
  if (isDemoMode) {
    try {
      if (typeof localStorage !== 'undefined') {
        const logs = JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || "[]");
        return logs.slice(0, limitCount);
      }
    } catch (e) {}
    return memoryActivityStore.slice(0, limitCount);
  }

  try {
    const q = query(collection(db, "activityLogs"), orderBy("timestamp", "desc"), limit(limitCount));
    const snapshot = await getDocs(q);
    const logs = [];
    snapshot.forEach(docSnap => {
      logs.push(docSnap.data());
    });
    return logs;
  } catch (error) {
    console.error("Error fetching activities:", error);
    return [];
  }
}
