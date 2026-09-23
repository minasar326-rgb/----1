/**
 * Church QR Attendance System - Ultra-Fast Students Management Module
 * Blazing Fast 0ms Local-First Architecture with Background Cloud Synchronization
 */

import { 
  db, 
  getDb,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  isDemoMode 
} from "./firebase-config.js";
import { showToast, GRADES, STAGES, STAGE_GROUPS, mapLegacyGradeToStage } from "./utils.js";
import { logActivity } from "./activity.js";
import { sanitizeInput, validateName, validateStudentCode, validatePhone, escapeHTML } from "./security.js";

const STUDENTS_STORAGE_KEY = "church_attendance_students";

// Initial Demo Seed Data
const INITIAL_DEMO_STUDENTS = [
  {
    studentId: "STU-1001",
    studentCode: "STU-1001",
    name: "مينا سورياني غبريال",
    stage: "أولى ثانوي",
    grade: "أولى ثانوي",
    phone: "01234567890",
    qrId: "STU-92841",
    status: "active",
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    studentId: "STU-1002",
    studentCode: "STU-1002",
    name: "بيشوي عادل سمير",
    stage: "تانية ثانوي",
    grade: "تانية ثانوي",
    phone: "01098765432",
    qrId: "STU-88412",
    status: "active",
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString()
  },
  {
    studentId: "STU-1003",
    studentCode: "STU-1003",
    name: "كيرلس سامح فايز",
    stage: "تانية إعدادي",
    grade: "تانية إعدادي",
    phone: "01122334455",
    qrId: "STU-77215",
    status: "active",
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString()
  },
  {
    studentId: "STU-1004",
    studentCode: "STU-1004",
    name: "مارينا هاني صبحي",
    grade: "جامعيين وخريجين",
    phone: "01555667788",
    qrId: "STU-66109",
    status: "active",
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString()
  },
  {
    studentId: "STU-1005",
    studentCode: "STU-1005",
    name: "يوستينا عماد مجدي",
    grade: "ثانوي - ثالثة ثانوي",
    phone: "01288994433",
    qrId: "STU-55320",
    status: "active",
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString()
  },
  {
    studentId: "STU-1006",
    studentCode: "STU-1006",
    name: "ديفيد مايكل ناجي",
    grade: "إعدادي - أولى إعدادي",
    phone: "01011223344",
    qrId: "STU-44198",
    status: "active",
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString()
  },
  {
    studentId: "STU-1007",
    studentCode: "STU-1007",
    name: "ساندرا نبيل رزق",
    grade: "ابتدائي - خامسة وسادسة",
    phone: "01199887766",
    qrId: "STU-33211",
    status: "active",
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString()
  },
  {
    studentId: "STU-1008",
    studentCode: "STU-1008",
    name: "مارك رأفت فهيم",
    grade: "خدام وخادمات",
    phone: "01200334455",
    qrId: "STU-22104",
    status: "active",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString()
  }
];

let memoryStudentsStore = null;
let isCloudSyncing = false;

export function getDemoStudents() {
  try {
    if (typeof localStorage !== 'undefined') {
      const data = localStorage.getItem(STUDENTS_STORAGE_KEY);
      if (!data) {
        return [];
      }
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(s => {
        const stageVal = mapLegacyGradeToStage(s.stage || s.grade);
        return {
          ...s,
          stage: stageVal,
          grade: stageVal,
          studentCode: s.studentCode || s.studentId
        };
      });
    }
  } catch (e) {}

  if (!memoryStudentsStore) {
    memoryStudentsStore = [];
  }
  return memoryStudentsStore;
}

if (typeof window !== 'undefined') {
  window.addEventListener('church_students_updated', (e) => {
    if (e.detail && Array.isArray(e.detail)) {
      memoryStudentsStore = e.detail;
    }
  });
}

export function saveDemoStudents(students) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(students));
    }
  } catch (e) {}
  memoryStudentsStore = [...students];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent("church_students_updated", { detail: students }));
  }
}

/**
 * Background silent synchronization from Cloud Firestore
 */
export async function syncStudentsFromCloud() {
  if (isCloudSyncing || typeof window === 'undefined') return;
  isCloudSyncing = true;
  try {
    const dbObj = await getDb();
    if (!dbObj || !dbObj.db || !dbObj.sdk) return;

    const coll = dbObj.sdk.collection(dbObj.db, "students");
    const snapshot = await dbObj.sdk.getDocs(coll);
    const list = [];
    if (snapshot && typeof snapshot.forEach === "function") {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && (data.name || data.studentCode)) {
          const stageVal = mapLegacyGradeToStage(data.stage || data.grade);
          list.push({
            studentId: docSnap.id,
            ...data,
            stage: stageVal,
            grade: stageVal,
            studentCode: data.studentCode || docSnap.id
          });
        }
      });
    }

    if (list.length > 0) {
      saveDemoStudents(list);
      window.dispatchEvent(new CustomEvent("church_students_updated", { detail: list }));
    }
    return list;
  } catch (err) {
    console.warn("syncStudentsFromCloud error:", err.message);
  } finally {
    isCloudSyncing = false;
  }
}

/**
 * Fetch all students with instant local response and immediate cloud sync
 */
export async function getAllStudents(forceCloud = false) {
  if (forceCloud) {
    const cloudList = await syncStudentsFromCloud();
    if (cloudList && cloudList.length > 0) return cloudList;
  }
  const localList = getDemoStudents();

  // Background non-blocking sync
  if (typeof window !== 'undefined') {
    syncStudentsFromCloud().catch(() => {});
  }

  return localList;
}

/**
 * Get Student by Student ID or Student Code instantly
 */
export async function getStudentById(studentId) {
  if (!studentId) return null;
  const cleanId = String(studentId).trim();
  const all = getDemoStudents();
  return all.find(s => s.studentId === cleanId || s.studentCode === cleanId || (s.qrId && s.qrId.toLowerCase() === cleanId.toLowerCase())) || null;
}

/**
 * Get Student by QR Code ID instantly
 */
export async function getStudentByQrId(qrId) {
  if (!qrId) return null;
  const cleanQr = String(qrId).trim().toLowerCase();
  const students = getDemoStudents();
  return students.find(s => (s.qrId && s.qrId.toLowerCase() === cleanQr) || s.studentCode?.toLowerCase() === cleanQr || s.studentId?.toLowerCase() === cleanQr) || null;
}

/**
 * Checks whether a Student Code is unique across all students (Instant 0ms)
 */
export async function isStudentCodeAvailable(studentCode, excludeStudentId = null) {
  if (!studentCode) return true;
  const cleanCode = String(studentCode).trim().toLowerCase();
  const all = getDemoStudents();
  
  const conflict = all.find(s => {
    const existingCode = (s.studentCode || s.studentId || "").toLowerCase();
    const existingId = (s.studentId || "").toLowerCase();
    const isSameCode = existingCode === cleanCode || existingId === cleanCode;
    if (!isSameCode) return false;
    if (excludeStudentId && s.studentId === excludeStudentId) return false;
    return true;
  });

  return !conflict;
}

/**
 * Checks whether a QR code is already bound to any existing student (Instant 0ms)
 */
export async function isQrCodeAvailable(qrId, excludeStudentId = null) {
  if (!qrId) return true;
  const cleanQr = String(qrId).trim().toLowerCase();
  const all = getDemoStudents();

  const conflict = all.find(s => {
    const existingQr = (s.qrId || "").toLowerCase();
    if (existingQr !== cleanQr) return false;
    if (excludeStudentId && s.studentId === excludeStudentId) return false;
    return true;
  });

  return !conflict;
}

/**
 * Smart Search with Autocomplete suggestions
 */
export async function searchStudents(queryText, maxResults = 8) {
  if (!queryText || !queryText.trim()) return [];
  const clean = sanitizeInput(queryText).trim().toLowerCase();
  const all = getDemoStudents();

  const matches = [];
  for (const s of all) {
    const name = (s.name || "").toLowerCase();
    const code = (s.studentCode || s.studentId || "").toLowerCase();
    const qr = (s.qrId || "").toLowerCase();
    const phone = (s.phone || "").toLowerCase();

    let score = 0;
    if (name.startsWith(clean)) score += 100;
    else if (name.includes(clean)) score += 50;

    if (code === clean) score += 90;
    else if (code.includes(clean)) score += 40;

    if (qr === clean) score += 90;
    else if (qr.includes(clean)) score += 30;

    if (phone.includes(clean)) score += 20;

    if (score > 0) {
      matches.push({ student: s, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxResults).map(m => m.student);
}

export { searchStudents as searchStudentsAutocomplete };

/**
 * Adds a new student in 0ms (Instant Local-First Save + Non-blocking Cloud Sync)
 */
export async function addStudent({ name, stage, grade, phone = "", studentCode = "", qrId = "" }) {
  // 1. Name Validation
  const nameVal = validateName(name);
  if (!nameVal.valid) {
    showToast(nameVal.message, "warning");
    return null;
  }

  const rawStage = stage || grade;
  if (!rawStage) {
    showToast("يرجى اختيار المرحلة الدراسية", "warning");
    return null;
  }
  const cleanStage = mapLegacyGradeToStage(rawStage);

  // 2. Phone Validation
  const phoneVal = validatePhone(phone);
  if (!phoneVal.valid) {
    showToast(phoneVal.message, "warning");
    return null;
  }

  // 3. Student Code Validation
  const generatedId = `STU-${Math.floor(1000 + Math.random() * 9000)}`;
  const rawCode = (studentCode && studentCode.trim()) ? studentCode.trim() : generatedId;
  const codeVal = validateStudentCode(rawCode);
  if (!codeVal.valid) {
    showToast(codeVal.message, "warning");
    return null;
  }

  const cleanCode = codeVal.clean;
  const cleanQr = (qrId && qrId.trim()) ? sanitizeInput(qrId).toUpperCase() : cleanCode;

  // 4. Verify Student Code Uniqueness (Instant 0ms)
  const isCodeAvail = await isStudentCodeAvailable(cleanCode);
  if (!isCodeAvail) {
    showToast("كود الطالب هذا مسجل بالفعل لطالب آخر. يرجى اختيار كود فريد.", "error");
    return null;
  }

  // 5. Verify QR Uniqueness (Instant 0ms)
  const isQrAvail = await isQrCodeAvailable(cleanQr);
  if (!isQrAvail) {
    showToast("هذا الكارنيه مرتبط بالفعل بطالب آخر.", "error");
    return null;
  }

  const studentId = cleanCode;
  const newStudent = {
    studentId,
    studentCode: cleanCode,
    name: nameVal.clean,
    stage: cleanStage,
    grade: cleanStage,
    phone: phoneVal.clean,
    qrId: cleanQr,
    status: "active",
    createdAt: new Date().toISOString()
  };

  // 1. Save Locally Immediately in 0ms (Instant UX)
  const list = getDemoStudents();
  list.unshift(newStudent);
  saveDemoStudents(list);

  // 2. Replicate to Cloud Firestore in Background (Non-blocking)
  getDb().then(dbObj => {
    if (dbObj && dbObj.db && dbObj.sdk) {
      const docRef = dbObj.sdk.doc(dbObj.db, "students", studentId);
      dbObj.sdk.setDoc(docRef, { ...newStudent }, { merge: true }).catch(err => console.warn("Cloud save note:", err.message));
    }
  });

  // 3. Non-blocking Activity Log
  try {
    logActivity("إضافة طالب جديد", { studentName: newStudent.name, studentCode: cleanCode, stage: cleanStage, qrId: cleanQr }, studentId, "student").catch(() => {});
  } catch (e) {}

  showToast(`تمت إضافة الطالب ${newStudent.name} بنجاح ✅`, "success");
  return newStudent;
}

/**
 * Updates student information in 0ms
 */
export async function updateStudent(studentId, { name, stage, grade, phone, studentCode, qrId, status }) {
  if (!studentId) return false;

  const list = getDemoStudents();
  const index = list.findIndex(s => s.studentId === studentId);
  if (index === -1) {
    showToast("لم يتم العثور على بيانات الطالب", "error");
    return false;
  }

  const current = list[index];
  const updatedCode = studentCode ? sanitizeInput(studentCode).trim() : current.studentCode;
  const updatedQr = qrId ? sanitizeInput(qrId).trim() : (current.qrId || updatedCode);

  // Verify Code uniqueness if changed
  if (studentCode && studentCode !== current.studentCode && studentCode !== current.studentId) {
    const isCodeAvail = await isStudentCodeAvailable(updatedCode, studentId);
    if (!isCodeAvail) {
      showToast("كود الطالب هذا مسجل بالفعل لطالب آخر.", "error");
      return false;
    }
  }

  // Verify QR uniqueness if changed
  if (qrId && qrId !== current.qrId) {
    const isQrAvail = await isQrCodeAvailable(updatedQr, studentId);
    if (!isQrAvail) {
      showToast("هذا الكارنيه مرتبط بالفعل بطالب آخر.", "error");
      return false;
    }
  }

  const rawStage = stage || grade;
  const cleanStage = rawStage ? mapLegacyGradeToStage(rawStage) : (current.stage || current.grade || "أولى ثانوي");

  const updatedStudent = {
    ...current,
    name: name ? sanitizeInput(name).trim() : current.name,
    stage: cleanStage,
    grade: cleanStage,
    phone: phone !== undefined ? sanitizeInput(phone).trim() : current.phone,
    studentCode: updatedCode,
    qrId: updatedQr,
    status: status || current.status,
    updatedAt: new Date().toISOString()
  };

  // 1. Save Locally Instantly
  list[index] = updatedStudent;
  saveDemoStudents(list);

  // 2. Sync to Cloud in Background
  getDb().then(dbObj => {
    if (dbObj && dbObj.db && dbObj.sdk) {
      const docRef = dbObj.sdk.doc(dbObj.db, "students", studentId);
      dbObj.sdk.setDoc(docRef, updatedStudent, { merge: true }).catch(err => console.warn("Cloud update note:", err.message));
    }
  });

  try {
    logActivity("تعديل بيانات طالب", { studentId, studentName: updatedStudent.name }, studentId, "student").catch(() => {});
  } catch (e) {}

  showToast(`تم تعديل بيانات الطالب ${updatedStudent.name} بنجاح ✅`, "success");
  return true;
}

/**
 * Toggle student status between active and inactive in 0ms
 */
export async function toggleStudentStatus(studentId, currentStatus) {
  const newStatus = currentStatus === "active" ? "inactive" : "active";
  return updateStudent(studentId, { status: newStatus });
}

/**
 * Deletes a student in 0ms
 */
export async function deleteStudent(studentId) {
  if (!studentId) return false;

  const list = getDemoStudents();
  const updatedList = list.filter(s => s.studentId !== studentId);
  saveDemoStudents(updatedList);

  getDb().then(dbObj => {
    if (dbObj && dbObj.db && dbObj.sdk) {
      const docRef = dbObj.sdk.doc(dbObj.db, "students", studentId);
      dbObj.sdk.deleteDoc(docRef).catch(err => console.warn("Cloud delete note:", err.message));
    }
  });

  try {
    logActivity("حذف طالب", { studentId }, studentId, "student").catch(() => {});
  } catch (e) {}

  showToast("تم حذف الطالب بنجاح", "success");
  return true;
}
