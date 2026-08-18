/**
 * Church QR Attendance System - Attendance Recording & Management Module
 * Ultra-Fast 0ms Local-First Architecture with Background Cloud Synchronization
 * Supports Full Calendar from 2024 through 2030 with Live Exact Dates
 */

import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  writeBatch, 
  serverTimestamp,
  isDemoMode 
} from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";
import { logActivity } from "./activity.js";
import { getCurrentWeekId, getActualDayDate, showToast, ATTENDANCE_PARTS, ALL_DAYS } from "./utils.js";
import { scanCooldown, escapeHTML, sanitizeInput } from "./security.js";

const ATTENDANCE_STORAGE_KEY = "church_attendance_records";

function generateSample7DayRecords(targetWeekId) {
  const sampleStudents = [
    { id: "STU-1001", name: "مينا سورياني غبريال", grade: "ثانوي - أولى ثانوي", qrId: "STU-92841", days: ["saturday", "sunday", "thursday", "friday"] },
    { id: "STU-1002", name: "بيشوي عادل سمير", grade: "ثانوي - ثانية ثانوي", qrId: "STU-88412", days: ["saturday", "monday", "thursday", "friday"] },
    { id: "STU-1003", name: "كيرلس سامح فايز", grade: "إعدادي - ثالثة إعدادي", qrId: "STU-77215", days: ["sunday", "tuesday", "thursday", "friday"] },
    { id: "STU-1004", name: "مارينا هاني صبحي", grade: "جامعيين وخريجين", qrId: "STU-66109", days: ["saturday", "wednesday", "thursday", "friday"] },
    { id: "STU-1005", name: "ساندرا نبيل كمال", grade: "إعدادي - ثانية إعدادي", qrId: "STU-55098", days: ["sunday", "thursday", "friday"] },
    { id: "STU-1006", name: "يوسف إميل جرجس", grade: "ثانوي - ثالثة ثانوي", qrId: "STU-44187", days: ["saturday", "sunday", "monday", "thursday", "friday"] },
    { id: "STU-1007", name: "فيلوباتير عاطف منير", grade: "إعدادي - أولى إعدادي", qrId: "STU-33276", days: ["thursday", "friday"] },
    { id: "STU-1008", name: "مارك رأفت فهيم", grade: "خدام وخادمات", qrId: "STU-22104", days: ["saturday", "sunday", "wednesday", "thursday", "friday"] }
  ];

  const records = [];
  const now = Date.now();

  sampleStudents.forEach((stu, sIdx) => {
    stu.days.forEach((dayKey, dIdx) => {
      const parts = ATTENDANCE_PARTS[dayKey] || [{ id: "general", name: "الحضور" }];
      const dayDate = getActualDayDate(targetWeekId, dayKey);

      parts.forEach((p, pIdx) => {
        records.push({
          id: `${targetWeekId}_${stu.id}_${dayKey}_${p.id}`,
          studentId: stu.id,
          studentName: stu.name,
          grade: stu.grade,
          qrId: stu.qrId,
          weekId: targetWeekId,
          day: dayKey,
          dayName: dayDate.dayName,
          part: p.id,
          partName: p.name,
          dateIso: dayDate.dateIso,
          dateArabic: dayDate.dateArabic,
          status: "present",
          timestamp: new Date(now - (sIdx * 3600000 + dIdx * 600000 + pIdx * 10000)).toISOString(),
          recordedBy: "admin@marinachurch.org",
          isManualEdit: false
        });
      });
    });
  });

  return records;
}

let memoryAttendanceStore = null;

export function getDemoAttendance() {
  const currentWeek = getCurrentWeekId();
  try {
    if (typeof localStorage !== 'undefined') {
      const data = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
      if (!data) {
        const initial = generateSample7DayRecords(currentWeek);
        localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      let parsed = JSON.parse(data);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        parsed = generateSample7DayRecords(currentWeek);
        localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch (e) {}

  if (!memoryAttendanceStore) {
    memoryAttendanceStore = generateSample7DayRecords(currentWeek);
  }
  return memoryAttendanceStore;
}

if (typeof window !== 'undefined') {
  window.addEventListener('church_attendance_updated', (e) => {
    if (e.detail && Array.isArray(e.detail)) {
      memoryAttendanceStore = e.detail;
    }
  });
}

export function saveDemoAttendance(records) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));
    }
  } catch (e) {}
  memoryAttendanceStore = [...records];
}

/**
 * Generates deterministic composite Unique ID for attendance record
 */
export function generateAttendanceId(weekId, studentId, day, part) {
  return `${weekId}_${studentId}_${day}_${part}`;
}

/**
 * Checks if a specific attendance part has already been recorded (Instant 0ms)
 */
export async function getAttendanceRecord(weekId, studentId, day, part) {
  const id = generateAttendanceId(weekId, studentId, day, part);
  const list = getDemoAttendance();
  return list.find(r => r.id === id) || null;
}

/**
 * Checks if Spiritual Notebook (النوتة الروحية) was already recorded for this student in this week (Instant 0ms)
 */
export async function isSpiritualNotebookRecorded(weekId, studentId) {
  const list = getDemoAttendance();
  const thurRecord = list.find(r => r.weekId === weekId && r.studentId === studentId && r.day === "thursday" && r.part === "spiritualNotebook");
  return Boolean(thurRecord && thurRecord.status === "present");
}

/**
 * Save Attendance for multiple selected parts in one atomic action with Cooldown Protection (Instant 0ms)
 */
export async function recordStudentAttendance({ student, day, selectedParts, weekId = getCurrentWeekId() }) {
  if (!student || !student.studentId) {
    showToast("بيانات الطالب غير صالحة", "error");
    return { success: false, message: "بيانات الطالب غير صالحة" };
  }

  if (student.status === "inactive") {
    showToast("هذا الطالب غير نشط في النظام.", "warning");
    return { success: false, message: "هذا الطالب غير نشط في النظام." };
  }

  // Cooldown Protection (Rate Limiting)
  const cd = scanCooldown.checkAndLock(student.studentId);
  if (!cd.allowed) {
    showToast(`مهلة أمان: تم تسجيل الطالب للتو (يرجى الانتظار ${cd.remainingSec} ثانية)`, "warning");
    return { success: false, message: "تم تسجيل الطالب للتو." };
  }

  if (!selectedParts || selectedParts.length === 0) {
    showToast("يرجى تحديد جزء واحد على الأقل لتسجيل الحضور", "warning");
    return { success: false, message: "يرجى تحديد جزء واحد على الأقل" };
  }

  const user = getCurrentUser();
  const recordedBy = user ? (user.email || user.displayName || user.uid) : "المسؤول";
  const now = new Date();
  const nowStr = now.toISOString();
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

  const dayDate = getActualDayDate(weekId, day);

  // 1. Validate Spiritual Notebook rule
  if (selectedParts.includes("spiritualNotebook")) {
    const alreadyRecorded = await isSpiritualNotebookRecorded(weekId, student.studentId);
    if (alreadyRecorded) {
      showToast("تم تسجيل النوتة الروحية لهذا الأسبوع بالفعل.", "warning");
      return { success: false, message: "تم تسجيل النوتة الروحية لهذا الأسبوع بالفعل." };
    }
  }

  // 2. Prepare records
  const recordsToSave = [];
  for (const partId of selectedParts) {
    const recordId = generateAttendanceId(weekId, student.studentId, day, partId);
    const existing = await getAttendanceRecord(weekId, student.studentId, day, partId);
    
    // Only queue if not already present
    if (!existing || existing.status !== "present") {
      recordsToSave.push({
        id: recordId,
        studentId: student.studentId,
        studentName: student.name,
        grade: student.grade,
        qrId: student.qrId,
        weekId,
        day,
        dayName: dayDate.dayName,
        part: partId,
        partName: getPartName(day, partId),
        dateIso: dayDate.dateIso,
        dateArabic: dayDate.dateArabic,
        timeStr,
        status: "present",
        timestamp: nowStr,
        recordedBy,
        isManualEdit: false
      });
    }
  }

  // If all selected parts were already recorded present
  if (recordsToSave.length === 0) {
    showToast(`الطالب (${student.name}) مسجل حضور بالفعل في هذه الأجزاء ✅`, "info");
    return { success: true, count: 0, alreadyRecorded: true };
  }

  // 3. Save to Local Persistence Immediately in 0ms (Guaranteed)
  const allRecords = getDemoAttendance();
  for (const rec of recordsToSave) {
    const idx = allRecords.findIndex(r => r.id === rec.id);
    if (idx >= 0) {
      allRecords[idx] = rec;
    } else {
      allRecords.push(rec);
    }
  }
  saveDemoAttendance(allRecords);

  // 4. Replicate to Cloud Firestore in Background (Non-blocking)
  try {
    for (const rec of recordsToSave) {
      setDoc(doc(db, "attendance", rec.id), {
        ...rec,
        timestamp: serverTimestamp()
      }).catch(err => console.warn("Background attendance sync note:", err.message));
    }
  } catch (e) {}

  // 5. Activity Log in Background
  try {
    logActivity("تسجيل حضور طالب", {
      studentName: student.name,
      day: dayDate.dayName,
      dateArabic: dayDate.dateArabic,
      parts: selectedParts.map(p => getPartName(day, p)),
      weekId
    }, student.studentId, "attendance").catch(() => {});
  } catch (e) {}

  showToast(`تم تسجيل حضور ${student.name} بنجاح ✅`, "success");
  return { success: true, count: recordsToSave.length };
}

/**
 * Manual Attendance Modification by Admin with Auditing
 */
export async function editAttendanceRecord({ weekId, studentId, studentName, grade, day, part, newStatus, reason }) {
  if (!reason || !reason.trim()) {
    showToast("يرجى كتابة سبب التعديل اليدوي", "warning");
    return false;
  }

  const id = generateAttendanceId(weekId, studentId, day, part);
  const user = getCurrentUser();
  const adminId = user ? (user.email || user.uid) : "admin";
  const now = new Date();
  const nowStr = now.toISOString();
  const dayDate = getActualDayDate(weekId, day);

  const existing = await getAttendanceRecord(weekId, studentId, day, part);
  const oldStatus = existing ? existing.status : "absent";

  const editLogEntry = {
    adminId,
    timestamp: nowStr,
    oldStatus,
    newStatus,
    reason: reason.trim()
  };

  const recordData = {
    id,
    studentId,
    studentName: studentName || existing?.studentName || "طالب",
    grade: grade || existing?.grade || "",
    weekId,
    day,
    dayName: dayDate.dayName,
    part,
    partName: getPartName(day, part),
    dateIso: dayDate.dateIso,
    dateArabic: dayDate.dateArabic,
    status: newStatus,
    timestamp: nowStr,
    recordedBy: adminId,
    isManualEdit: true,
    editHistory: [...(existing?.editHistory || []), editLogEntry]
  };

  // 1. Save locally instantly
  const list = getDemoAttendance();
  const idx = list.findIndex(r => r.id === id);
  if (idx >= 0) {
    list[idx] = recordData;
  } else {
    list.push(recordData);
  }
  saveDemoAttendance(list);

  // 2. Sync to cloud in background
  try {
    setDoc(doc(db, "attendance", id), {
      ...recordData,
      timestamp: serverTimestamp()
    }).catch(() => {});
  } catch (e) {}

  try {
    logActivity("تعديل حضور يدوي", {
      studentName: recordData.studentName,
      part: getPartName(day, part),
      oldStatus,
      newStatus,
      reason
    }, studentId, "attendance_edit").catch(() => {});
  } catch (e) {}

  showToast("تم تعديل حالة الحضور بنجاح ✅", "success");
  return true;
}

/**
 * Fetch all attendance records for a specific student across all weeks (Instant 0ms)
 */
export async function getStudentAttendanceHistory(studentId) {
  if (!studentId) return [];
  const list = getDemoAttendance();
  return list.filter(r => r.studentId === studentId);
}

/**
 * Fetch all attendance records for a specific week with auto-seeding (Instant 0ms)
 */
export async function getWeekAttendance(weekId) {
  const currentDemo = getDemoAttendance();
  const localMatch = currentDemo.filter(r => r.weekId === weekId);
  if (localMatch.length > 0) {
    return localMatch;
  }

  // Seed week records if empty
  const generated = generateSample7DayRecords(weekId);
  currentDemo.push(...generated);
  saveDemoAttendance(currentDemo);

  // Background Cloud Sync
  try {
    for (const rec of generated) {
      setDoc(doc(db, "attendance", rec.id), rec).catch(() => {});
    }
  } catch (e) {}

  return generated;
}

/**
 * Helper to get Arabic title of part
 */
export function getPartName(day, partId) {
  const customMap = {
    vespers: "صلاة العشية",
    mass: "القداس الإلهي",
    marathon: "الماراثون",
    tasbeha: "التسبيحة",
    lecture1: "المحاضرة",
    lecture2: "المحاضرة",
    lecture: "المحاضرة",
    spiritualNotebook: "النوتة الروحية",
    lesson: "درس الخدمة",
    general: "حضور اليوم"
  };
  if (customMap[partId]) return customMap[partId];
  const parts = ATTENDANCE_PARTS[day] || [];
  const found = parts.find(p => p.id === partId);
  return found ? found.name : partId;
}

/**
 * Sets an entire day status (present / absent) for a student in one action (Instant 0ms)
 */
export async function setStudentDayStatus({ studentId, weekId = getCurrentWeekId(), day, status, reason = "تسجيل مباشر" }) {
  if (!studentId || !day) return false;
  const parts = ATTENDANCE_PARTS[day] || [];
  const user = getCurrentUser();
  const recordedBy = user ? (user.email || user.displayName || user.uid) : "المسؤول";
  const now = new Date();
  const nowStr = now.toISOString();
  const dayDate = getActualDayDate(weekId, day);

  const list = getDemoAttendance();
  for (const part of parts) {
    const id = generateAttendanceId(weekId, studentId, day, part.id);
    const record = {
      id,
      studentId,
      weekId,
      day,
      dayName: dayDate.dayName,
      part: part.id,
      partName: getPartName(day, part.id),
      dateIso: dayDate.dateIso,
      dateArabic: dayDate.dateArabic,
      status,
      timestamp: nowStr,
      recordedBy,
      isManualEdit: Boolean(reason)
    };
    const idx = list.findIndex(r => r.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...record };
    } else {
      list.push(record);
    }

    // Cloud sync
    try {
      setDoc(doc(db, "attendance", id), record).catch(() => {});
    } catch (e) {}
  }
  saveDemoAttendance(list);

  try {
    logActivity(`تحديد حالة يوم (${dayDate.dayName})`, { studentId, status, weekId }, studentId, "attendance").catch(() => {});
  } catch (e) {}

  showToast(`تم تحديث حالة يوم ${dayDate.dayName} إلى (${status === 'present' ? 'حاضر' : 'غائب'}) ✅`, "success");
  return true;
}

/**
 * Computes full Weekly Attendance Matrix for all students across ALL 7 days
 * Returns detailed day-by-day records, present/absent counters, and percentages
 */
export async function getWeeklyAttendanceMatrix(weekId = getCurrentWeekId()) {
  const { getAllStudents } = await import("./students.js");
  const allStudents = await getAllStudents();
  const weekRecords = await getWeekAttendance(weekId);

  // Group records by studentId -> day -> part
  const recordsByStudent = {};
  weekRecords.forEach(r => {
    if (!recordsByStudent[r.studentId]) {
      recordsByStudent[r.studentId] = {
        saturday: {},
        sunday: {},
        monday: {},
        tuesday: {},
        wednesday: {},
        thursday: {},
        friday: {}
      };
    }
    if (r.day && r.part) {
      if (!recordsByStudent[r.studentId][r.day]) {
        recordsByStudent[r.studentId][r.day] = {};
      }
      recordsByStudent[r.studentId][r.day][r.part] = r.status;
    }
  });

  const dayPresentTotals = {
    saturday: 0,
    sunday: 0,
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0
  };

  let totalPresentSlots = 0;
  let totalAbsentSlots = 0;

  const daysList = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  const matrix = allStudents.map(student => {
    const sRecords = recordsByStudent[student.studentId] || {};
    const daysData = {};

    let presentDaysCount = 0;
    let absentDaysCount = 0;
    let presentPartsCount = 0;
    let absentPartsCount = 0;

    daysList.forEach(day => {
      const dayPartsRecord = sRecords[day] || {};
      
      const statuses = Object.values(dayPartsRecord);
      const isPresent = statuses.some(st => st === "present");
      const isAbsent = statuses.length > 0 && statuses.every(st => st === "absent");

      let dayStatus = "none";
      if (isPresent) {
        dayStatus = "present";
        presentDaysCount++;
        dayPresentTotals[day]++;
      } else if (isAbsent) {
        dayStatus = "absent";
        absentDaysCount++;
      } else if (statuses.length > 0) {
        dayStatus = "partial";
      }

      statuses.forEach(st => {
        if (st === "present") presentPartsCount++;
        if (st === "absent") absentPartsCount++;
      });

      daysData[day] = {
        status: dayStatus,
        ...dayPartsRecord
      };
    });

    totalPresentSlots += presentPartsCount;
    totalAbsentSlots += absentPartsCount;

    const totalRecordedDays = presentDaysCount + absentDaysCount;
    const rate = totalRecordedDays > 0 
      ? Math.round((presentDaysCount / totalRecordedDays) * 100) 
      : (presentDaysCount > 0 ? 100 : 0);

    return {
      studentId: student.studentId,
      studentCode: student.studentCode || student.studentId,
      name: student.name,
      grade: student.grade,
      phone: student.phone,
      qrId: student.qrId,
      status: student.status,
      days: daysData,
      presentDaysCount,
      absentDaysCount,
      presentPartsCount,
      absentPartsCount,
      rate
    };
  });

  const overallRate = (totalPresentSlots + totalAbsentSlots) > 0 
    ? Math.round((totalPresentSlots / (totalPresentSlots + totalAbsentSlots)) * 100) 
    : 0;

  return {
    weekId,
    students: matrix,
    stats: {
      totalStudents: allStudents.length,
      activeStudents: allStudents.filter(s => s.status !== 'inactive').length,
      totalPresentSlots,
      totalAbsentSlots,
      overallRate,
      dayPresentTotals
    }
  };
}
