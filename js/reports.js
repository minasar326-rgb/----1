/**
 * Church QR Attendance System - Reports & Microsoft Word (.docx/.doc) Exporter
 * Official Branding: كنيسة مارمينا العجايبي بكوم المحرص - إعداد خدام
 * Full 7-Day Attendance Matrix & Multi-Year Calendar Exporter (2024 - 2030)
 */

import { getAllStudents, getStudentById } from "./students.js";
import { getStudentAttendanceHistory, getWeekAttendance, getWeeklyAttendanceMatrix, getPartName } from "./attendance.js";
import { formatDateArabic, getWeekDetails, getCurrentWeekId, getActualDayDate, CHURCH_INFO, ALL_DAYS, ATTENDANCE_PARTS } from "./utils.js";
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

function downloadWordFile(htmlString, fileName) {
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
