/**
 * Church QR Attendance System - Reports & Microsoft Word (.docx/.doc) Exporter
 * Official Branding: كنيسة مارمينا العجايبي بكوم المحرص - إعداد خدام
 * Full 7-Day Attendance Matrix & Multi-Year Calendar Exporter (2024 - 2030)
 */

import { getAllStudents, getStudentById } from "./students.js";
import { getStudentAttendanceHistory, getWeekAttendance, getWeeklyAttendanceMatrix, getPartName, getDemoAttendance } from "./attendance.js";
import { formatDateArabic, getWeekDetails, getCurrentWeekId, getActualDayDate, CHURCH_INFO, ALL_DAYS, ATTENDANCE_PARTS, STAGES, STAGE_GROUPS, mapLegacyGradeToStage, calculateServiceOccurrencesInPeriod } from "./utils.js";
import { logActivity } from "./activity.js";

export const REPORT_DAY_ORDER = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

export function normalizeSelectedDays(selectedDays = []) {
  const normalized = Array.isArray(selectedDays) ? selectedDays : [];
  const choices = normalized.filter(Boolean);
  if (!choices.length) return [...REPORT_DAY_ORDER];
  return [...new Set(choices.filter(day => REPORT_DAY_ORDER.includes(day)))];
}

export function buildReportFilters(options = {}) {
  const mode = options.mode || "week";
  const selectedDays = normalizeSelectedDays(options.selectedDays);
  const selectedDaySet = new Set(selectedDays);

  let startDate = options.startDate || null;
  let endDate = options.endDate || null;

  if (mode === "week" && options.weekId) {
    const saturday = getActualDayDate(options.weekId, "saturday");
    const friday = getActualDayDate(options.weekId, "friday");
    startDate = saturday.dateIso;
    endDate = friday.dateIso;
  } else if (mode === "month" && options.month) {
    const monthDate = new Date(`${options.month}-01T00:00:00`);
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    startDate = firstDay.toISOString().split("T")[0];
    endDate = lastDay.toISOString().split("T")[0];
  } else if (mode === "custom") {
    startDate = options.startDate || startDate;
    endDate = options.endDate || endDate;
  }

  return {
    mode,
    weekId: options.weekId || null,
    month: options.month || null,
    startDate,
    endDate,
    selectedDays,
    selectedDaySet
  };
}

function recordMatchesReportFilters(record, filters) {
  if (!record || !record.day) return true;
  if (filters.selectedDaySet && filters.selectedDaySet.size && !filters.selectedDaySet.has(record.day)) {
    return false;
  }
  if (filters.startDate && record.dateIso && record.dateIso < filters.startDate) {
    return false;
  }
  if (filters.endDate && record.dateIso && record.dateIso > filters.endDate) {
    return false;
  }
  return true;
}

/**
 * Calculates comprehensive attendance statistics for a single student across all 7 days and specific weeks
 */
export async function calculateStudentStats(studentId, targetWeekId = null, filters = {}) {
  const student = await getStudentById(studentId);
  if (!student) return null;

  const reportFilters = buildReportFilters({ ...filters, weekId: targetWeekId || filters.weekId || null });
  let history = await getStudentAttendanceHistory(studentId);

  history = history.filter((record) => recordMatchesReportFilters(record, reportFilters));
  if (targetWeekId && !reportFilters.startDate && !reportFilters.endDate) {
    history = history.filter(r => r.weekId === targetWeekId);
  }

  const presentCount = history.filter(r => r.status === "present").length;
  const absentCount = history.filter(r => r.status === "absent").length;
  const totalSlots = presentCount + absentCount;
  const rate = totalSlots > 0 ? Math.round((presentCount / totalSlots) * 100) : 0;

  // Group by week
  const weeksMap = {};
  history.forEach(rec => {
    if (!weeksMap[rec.weekId]) {
      weeksMap[rec.weekId] = {
        weekId: rec.weekId,
        saturday: {},
        sunday: {},
        monday: {},
        tuesday: {},
        wednesday: {},
        thursday: {},
        friday: {}
      };
    }
    if (rec.day && rec.part) {
      if (!weeksMap[rec.weekId][rec.day]) {
        weeksMap[rec.weekId][rec.day] = {};
      }
      weeksMap[rec.weekId][rec.day][rec.part] = {
        status: rec.status,
        partName: rec.partName || getPartName(rec.day, rec.part),
        dateArabic: rec.dateArabic || "",
        timeStr: rec.timeStr || "",
        timestamp: rec.timestamp || ""
      };
    }
  });

  return {
    student,
    presentCount,
    absentCount,
    totalSlots,
    rate,
    weeksCount: Object.keys(weeksMap).length,
    weeksMap,
    rawHistory: history
  };
}

/**
 * Generates and downloads an Official Detailed Microsoft Word (.doc) report for a Single Student
 * Includes exact day, part, date, time, and status for every session
 */
export async function exportStudentWordReport(studentId, selectedWeekId = null, reportOptions = {}) {
  const stats = await calculateStudentStats(studentId, selectedWeekId, reportOptions);
  if (!stats) return;

  const { student, presentCount, absentCount, totalSlots, rate, weeksMap } = stats;
  const currentDate = formatDateArabic(new Date());
  const selectedDays = normalizeSelectedDays(reportOptions.selectedDays);
  const daysList = selectedDays.length ? selectedDays : ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  // 1. Build Granular Session-by-Session Table Rows
  let detailedRows = "";
  const sortedWeeks = Object.keys(weeksMap).sort().reverse();

  let sessionIndex = 1;
  sortedWeeks.forEach(wId => {
    const wData = weeksMap[wId];
    daysList.forEach(dayKey => {
      const partsMap = wData[dayKey] || {};
      const dayDate = getActualDayDate(wId, dayKey);
      const definedParts = ATTENDANCE_PARTS[dayKey] || [];

      definedParts.forEach(defPart => {
        const sessionRecord = partsMap[defPart.id];
        const isPresent = sessionRecord && sessionRecord.status === "present";
        const isAbsent = sessionRecord && sessionRecord.status === "absent";
        const statusHtml = isPresent 
          ? `<span style="color:#059669; font-weight:bold;">✅ حاضر</span>` 
          : (isAbsent ? `<span style="color:#dc2626; font-weight:bold;">❌ غائب</span>` : `<span style="color:#9ca3af;">— لم يُسجل</span>`);

        const timeDisplay = sessionRecord?.timeStr || (sessionRecord?.timestamp ? new Date(sessionRecord.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }) : "—");

        detailedRows += `
          <tr>
            <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center; font-weight:bold;">${sessionIndex++}</td>
            <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; background:#f8fafc;">${wId}</td>
            <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:#1e1b4b;">${dayDate.dayName}</td>
            <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center; color:#475569;">${dayDate.dateArabic}</td>
            <td style="padding:6px 8px; border:1px solid #cbd5e1; font-weight:bold; color:#4338ca;">${defPart.name}</td>
            <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${statusHtml}</td>
            <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center; color:#64748b; font-size:9pt;">${timeDisplay}</td>
          </tr>
        `;
      });
    });
  });

  if (!detailedRows) {
    detailedRows = `<tr><td colspan="7" style="text-align:center; padding:15px; color:#64748b;">لا توجد سجلات حضور مسجلة لهذا الطالب</td></tr>`;
  }

  // 2. Build Weekly Summary Matrix Table
  let summaryRows = "";
  sortedWeeks.forEach(wId => {
    const wData = weeksMap[wId];
    const getBadge = (dayKey) => {
      const parts = wData[dayKey] || {};
      const vals = Object.values(parts);
      if (vals.some(v => v.status === "present")) return `<span style="color:#059669; font-weight:bold;">✅ حاضر</span>`;
      if (vals.length > 0 && vals.every(v => v.status === "absent")) return `<span style="color:#dc2626; font-weight:bold;">❌ غائب</span>`;
      return `<span style="color:#9ca3af;">—</span>`;
    };

    summaryRows += `
      <tr>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; background:#f8fafc;">${wId}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${getBadge('saturday')}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${getBadge('sunday')}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${getBadge('monday')}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${getBadge('tuesday')}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${getBadge('wednesday')}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${getBadge('thursday')}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${getBadge('friday')}</td>
      </tr>
    `;
  });

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>تقرير حضور الطالب - ${student.name}</title>
      <style>
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background-color: #ffffff; color: #1e293b; margin: 20px; }
        .header { text-align: center; border-bottom: 2px solid #4338ca; padding-bottom: 12px; margin-bottom: 18px; }
        .header h1 { color: #1e1b4b; font-size: 20pt; margin: 0 0 4px 0; font-weight: 800; }
        .header h2 { color: #b45309; font-size: 14pt; margin: 0 0 6px 0; font-weight: 700; }
        .header h3 { color: #4338ca; font-size: 12pt; margin: 0; }
        .meta-box { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        .meta-box td { padding: 7px 10px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 10.5pt; }
        .meta-label { font-weight: bold; color: #4338ca; width: 22%; }
        .stats-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; }
        .stats-table th { background: #3730a3; color: white; padding: 8px; border: 1px solid #3730a3; font-size: 10.5pt; }
        .stats-table td { padding: 10px; border: 1px solid #cbd5e1; font-size: 12pt; font-weight: bold; background: #f8fafc; }
        .data-table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-size: 9.5pt; }
        .data-table th { background: #1e1b4b; color: #fbbf24; padding: 8px 6px; border: 1px solid #1e1b4b; text-align: center; }
        .footer { text-align: center; font-size: 9pt; color: #64748b; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>كنيسة مارمينا العجايبي بكوم المحرص</h1>
        <h2>إعداد خدام</h2>
        <h3>تقرير المتابعة الفردي التفصيلي لحضور وغياب الطالب</h3>
      </div>

      <table class="meta-box">
        <tr>
          <td class="meta-label">اسم الطالب:</td>
          <td><strong style="font-size:12pt; color:#1e1b4b;">${student.name}</strong></td>
          <td class="meta-label">المرحلة / الصف:</td>
          <td><strong>${student.grade}</strong></td>
        </tr>
        <tr>
          <td class="meta-label">كود الطالب (Code):</td>
          <td><strong style="color:#b45309; font-family:monospace;">${student.studentCode || student.studentId}</strong></td>
          <td class="meta-label">رمز الكارنيه (QR ID):</td>
          <td>${student.qrId}</td>
        </tr>
        <tr>
          <td class="meta-label">تاريخ استخراج التقرير:</td>
          <td colspan="3">${currentDate} (${selectedRangeLabel})</td>
        </tr>
      </table>

      <h4 style="color:#1e1b4b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px;">📊 ملخص الإحصائيات ونسبة الحضور</h4>
      <table class="stats-table">
        <tr>
          <th>إجمالي الحضور (جلسات)</th>
          <th>إجمالي الغياب (جلسات)</th>
          <th>إجمالي الجلسات المسجلة</th>
          <th>نسبة الالتزام الإجمالية</th>
        </tr>
        <tr>
          <td style="color:#059669;">${presentCount}</td>
          <td style="color:#dc2626;">${absentCount}</td>
          <td>${totalSlots}</td>
          <td style="color:#4338ca; font-size:15pt;">${rate}%</td>
        </tr>
      </table>

      <h4 style="color:#1e1b4b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px;">📋 السجل التفصيلي اليومي لكل قسم وجلسة</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:4%;">م</th>
            <th style="width:12%;">الأسبوع</th>
            <th style="width:12%;">اليوم</th>
            <th style="width:18%;">التاريخ الفعلي</th>
            <th style="width:24%;">القسم / الخدمة</th>
            <th style="width:15%;">الحالة</th>
            <th style="width:15%;">وقت التسجيل</th>
          </tr>
        </thead>
        <tbody>
          ${detailedRows}
        </tbody>
      </table>

      <h4 style="color:#1e1b4b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px;">📅 ملخص الحضور الأسبوعي لجميع أيام الأسبوع</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>الأسبوع</th>
            <th>السبت (العشية)</th>
            <th>الأحد (القداس)</th>
            <th>الإثنين (الماراثون)</th>
            <th>الثلاثاء (الماراثون)</th>
            <th>الأربعاء (القداس)</th>
            <th>الخميس (تسبيحة/محاضرة)</th>
            <th>الجمعة (قداس/درس)</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows}
        </tbody>
      </table>

      <div class="footer">
        <strong>كنيسة مارمينا العجايبي بكوم المحرص — إعداد خدام</strong><br>
        تم استخراج هذا التقرير التفصيلي آلياً عبر نظام إدارة الحضور الذكي
      </div>
    </body>
    </html>
  `;

  const fileName = `تقرير_طالب_${student.name.replace(/\s+/g, '_')}_${selectedWeekId || 'شامل'}_${new Date().toISOString().split('T')[0]}.doc`;
  downloadWordFile(wordContent, fileName);
  await logActivity("تصدير تقرير Word لطالب", { studentName: student.name, studentId, selectedWeekId }, studentId, "report_export");
}

/**
 * Generates and downloads a Dedicated 7-Day Weekly Attendance Matrix Report for a selected week
 * Includes exact calendar dates in headers and detailed breakdown
 */
export async function exportWeeklyMatrixWordReport(weekId = getCurrentWeekId()) {
  const matrixData = await getWeeklyAttendanceMatrix(weekId);
  const currentDate = formatDateArabic(new Date());

  const { students, stats } = matrixData;
  const daysList = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  // Calculate exact calendar date for each day of the week
  const dayDates = {};
  daysList.forEach(d => {
    dayDates[d] = getActualDayDate(weekId, d);
  });

  let tableRows = "";
  students.forEach((s, idx) => {
    const rateColor = s.rate >= 75 ? "#059669" : s.rate >= 50 ? "#d97706" : "#dc2626";
    
    const getCell = (dayKey) => {
      const d = s.days[dayKey];
      if (d.status === "present") return `<span style="color:#059669; font-weight:bold;">✅ حاضر</span>`;
      if (d.status === "absent") return `<span style="color:#dc2626; font-weight:bold;">❌ غائب</span>`;
      return `<span style="color:#9ca3af;">—</span>`;
    };

    tableRows += `
      <tr>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center; font-weight:bold;">${idx + 1}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center; font-family:monospace; font-weight:bold; color:#b45309;">${s.studentCode}</td>
        <td style="padding:6px; border:1px solid #d1d5db; font-weight:bold; color:#1e1b4b;">${s.name}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${s.grade}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${getCell('saturday')}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${getCell('sunday')}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${getCell('monday')}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${getCell('tuesday')}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${getCell('wednesday')}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${getCell('thursday')}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center;">${getCell('friday')}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center; color:#059669; font-weight:bold;">${s.presentDaysCount}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center; color:#dc2626; font-weight:bold;">${s.absentDaysCount}</td>
        <td style="padding:6px; border:1px solid #d1d5db; text-align:center; color:${rateColor}; font-weight:bold;">${s.rate}%</td>
      </tr>
    `;
  });

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>تقرير الحضور والغياب الأسبوعي لجميع الأيام - ${weekId}</title>
      <style>
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background-color: #ffffff; color: #1e293b; }
        .header { text-align: center; border-bottom: 2px solid #4338ca; padding-bottom: 12px; margin-bottom: 18px; }
        .header h1 { color: #1e1b4b; font-size: 22pt; margin: 0 0 4px 0; font-weight: 800; }
        .header h2 { color: #b45309; font-size: 15pt; margin: 0 0 6px 0; font-weight: 700; }
        .header h3 { color: #4338ca; font-size: 13pt; margin: 0; }
        .kpi-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; }
        .kpi-table th { background: #3730a3; color: white; padding: 7px; border: 1px solid #3730a3; font-size: 9.5pt; }
        .kpi-table td { padding: 8px; border: 1px solid #cbd5e1; font-size: 11pt; font-weight: bold; background: #f8fafc; }
        .master-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
        .master-table th { background: #1e1b4b; color: #fbbf24; padding: 8px 4px; border: 1px solid #1e1b4b; text-align: center; }
        .footer { text-align: center; font-size: 9.5pt; color: #64748b; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>كنيسة مارمينا العجايبي بكوم المحرص</h1>
        <h2>إعداد خدام</h2>
        <h3>تقرير الحضور والغياب الأسبوعي لجميع أيام الأسبوع</h3>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 10pt;">
          ${weekId} (من ${dayDates.saturday.dateArabic} إلى ${dayDates.friday.dateArabic}) | تاريخ الاستخراج: ${currentDate}
        </p>
      </div>

      <table class="kpi-table">
        <tr>
          <th>إجمالي الطلاب</th>
          <th>السبت (العشية)<br><small style="color:#e2e8f0;">${dayDates.saturday.dateArabic}</small></th>
          <th>الأحد (القداس)<br><small style="color:#e2e8f0;">${dayDates.sunday.dateArabic}</small></th>
          <th>الإثنين (ماراثون)<br><small style="color:#e2e8f0;">${dayDates.monday.dateArabic}</small></th>
          <th>الثلاثاء (ماراثون)<br><small style="color:#e2e8f0;">${dayDates.tuesday.dateArabic}</small></th>
          <th>الأربعاء (القداس)<br><small style="color:#e2e8f0;">${dayDates.wednesday.dateArabic}</small></th>
          <th>الخميس (تسبيحة/محاضرة)<br><small style="color:#e2e8f0;">${dayDates.thursday.dateArabic}</small></th>
          <th>الجمعة (قداس/درس)<br><small style="color:#e2e8f0;">${dayDates.friday.dateArabic}</small></th>
          <th>نسبة الأسبوع</th>
        </tr>
        <tr>
          <td>${stats.totalStudents}</td>
          <td style="color:#059669;">${stats.dayPresentTotals?.saturday || 0}</td>
          <td style="color:#059669;">${stats.dayPresentTotals?.sunday || 0}</td>
          <td style="color:#059669;">${stats.dayPresentTotals?.monday || 0}</td>
          <td style="color:#059669;">${stats.dayPresentTotals?.tuesday || 0}</td>
          <td style="color:#059669;">${stats.dayPresentTotals?.wednesday || 0}</td>
          <td style="color:#059669;">${stats.dayPresentTotals?.thursday || 0}</td>
          <td style="color:#059669;">${stats.dayPresentTotals?.friday || 0}</td>
          <td style="color:#4338ca; font-size:12pt;">${stats.overallRate}%</td>
        </tr>
      </table>

      <table class="master-table">
        <thead>
          <tr>
            <th style="width:3%;">م</th>
            <th style="width:10%;">كود الطالب</th>
            <th style="width:17%;">اسم الطالب</th>
            <th style="width:12%;">المرحلة</th>
            <th style="width:7%;">السبت<br><small style="color:#fef08a;">${dayDates.saturday.dateArabic.split(' ').slice(0, 2).join(' ')}</small></th>
            <th style="width:7%;">الأحد<br><small style="color:#fef08a;">${dayDates.sunday.dateArabic.split(' ').slice(0, 2).join(' ')}</small></th>
            <th style="width:7%;">الإثنين<br><small style="color:#fef08a;">${dayDates.monday.dateArabic.split(' ').slice(0, 2).join(' ')}</small></th>
            <th style="width:7%;">الثلاثاء<br><small style="color:#fef08a;">${dayDates.tuesday.dateArabic.split(' ').slice(0, 2).join(' ')}</small></th>
            <th style="width:7%;">الأربعاء<br><small style="color:#fef08a;">${dayDates.wednesday.dateArabic.split(' ').slice(0, 2).join(' ')}</small></th>
            <th style="width:7%;">الخميس<br><small style="color:#fef08a;">${dayDates.thursday.dateArabic.split(' ').slice(0, 2).join(' ')}</small></th>
            <th style="width:7%;">الجمعة<br><small style="color:#fef08a;">${dayDates.friday.dateArabic.split(' ').slice(0, 2).join(' ')}</small></th>
            <th style="width:4%;">حاضر</th>
            <th style="width:4%;">غائب</th>
            <th style="width:5%;">النسبة</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="footer">
        <strong>كنيسة مارمينا العجايبي بكوم المحرص — إعداد خدام</strong><br>
        تم استخراج هذا التقرير الأسبوعي الشامل آلياً عبر نظام إدارة الحضور الذكي
      </div>
    </body>
    </html>
  `;

  downloadWordFile(wordContent, `تقرير_الاسبوع_الشامل_${weekId}_${new Date().toISOString().split('T')[0]}.doc`);
  await logActivity("تصدير تقرير أسبوعي Word", { weekId, totalStudents: students.length }, null, "report_export");
}

/**
 * Generates and downloads a Master Microsoft Word report for ALL students across all time
 * Includes Comprehensive Master Matrix + Granular Session-by-Session Breakdown for Every Student
 */
export async function exportAllStudentsWordReport() {
  const students = await getAllStudents();
  const currentDate = formatDateArabic(new Date());
  const daysList = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  let summaryTableRows = "";
  let studentDetailSectionsHtml = "";
  let totalPresentAll = 0;
  let totalAbsentAll = 0;

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const stats = await calculateStudentStats(s.studentId);
    if (!stats) continue;

    totalPresentAll += stats.presentCount;
    totalAbsentAll += stats.absentCount;

    const rateColor = stats.rate >= 75 ? "#059669" : stats.rate >= 50 ? "#d97706" : "#dc2626";
    const statusText = s.status === "active" ? "<span style='color:#059669; font-weight:bold;'>نشط</span>" : "<span style='color:#dc2626; font-weight:bold;'>معطل</span>";

    // Summary Table Row
    summaryTableRows += `
      <tr>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; font-weight:bold;">${i + 1}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; font-family:monospace; font-weight:bold; color:#b45309;">${s.studentCode || s.studentId}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; font-weight:bold; color:#1e1b4b;">${s.name}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${s.grade}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; font-family:monospace;">${s.qrId}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; color:#059669; font-weight:bold;">${stats.presentCount}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; color:#dc2626; font-weight:bold;">${stats.absentCount}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; color:${rateColor}; font-weight:bold;">${stats.rate}%</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${statusText}</td>
      </tr>
    `;

    // Detailed Section for this Student (Exact Dates, Days, Parts, Times)
    let sDetailedRows = "";
    let sIndex = 1;
    const sortedWeeks = Object.keys(stats.weeksMap).sort().reverse();

    sortedWeeks.forEach(wId => {
      const wData = stats.weeksMap[wId];
      daysList.forEach(dayKey => {
        const partsMap = wData[dayKey] || {};
        const dayDate = getActualDayDate(wId, dayKey);
        const definedParts = ATTENDANCE_PARTS[dayKey] || [];

        definedParts.forEach(defPart => {
          const sessionRecord = partsMap[defPart.id];
          const isPresent = sessionRecord && sessionRecord.status === "present";
          const isAbsent = sessionRecord && sessionRecord.status === "absent";
          const statusHtml = isPresent 
            ? `<span style="color:#059669; font-weight:bold;">✅ حاضر</span>` 
            : (isAbsent ? `<span style="color:#dc2626; font-weight:bold;">❌ غائب</span>` : `<span style="color:#9ca3af;">— لم يُسجل</span>`);

          const timeDisplay = sessionRecord?.timeStr || (sessionRecord?.timestamp ? new Date(sessionRecord.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }) : "—");

          sDetailedRows += `
            <tr>
              <td style="padding:5px 6px; border:1px solid #e2e8f0; text-align:center;">${sIndex++}</td>
              <td style="padding:5px 6px; border:1px solid #e2e8f0; text-align:center; font-weight:bold; background:#f8fafc;">${wId}</td>
              <td style="padding:5px 6px; border:1px solid #e2e8f0; text-align:center; font-weight:bold;">${dayDate.dayName}</td>
              <td style="padding:5px 6px; border:1px solid #e2e8f0; text-align:center; color:#475569;">${dayDate.dateArabic}</td>
              <td style="padding:5px 6px; border:1px solid #e2e8f0; font-weight:bold; color:#4338ca;">${defPart.name}</td>
              <td style="padding:5px 6px; border:1px solid #e2e8f0; text-align:center;">${statusHtml}</td>
              <td style="padding:5px 6px; border:1px solid #e2e8f0; text-align:center; color:#64748b; font-size:8.5pt;">${timeDisplay}</td>
            </tr>
          `;
        });
      });
    });

    if (!sDetailedRows) {
      sDetailedRows = `<tr><td colspan="7" style="text-align:center; padding:10px; color:#94a3b8;">لا توجد جلسات مسجلة</td></tr>`;
    }

    studentDetailSectionsHtml += `
      <div style="page-break-inside:avoid; margin-top:25px; border:1.5px solid #cbd5e1; border-radius:6px; padding:12px; background:#ffffff;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #4338ca; padding-bottom:6px; margin-bottom:10px;">
          <div>
            <strong style="font-size:12pt; color:#1e1b4b;">${i + 1}. ${s.name}</strong>
            <span style="font-size:9.5pt; color:#b45309; margin-right:10px;">(كود: ${s.studentCode || s.studentId})</span>
            <span style="font-size:9.5pt; color:#475569; margin-right:10px;">[${s.grade}]</span>
          </div>
          <div>
            <span style="font-size:10pt; color:#059669; font-weight:bold;">حضور: ${stats.presentCount}</span> | 
            <span style="font-size:10pt; color:#dc2626; font-weight:bold;">غياب: ${stats.absentCount}</span> | 
            <span style="font-size:10pt; color:#4338ca; font-weight:bold;">النسبة: ${stats.rate}%</span>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:8.5pt;">
          <thead>
            <tr style="background:#f1f5f9; color:#1e293b;">
              <th style="padding:5px; border:1px solid #cbd5e1; width:4%;">م</th>
              <th style="padding:5px; border:1px solid #cbd5e1; width:12%;">الأسبوع</th>
              <th style="padding:5px; border:1px solid #cbd5e1; width:12%;">اليوم</th>
              <th style="padding:5px; border:1px solid #cbd5e1; width:20%;">التاريخ الفعلي</th>
              <th style="padding:5px; border:1px solid #cbd5e1; width:24%;">القسم / الخدمة</th>
              <th style="padding:5px; border:1px solid #cbd5e1; width:14%;">الحالة</th>
              <th style="padding:5px; border:1px solid #cbd5e1; width:14%;">وقت التسجيل</th>
            </tr>
          </thead>
          <tbody>
            ${sDetailedRows}
          </tbody>
        </table>
      </div>
    `;
  }

  const overallTotalSlots = totalPresentAll + totalAbsentAll;
  const grandRate = overallTotalSlots > 0 ? Math.round((totalPresentAll / overallTotalSlots) * 100) : 0;

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>التقرير الشامل التفصيلي لحضور وغياب الطلاب</title>
      <style>
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background-color: #ffffff; color: #1e293b; margin: 20px; }
        .header { text-align: center; border-bottom: 2px solid #4338ca; padding-bottom: 15px; margin-bottom: 20px; }
        .header h1 { color: #1e1b4b; font-size: 22pt; margin: 0 0 4px 0; font-weight: 800; }
        .header h2 { color: #b45309; font-size: 15pt; margin: 0 0 8px 0; font-weight: 700; }
        .header h3 { color: #4338ca; font-size: 13pt; margin: 0; }
        .kpi-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; }
        .kpi-table th { background: #3730a3; color: white; padding: 8px; border: 1px solid #3730a3; font-size: 10.5pt; }
        .kpi-table td { padding: 10px; border: 1px solid #cbd5e1; font-size: 12pt; font-weight: bold; background: #f8fafc; }
        .master-table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 25px; font-size: 9.5pt; }
        .master-table th { background: #1e1b4b; color: #fbbf24; padding: 8px 6px; border: 1px solid #1e1b4b; text-align: center; }
        .section-title { color: #1e1b4b; font-size: 14pt; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px; margin-bottom: 12px; font-weight: 800; }
        .footer { text-align: center; font-size: 9.5pt; color: #64748b; margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>كنيسة مارمينا العجايبي بكوم المحرص</h1>
        <h2>إعداد خدام</h2>
        <h3>التقرير الشامل التفصيلي لمتابعة حضور وغياب جميع الطلاب</h3>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 10pt;">
          إجمالي الطلاب: <strong>${students.length}</strong> | تاريخ استخراج التقرير: <strong>${currentDate}</strong>
        </p>
      </div>

      <table class="kpi-table">
        <tr>
          <th>إجمالي الطلاب</th>
          <th>إجمالي جلسات الحضور</th>
          <th>إجمالي جلسات الغياب</th>
          <th>إجمالي الجلسات المسجلة</th>
          <th>نسبة الالتزام العامة</th>
        </tr>
        <tr>
          <td>${students.length}</td>
          <td style="color:#059669;">${totalPresentAll}</td>
          <td style="color:#dc2626;">${totalAbsentAll}</td>
          <td>${overallTotalSlots}</td>
          <td style="color:#4338ca; font-size:14pt;">${grandRate}%</td>
        </tr>
      </table>

      <div class="section-title">📊 أولاً: جدول ملخص ومصفوفة الطلاب العامة</div>
      <table class="master-table">
        <thead>
          <tr>
            <th style="width:4%;">م</th>
            <th style="width:13%;">كود الطالب</th>
            <th style="width:23%;">اسم الطالب</th>
            <th style="width:18%;">المرحلة</th>
            <th style="width:12%;">رمز الكارنيه (QR)</th>
            <th style="width:8%;">حضور</th>
            <th style="width:8%;">غياب</th>
            <th style="width:8%;">النسبة</th>
            <th style="width:6%;">الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${summaryTableRows}
        </tbody>
      </table>

      <div class="section-title">📋 ثانياً: السجل التفصيلي اليومي الدقيق لكل طالب على حدة (بالتواريخ والأقسام والأوقات)</div>
      ${studentDetailSectionsHtml}

      <div class="footer">
        <strong>كنيسة مارمينا العجايبي بكوم المحرص — إعداد خدام</strong><br>
        تم استخراج هذا التقرير الشامل التفصيلي آلياً عبر نظام إدارة الحضور الذكي
      </div>
    </body>
    </html>
  `;

  downloadWordFile(wordContent, `التقرير_الشامل_التفصيلي_${new Date().toISOString().split('T')[0]}.doc`);
  await logActivity("تصدير تقرير Word شامل تفصيلي لجميع الطلاب", { totalStudents: students.length }, null, "report_export");
}

export function downloadWordFile(htmlString, fileName) {
  if (typeof document === 'undefined') return;
  const blob = new Blob(['\ufeff', htmlString], {
    type: 'application/msword;charset=utf-8'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   Stage Group Reports & Dynamic Occurrence Calculations
   ========================================================================== */

export const REPORT_SERVICES = [
  { id: "vespers", name: "صلاة العشية", shortName: "العشية", days: ["saturday"], part: "vespers" },
  { id: "mass", name: "القداس الإلهي", shortName: "القداس", days: ["sunday", "wednesday", "friday"], part: "mass" },
  { id: "marathon", name: "الماراثون", shortName: "ماراثون", days: ["monday", "tuesday"], part: "marathon" },
  { id: "tasbeha", name: "التسبيحة", shortName: "تسبيحة", days: ["thursday"], part: "tasbeha" },
  { id: "lecture1", name: "محاضرة 1", shortName: "محاضرة 1", fullName: "المحاضرة (الخميس)", days: ["thursday"], part: "lecture1" },
  { id: "spiritualNotebook", name: "النوتة الروحية", shortName: "النوتة الروحية", days: ["thursday"], part: "spiritualNotebook" },
  { id: "lecture2", name: "محاضرة 2", shortName: "محاضرة 2", fullName: "المحاضرة (الجمعة)", days: ["friday"], part: "lecture2" },
  { id: "lesson", name: "درس الخدمة", shortName: "درس الخدمة", days: ["friday"], part: "lesson" }
];

function recordMatchesService(record, svc) {
  if (!record) return false;
  if (record.part === svc.part || record.part === svc.id) return true;
  if (svc.days && svc.days.includes(record.day)) {
    if (record.partName && record.partName.includes(svc.name)) return true;
  }
  return false;
}

function normalizeDateRange(startDateIso, endDateIso) {
  let start = startDateIso;
  let end = endDateIso;
  const today = new Date().toISOString().split("T")[0];

  if (!end) end = today;
  if (!start) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    start = d.toISOString().split("T")[0];
  }
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { start, end };
}

/**
 * Calculates attendance statistics for a specific Stage Group across a dynamic date period
 */
export async function calculateStageGroupReportData(groupId = "group1", startDateIso = null, endDateIso = null) {
  const { start, end } = normalizeDateRange(startDateIso, endDateIso);
  const allStudents = await getAllStudents();
  const allAttendance = getDemoAttendance();
  const group = STAGE_GROUPS[groupId] || (groupId === "all" ? { id: "all", name: "كافة المراحل (شامل)", shortName: "كافة المراحل", stages: STAGES } : STAGE_GROUPS.group1);

  // 1. Scheduled service occurrences in this specific calendar period
  const occurrences = calculateServiceOccurrencesInPeriod(start, end);

  // 2. Filter students belonging to this group's stages
  const groupStudents = (groupId === "all")
    ? allStudents
    : allStudents.filter(s => {
        const stage = mapLegacyGradeToStage(s.stage || s.grade || "");
        return group.stages.includes(stage);
      });

  // 3. Calculate per-student stats
  const studentsReport = groupStudents.map(student => {
    // Records for this student within date range
    const studentRecords = allAttendance.filter(r => {
      if (r.studentId !== student.studentId) return false;
      const recDate = r.dateIso || (r.timestamp ? r.timestamp.split("T")[0] : null) || (r.weekId && r.day ? getActualDayDate(r.weekId, r.day).dateIso : null);
      if (!recDate) return false;
      return recDate >= start && recDate <= end && r.status === "present";
    });

    const services = {};
    let studentTotalAttended = 0;

    REPORT_SERVICES.forEach(svc => {
      const scheduledCount = occurrences[svc.id] || 0;
      const attendedCount = studentRecords.filter(r => recordMatchesService(r, svc)).length;
      studentTotalAttended += attendedCount;

      services[svc.id] = {
        id: svc.id,
        serviceId: svc.id,
        name: svc.name,
        serviceName: svc.name,
        shortName: svc.shortName,
        scheduledCount,
        attendedCount,
        ratioText: scheduledCount > 0 ? `${attendedCount} / ${scheduledCount}` : "—",
        rate: scheduledCount > 0 ? Math.round((attendedCount / scheduledCount) * 100) : 0
      };
    });

    const totalScheduled = occurrences.totalScheduledSessions || 0;
    const overallRate = totalScheduled > 0 ? Math.round((studentTotalAttended / totalScheduled) * 100) : 0;

    return {
      studentId: student.studentId,
      studentCode: student.studentCode || student.studentId,
      name: student.name,
      stage: mapLegacyGradeToStage(student.stage || student.grade || ""),
      phone: student.phone || "",
      status: student.status || "active",
      services,
      totalAttended: studentTotalAttended,
      totalScheduled,
      overallRate
    };
  });

  // Sort students alphabetically
  studentsReport.sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const totalPossible = studentsReport.length * (occurrences.totalScheduledSessions || 0);
  const totalAttendedAll = studentsReport.reduce((acc, s) => acc + s.totalAttended, 0);
  const groupRate = totalPossible > 0 ? Math.round((totalAttendedAll / totalPossible) * 100) : 0;

  return {
    group,
    groupId,
    startDateIso: start,
    endDateIso: end,
    startDateArabic: formatDateArabic(new Date(`${start}T00:00:00`)),
    endDateArabic: formatDateArabic(new Date(`${end}T00:00:00`)),
    occurrences,
    services: REPORT_SERVICES.map(svc => ({
      ...svc,
      scheduledCount: occurrences[svc.id] || 0
    })),
    students: studentsReport,
    stats: {
      totalStudents: studentsReport.length,
      activeStudents: studentsReport.filter(s => s.status === "active").length,
      totalScheduledPerStudent: occurrences.totalScheduledSessions || 0,
      totalAttendedAll,
      totalPossible,
      groupRate
    }
  };
}

/**
 * Exports official Microsoft Word (.doc) report for a specific Stage Group
 */
export async function exportStageGroupWordReport(groupId = "group1", startDateIso = null, endDateIso = null) {
  const reportData = await calculateStageGroupReportData(groupId, startDateIso, endDateIso);
  const { group, startDateArabic, endDateArabic, services, students, stats } = reportData;
  const currentDate = formatDateArabic(new Date());

  // Service headers with scheduled count
  const serviceHeadersHtml = services.map(s => `
    <th style="padding:6px 3px; border:1px solid #1e1b4b; background:#1e1b4b; color:#fbbf24; text-align:center; font-size:8.5pt;">
      ${s.name}<br>
      <small style="color:#ffffff; font-size:7.5pt;">(${s.scheduledCount})</small>
    </th>
  `).join("");

  // Table rows for students
  let tableRows = "";
  students.forEach((s, idx) => {
    const rateColor = s.overallRate >= 75 ? "#059669" : s.overallRate >= 50 ? "#d97706" : "#dc2626";

    const serviceCellsHtml = services.map(svc => {
      const sData = s.services[svc.id];
      const attended = sData?.attendedCount || 0;
      const scheduled = svc.scheduledCount || 0;
      if (scheduled === 0) {
        return `<td style="padding:5px 3px; border:1px solid #cbd5e1; text-align:center; color:#94a3b8;">—</td>`;
      }
      const cellColor = attended > 0 ? "#059669" : "#dc2626";
      const cellBg = attended > 0 ? "#f0fdf4" : "#fef2f2";
      return `
        <td style="padding:5px 3px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:${cellColor}; background:${cellBg}; font-size:8.5pt;">
          ${attended} / ${scheduled}
        </td>
      `;
    }).join("");

    tableRows += `
      <tr>
        <td style="padding:5px 3px; border:1px solid #cbd5e1; text-align:center; font-weight:bold;">${idx + 1}</td>
        <td style="padding:5px 3px; border:1px solid #cbd5e1; text-align:center; font-family:monospace; font-weight:bold; color:#b45309;">${s.studentCode}</td>
        <td style="padding:5px 4px; border:1px solid #cbd5e1; font-weight:bold; color:#1e1b4b; text-align:right;">${s.name}</td>
        <td style="padding:5px 3px; border:1px solid #cbd5e1; text-align:center; font-size:8pt; background:#f8fafc;">${s.stage}</td>
        ${serviceCellsHtml}
        <td style="padding:5px 3px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:#4338ca;">${s.totalAttended} / ${s.totalScheduled}</td>
        <td style="padding:5px 3px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:${rateColor};">${s.overallRate}%</td>
      </tr>
    `;
  });

  if (!tableRows) {
    tableRows = `<tr><td colspan="${services.length + 6}" style="text-align:center; padding:15px; color:#64748b;">لا يوجد طلاب مسجلون في هذه المجموعة</td></tr>`;
  }

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>تقرير حضور مرحلة - ${group.name}</title>
      <style>
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background-color: #ffffff; color: #1e293b; margin: 20px; }
        .header { text-align: center; border-bottom: 2px solid #4338ca; padding-bottom: 12px; margin-bottom: 18px; }
        .header h1 { color: #1e1b4b; font-size: 20pt; margin: 0 0 4px 0; font-weight: 800; }
        .header h2 { color: #b45309; font-size: 14pt; margin: 0 0 6px 0; font-weight: 700; }
        .header h3 { color: #4338ca; font-size: 12.5pt; margin: 0; }
        .kpi-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; text-align: center; }
        .kpi-table th { background: #3730a3; color: white; padding: 7px; border: 1px solid #3730a3; font-size: 9.5pt; }
        .kpi-table td { padding: 9px; border: 1px solid #cbd5e1; font-size: 11pt; font-weight: bold; background: #f8fafc; }
        .master-table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-size: 8.5pt; }
        .master-table th { background: #1e1b4b; color: #fbbf24; padding: 6px 3px; border: 1px solid #1e1b4b; text-align: center; }
        .footer { text-align: center; font-size: 9pt; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>كنيسة مارمينا العجايبي بكوم المحرص</h1>
        <h2>إعداد خدام</h2>
        <h3>تقرير حضور وغياب ${group.name}</h3>
        <p style="margin: 6px 0 0 0; color: #64748b; font-size: 9.5pt;">
          الفترة: من <strong>${startDateArabic}</strong> إلى <strong>${endDateArabic}</strong> | تاريخ الاستخراج: <strong>${currentDate}</strong>
        </p>
      </div>

      <table class="kpi-table">
        <tr>
          <th>عدد طلاب المجموعة</th>
          <th>عدد الجلسات المجدولة في الفترة</th>
          <th>إجمالي حضور الطلاب</th>
          <th>إجمالي الفرص الممكنة</th>
          <th>نسبة التزام المجموعة</th>
        </tr>
        <tr>
          <td>${stats.totalStudents}</td>
          <td style="color:#b45309;">${stats.totalScheduledPerStudent}</td>
          <td style="color:#059669;">${stats.totalAttendedAll}</td>
          <td>${stats.totalPossible}</td>
          <td style="color:#4338ca; font-size:13pt;">${stats.groupRate}%</td>
        </tr>
      </table>

      <div style="font-size:10.5pt; font-weight:bold; color:#1e1b4b; margin-bottom:6px;">
        📊 مصفوفة الحضور الفعلية بالخدمات (العدد الفعلي للحضور / العدد المجدول للخدمة في الفترة):
      </div>

      <table class="master-table">
        <thead>
          <tr>
            <th style="width:3%;">م</th>
            <th style="width:10%;">كود الطالب</th>
            <th style="width:18%;">اسم الطالب</th>
            <th style="width:11%;">المرحلة</th>
            ${serviceHeadersHtml}
            <th style="width:7%;">الإجمالي</th>
            <th style="width:5%;">النسبة</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="footer">
        <strong>كنيسة مارمينا العجايبي بكوم المحرص — إعداد خدام</strong><br>
        تم استخراج هذا التقرير آلياً وفقاً للمراحل المعتمدة والفترات الزمنية المحددة بدقة
      </div>
    </body>
    </html>
  `;

  const fileName = `تقرير_مرحلة_${group.shortName.replace(/\s+/g, '_')}_${reportData.startDateIso}_إلى_${reportData.endDateIso}.doc`;
  downloadWordFile(wordContent, fileName);
  await logActivity("تصدير تقرير مرحلة Word", { groupName: group.name, startDate: reportData.startDateIso, endDate: reportData.endDateIso, studentsCount: students.length }, null, "report_export");
}

/**
 * Calculates a concise brief attendance report for a Single Student across a selected period
 * Returns only service names, attended count, and scheduled count
 */
export async function calculateSingleStudentBriefReport(studentId, startDateIso = null, endDateIso = null) {
  const { start, end } = normalizeDateRange(startDateIso, endDateIso);
  const student = await getStudentById(studentId);
  if (!student) return null;

  const allAttendance = getDemoAttendance();
  const occurrences = calculateServiceOccurrencesInPeriod(start, end);

  // Filter student's present records within period
  const studentRecords = allAttendance.filter(r => {
    if (r.studentId !== studentId) return false;
    const recDate = r.dateIso || (r.timestamp ? r.timestamp.split("T")[0] : null) || (r.weekId && r.day ? getActualDayDate(r.weekId, r.day).dateIso : null);
    if (!recDate) return false;
    return recDate >= start && recDate <= end && r.status === "present";
  });

  let totalAttended = 0;
  const services = REPORT_SERVICES.map(svc => {
    const scheduledCount = occurrences[svc.id] || 0;
    const attendedCount = studentRecords.filter(r => recordMatchesService(r, svc)).length;
    totalAttended += attendedCount;
    const rate = scheduledCount > 0 ? Math.round((attendedCount / scheduledCount) * 100) : 0;

    return {
      id: svc.id,
      serviceId: svc.id,
      name: svc.name,
      serviceName: svc.name,
      shortName: svc.shortName,
      scheduledCount,
      attendedCount,
      ratioText: scheduledCount > 0 ? `${attendedCount} / ${scheduledCount}` : "—",
      rate
    };
  });

  const totalScheduled = occurrences.totalScheduledSessions || 0;
  const overallRate = totalScheduled > 0 ? Math.round((totalAttended / totalScheduled) * 100) : 0;

  return {
    student: {
      ...student,
      stage: mapLegacyGradeToStage(student.stage || student.grade || "")
    },
    startDateIso: start,
    endDateIso: end,
    startDateArabic: formatDateArabic(new Date(`${start}T00:00:00`)),
    endDateArabic: formatDateArabic(new Date(`${end}T00:00:00`)),
    occurrences,
    services,
    totalAttended,
    totalScheduled,
    overallRate
  };
}

/**
 * Generates and downloads a Concise Brief Microsoft Word (.doc) report for a Single Student
 * Shows only student name, stage, selected period, and services with attended counts
 */
export async function exportSingleStudentBriefWordReport(studentId, startDateIso = null, endDateIso = null) {
  const briefData = await calculateSingleStudentBriefReport(studentId, startDateIso, endDateIso);
  if (!briefData) return;

  const { student, startDateArabic, endDateArabic, services, totalAttended, totalScheduled, overallRate } = briefData;
  const currentDate = formatDateArabic(new Date());

  const serviceRowsHtml = services.map((s, idx) => {
    const statusColor = s.attendedCount > 0 ? "#059669" : "#dc2626";
    const statusBadge = s.attendedCount > 0 
      ? `<span style="color:#059669; font-weight:bold;">${s.attendedCount} مرة</span>` 
      : `<span style="color:#dc2626; font-weight:bold;">0 مرة</span>`;

    return `
      <tr>
        <td style="padding:8px 10px; border:1px solid #cbd5e1; text-align:center; font-weight:bold;">${idx + 1}</td>
        <td style="padding:8px 12px; border:1px solid #cbd5e1; font-weight:bold; color:#1e1b4b; text-align:right;">${s.serviceName}</td>
        <td style="padding:8px 12px; border:1px solid #cbd5e1; text-align:center;">${statusBadge}</td>
        <td style="padding:8px 12px; border:1px solid #cbd5e1; text-align:center; color:#475569; font-weight:bold;">${s.scheduledCount}</td>
        <td style="padding:8px 12px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:${statusColor}; font-size:10pt;">${s.ratioText}</td>
      </tr>
    `;
  }).join("");

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>تقرير حضور مختصر - ${student.name}</title>
      <style>
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background-color: #ffffff; color: #1e293b; margin: 30px; }
        .header { text-align: center; border-bottom: 2px solid #4338ca; padding-bottom: 12px; margin-bottom: 18px; }
        .header h1 { color: #1e1b4b; font-size: 20pt; margin: 0 0 4px 0; font-weight: 800; }
        .header h2 { color: #b45309; font-size: 14pt; margin: 0 0 6px 0; font-weight: 700; }
        .header h3 { color: #4338ca; font-size: 12pt; margin: 0; }
        .meta-box { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .meta-box td { padding: 9px 12px; border: 1.5px solid #cbd5e1; background: #f8fafc; font-size: 11pt; }
        .meta-label { font-weight: bold; color: #4338ca; width: 22%; background: #e0e7ff !important; }
        .services-table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; font-size: 10pt; }
        .services-table th { background: #1e1b4b; color: #fbbf24; padding: 9px 12px; border: 1px solid #1e1b4b; text-align: center; font-size: 10.5pt; }
        .total-box { margin-top: 20px; padding: 12px; background: #eef2ff; border: 1.5px solid #4338ca; border-radius: 6px; text-align: center; font-size: 12pt; font-weight: bold; color: #1e1b4b; }
        .footer { text-align: center; font-size: 9pt; color: #64748b; margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>كنيسة مارمينا العجايبي بكوم المحرص</h1>
        <h2>إعداد خدام</h2>
        <h3>تقرير الحضور والغياب المختصر للطالب</h3>
      </div>

      <table class="meta-box">
        <tr>
          <td class="meta-label">اسم الطالب:</td>
          <td><strong style="font-size:13pt; color:#1e1b4b;">${student.name}</strong></td>
          <td class="meta-label">المرحلة:</td>
          <td><strong style="color:#059669;">${student.stage}</strong></td>
        </tr>
        <tr>
          <td class="meta-label">كود الطالب:</td>
          <td><strong style="color:#b45309; font-family:monospace;">${student.studentCode || student.studentId}</strong></td>
          <td class="meta-label">الفترة المحددة:</td>
          <td>من <strong>${startDateArabic}</strong> إلى <strong>${endDateArabic}</strong></td>
        </tr>
      </table>

      <div style="font-size:11pt; font-weight:bold; color:#1e1b4b; margin-bottom:8px;">
        📋 عدد مرات حضور الخدمات خلال الفترة المحددة:
      </div>

      <table class="services-table">
        <thead>
          <tr>
            <th style="width:6%;">م</th>
            <th style="width:36%;">اسم الخدمة</th>
            <th style="width:20%;">مرات الحضور</th>
            <th style="width:20%;">إجمالي عدد مرات الخدمة</th>
            <th style="width:18%;">النسبة (حضور / إجمالي)</th>
          </tr>
        </thead>
        <tbody>
          ${serviceRowsHtml}
        </tbody>
      </table>

      <div class="total-box">
        إجمالي الحضور لجميع الخدمات في هذه الفترة: 
        <span style="color:#059669;">${totalAttended}</span> من أصل <span style="color:#b45309;">${totalScheduled}</span> جلسة 
        (<span style="color:#4338ca;">${overallRate}%</span>)
      </div>

      <div class="footer">
        <strong>كنيسة مارمينا العجايبي بكوم المحرص — إعداد خدام</strong><br>
        تاريخ استخراج التقرير: ${currentDate}
      </div>
    </body>
    </html>
  `;

  const fileName = `تقرير_مختصر_${student.name.replace(/\s+/g, '_')}_${briefData.startDateIso}_إلى_${briefData.endDateIso}.doc`;
  downloadWordFile(wordContent, fileName);
  await logActivity("تصدير تقرير مختصر لطالب Word", { studentName: student.name, studentId, startDate: briefData.startDateIso, endDate: briefData.endDateIso }, studentId, "report_export");
}

