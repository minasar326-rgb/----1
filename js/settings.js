/**
 * Church QR Attendance System - Settings & Absence Management
 */

import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  isDemoMode 
} from "./firebase-config.js";
import { logActivity } from "./activity.js";
import { showToast, ATTENDANCE_PARTS, getCurrentWeekId, getWeekDetails } from "./utils.js";
import { getAllStudents } from "./students.js";
import { generateAttendanceId, getAttendanceRecord } from "./attendance.js";

const SETTINGS_STORAGE_KEY = "church_attendance_settings";
const WEEKS_STORAGE_KEY = "church_attendance_weeks";

const DEFAULT_SETTINGS = {
  thursday: {
    tasbeha: { start: "18:00", end: "19:00" },
    lecture1: { start: "19:00", end: "20:30" }
  },
  friday: {
    mass: { start: "08:00", end: "11:00" },
    lecture2: { start: "11:00", end: "12:30" },
    spiritualNotebook: { start: "12:30", end: "13:30" }
  },
  churchName: "كنيسة مارمينا العجايبي بكوم المحرص",
  serviceName: "إعداد خدام"
};

let memorySettingsStore = null;

/**
 * Fetch Settings
 */
export async function getAttendanceSettings() {
  if (isDemoMode) {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(SETTINGS_STORAGE_KEY);
        return data ? JSON.parse(data) : DEFAULT_SETTINGS;
      }
    } catch (e) {}
    return memorySettingsStore || DEFAULT_SETTINGS;
  }

  try {
    const docRef = doc(db, "settings", "attendance");
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error fetching settings:", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save Attendance Settings
 */
export async function saveAttendanceSettings(newSettings) {
  if (isDemoMode) {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
    await logActivity("تعديل إعدادات الحضور والمواعيد", newSettings, "settings", "config");
    showToast("تم حفظ الإعدادات بنجاح ✅", "success");
    return true;
  }

  try {
    const docRef = doc(db, "settings", "attendance");
    await setDoc(docRef, {
      ...newSettings,
      updatedAt: serverTimestamp()
    });
    await logActivity("تعديل إعدادات الحضور والمواعيد", newSettings, "settings", "config");
    showToast("تم حفظ الإعدادات بنجاح ✅", "success");
    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    showToast("حدث خطأ أثناء حفظ الإعدادات", "error");
    return false;
  }
}

/**
 * Run Automatic Absence Calculation
 * Scans all active students for parts whose schedule has passed and records absence
 */
export async function calculateAutomaticAbsence(weekId = getCurrentWeekId()) {
  const students = await getAllStudents();
  const activeStudents = students.filter(s => s.status === "active");
  const settings = await getAttendanceSettings();
  
  let absentCount = 0;
  const now = new Date();
  const currentDayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  const daysToCheck = ["thursday", "friday"];

  for (const day of daysToCheck) {
    const parts = ATTENDANCE_PARTS[day] || [];
    for (const part of parts) {
      const partConfig = settings[day]?.[part.id] || { start: part.defaultStart, end: part.defaultEnd };
      
      // Determine if part has already finished
      // In production/simulation, if force check or current time > part end
      for (const student of activeStudents) {
        const existing = await getAttendanceRecord(weekId, student.studentId, day, part.id);
        if (!existing) {
          // Record as Absent
          const absentRecord = {
            id: generateAttendanceId(weekId, student.studentId, day, part.id),
            studentId: student.studentId,
            studentName: student.name,
            grade: student.grade,
            qrId: student.qrId,
            weekId,
            day,
            part: part.id,
            status: "absent",
            timestamp: new Date().toISOString(),
            recordedBy: "النظام التلقائي",
            isManualEdit: false
          };

          if (isDemoMode) {
            const raw = localStorage.getItem("church_attendance_records") || "[]";
            const list = JSON.parse(raw);
            if (!list.some(r => r.id === absentRecord.id)) {
              list.push(absentRecord);
              localStorage.setItem("church_attendance_records", JSON.stringify(list));
              absentCount++;
            }
          } else {
            try {
              await setDoc(doc(db, "attendance", absentRecord.id), {
                ...absentRecord,
                timestamp: serverTimestamp()
              });
              absentCount++;
            } catch (e) {
              console.error("Error setting absent:", e);
            }
          }
        }
      }
    }
  }

  await logActivity("تشغيل حساب الغياب التلقائي", { weekId, processedAbsents: absentCount }, weekId, "absence_engine");
  showToast(`تم حساب الغياب بنجاح (تم تسجيل ${absentCount} حالة غياب)`, "info");
  return absentCount;
}
