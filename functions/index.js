/**
 * Church QR Attendance System - Firebase Cloud Functions
 * Automated Scheduled Absence Calculation (Cloud Scheduler)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper to calculate current ISO Week ID (e.g. 2026-W33)
 */
function getCurrentWeekId(targetDate = new Date()) {
  const d = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Scheduled Function: Runs every Thursday at 23:59 (Cairo Time)
 * Evaluates Thursday parts (Tasbeha, Lecture)
 */
exports.scheduledThursdayAbsence = functions.pubsub
  .schedule("59 23 * * 4")
  .timeZone("Africa/Cairo")
  .onRun(async (context) => {
    console.log("Starting Scheduled Thursday Absence Processing...");
    return await processDayAbsence("thursday", ["tasbeha", "lecture1"]);
  });

/**
 * Scheduled Function: Runs every Friday at 23:59 (Cairo Time)
 * Evaluates Friday parts (Mass, Lecture, Spiritual Notebook)
 */
exports.scheduledFridayAbsence = functions.pubsub
  .schedule("59 23 * * 5")
  .timeZone("Africa/Cairo")
  .onRun(async (context) => {
    console.log("Starting Scheduled Friday Absence Processing...");
    return await processDayAbsence("friday", ["mass", "lecture2", "spiritualNotebook"]);
  });

/**
 * Core Batch Absence Processing Engine
 */
async function processDayAbsence(dayName, partsList) {
  const weekId = getCurrentWeekId();
  console.log(`Processing absence for Week: ${weekId}, Day: ${dayName}`);

  // Fetch all active students
  const studentsSnap = await db.collection("students").where("status", "==", "active").get();
  if (studentsSnap.empty) {
    console.log("No active students found.");
    return null;
  }

  let absenceCount = 0;
  const batch = db.batch();

  for (const studentDoc of studentsSnap.docs) {
    const student = studentDoc.data();

    for (const partId of partsList) {
      const attendanceId = `${weekId}_${student.studentId}_${dayName}_${partId}`;
      const attRef = db.collection("attendance").doc(attendanceId);
      const attSnap = await attRef.get();

      // If no attendance record exists, mark as absent
      if (!attSnap.exists) {
        batch.set(attRef, {
          id: attendanceId,
          studentId: student.studentId,
          studentName: student.name,
          grade: student.grade,
          qrId: student.qrId,
          weekId,
          day: dayName,
          part: partId,
          status: "absent",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          recordedBy: "Cloud Functions Scheduler",
          isManualEdit: false
        });
        absenceCount++;
      }
    }
  }

  if (absenceCount > 0) {
    await batch.commit();
    console.log(`Successfully recorded ${absenceCount} automatic absence entries.`);
  } else {
    console.log("All students have recorded attendance or already marked.");
  }

  // Audit Log
  await db.collection("activityLogs").add({
    action: "حساب الغياب التلقائي عبر السيرفر (Cloud Function)",
    details: { weekId, day: dayName, processedAbsents: absenceCount },
    adminId: "cloud_function",
    adminEmail: "خادم السحاب الآلي",
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, absenceCount };
}

/**
 * HTTP On-Demand Trigger (callable by admin if needed)
 */
exports.manualTriggerAbsence = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول كمسؤول.");
  }

  const day = data.day || "thursday";
  const parts = day === "thursday" ? ["tasbeha", "lecture1"] : ["mass", "lecture2", "spiritualNotebook"];
  return await processDayAbsence(day, parts);
});
