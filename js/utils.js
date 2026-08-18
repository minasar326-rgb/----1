/**
 * Church QR Attendance System - Utilities & Helpers
 */

/* ==========================================================================
   Constants & Part Definitions
   ========================================================================== */

export const GRADES = [
  "حضانة",
  "ابتدائي - أولى وتانية",
  "ابتدائي - تالتة ورابعة",
  "ابتدائي - خامسة وسادسة",
  "إعدادي - أولى إعدادي",
  "إعدادي - ثانية إعدادي",
  "إعدادي - ثالثة إعدادي",
  "ثانوي - أولى ثانوي",
  "ثانوي - ثانية ثانوي",
  "ثانوي - ثالثة ثانوي",
  "جامعيين وخريجين",
  "خدام وخادمات"
];

export const ATTENDANCE_PARTS = {
  saturday: [
    { id: "vespers", name: "صلاة العشية", icon: "fa-church", defaultStart: "18:30", defaultEnd: "20:00" }
  ],
  sunday: [
    { id: "mass", name: "القداس الإلهي", icon: "fa-cross", defaultStart: "07:30", defaultEnd: "10:30" }
  ],
  monday: [
    { id: "marathon", name: "الماراثون", icon: "fa-person-running", defaultStart: "18:00", defaultEnd: "20:00" }
  ],
  tuesday: [
    { id: "marathon", name: "الماراثون", icon: "fa-person-running", defaultStart: "18:00", defaultEnd: "20:00" }
  ],
  wednesday: [
    { id: "mass", name: "القداس الإلهي", icon: "fa-cross", defaultStart: "07:00", defaultEnd: "09:30" }
  ],
  thursday: [
    { id: "tasbeha", name: "التسبيحة", icon: "fa-music", defaultStart: "18:00", defaultEnd: "19:00" },
    { id: "lecture1", name: "المحاضرة", icon: "fa-book-open", defaultStart: "19:00", defaultEnd: "20:30" },
    { id: "spiritualNotebook", name: "النوتة الروحية", icon: "fa-feather", defaultStart: "20:30", defaultEnd: "21:00", oncePerWeek: true }
  ],
  friday: [
    { id: "mass", name: "القداس الإلهي", icon: "fa-cross", defaultStart: "08:00", defaultEnd: "11:00" },
    { id: "lecture2", name: "المحاضرة", icon: "fa-graduation-cap", defaultStart: "11:00", defaultEnd: "12:30" },
    { id: "lesson", name: "درس الخدمة", icon: "fa-book-bible", defaultStart: "12:30", defaultEnd: "13:30" }
  ]
};

export const CHURCH_INFO = {
  name: "كنيسة مارمينا العجايبي بكوم المحرص",
  subtitle: "إعداد خدام"
};

export const ALL_DAYS = [
  { id: "saturday", name: "السبت", shortName: "سبت", icon: "fa-calendar-day" },
  { id: "sunday", name: "الأحد", shortName: "أحد", icon: "fa-church" },
  { id: "monday", name: "الإثنين", shortName: "إثنين", icon: "fa-person-running" },
  { id: "tuesday", name: "الثلاثاء", shortName: "ثلاثاء", icon: "fa-person-running" },
  { id: "wednesday", name: "الأربعاء", shortName: "أربعاء", icon: "fa-cross" },
  { id: "thursday", name: "الخميس", shortName: "خميس", icon: "fa-calendar-day" },
  { id: "friday", name: "الجمعة", shortName: "جمعة", icon: "fa-cross" }
];

export const SERVICE_DAYS = ALL_DAYS;

/* ==========================================================================
   Date & Multi-Year Week Calculation Helpers (2024 -> 2030)
   ========================================================================== */

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

/**
 * Calculates the ISO-8601 week number and returns Week ID (e.g. 2026-W33, 2027-W12, 2030-W45)
 */
export function getWeekDetails(targetDate = new Date()) {
  const d = typeof targetDate === "string" && !targetDate.includes("T") 
    ? new Date(`${targetDate}T12:00:00Z`) 
    : new Date(targetDate);

  const utcDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  const year = utcDate.getUTCFullYear();
  const weekId = `${year}-W${String(weekNo).padStart(2, '0')}`;

  // Calculate Start Date (Saturday) and End Date (Friday) for Church Week
  const simple = new Date(year, 0, 1 + (weekNo - 1) * 7);
  const dow = simple.getDay();
  const weekStart = new Date(simple);
  if (dow <= 6) {
    weekStart.setDate(simple.getDate() - simple.getDay() - 1);
  } else {
    weekStart.setDate(simple.getDate() + 6);
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startMonthName = ARABIC_MONTHS[weekStart.getMonth()];
  const endMonthName = ARABIC_MONTHS[weekEnd.getMonth()];

  return {
    weekId,
    year,
    weekNumber: weekNo,
    startDate: weekStart.toISOString().split('T')[0],
    endDate: weekEnd.toISOString().split('T')[0],
    startDateArabic: `${weekStart.getDate()} ${startMonthName} ${weekStart.getFullYear()}`,
    endDateArabic: `${weekEnd.getDate()} ${endMonthName} ${weekEnd.getFullYear()}`,
    label: `الأسبوع ${weekNo} (${year}) — من ${weekStart.getDate()} ${startMonthName} إلى ${weekEnd.getDate()} ${endMonthName}`
  };
}

export function getCurrentWeekId() {
  return getWeekDetails().weekId;
}

/**
 * Returns exact date string (YYYY-MM-DD) for a specific day in a given week
 */
export function getActualDayDate(weekId, dayId) {
  if (!weekId) weekId = getCurrentWeekId();
  const parts = weekId.split('-W');
  const year = parseInt(parts[0], 10) || new Date().getFullYear();
  const weekNo = parseInt(parts[1], 10) || 1;

  // Day offsets from Saturday: Saturday=0, Sunday=1, Monday=2, Tuesday=3, Wednesday=4, Thursday=5, Friday=6
  const dayOffsets = {
    saturday: 0,
    sunday: 1,
    monday: 2,
    tuesday: 3,
    wednesday: 4,
    thursday: 5,
    friday: 6
  };

  const simple = new Date(year, 0, 1 + (weekNo - 1) * 7);
  const dow = simple.getDay();
  const weekStart = new Date(simple);
  weekStart.setDate(simple.getDate() - ((dow + 1) % 7));

  const targetDate = new Date(weekStart);
  targetDate.setDate(weekStart.getDate() + (dayOffsets[dayId] !== undefined ? dayOffsets[dayId] : 0));

  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  const monthArabic = ARABIC_MONTHS[targetDate.getMonth()];

  return {
    dateIso: `${y}-${m}-${d}`,
    dateArabic: `${targetDate.getDate()} ${monthArabic} ${y}`,
    dayName: ALL_DAYS.find(day => day.id === dayId)?.name || dayId
  };
}

/**
 * Generates all weeks from 2024 through 2030 with full dates
 */
export function getPastWeeks(count = 52, futureCount = 200) {
  const list = [];
  const currentWeek = getCurrentWeekId();

  // Generate weeks from 2024 to 2030
  for (let year = 2030; year >= 2024; year--) {
    const totalWeeksInYear = 52;
    for (let w = totalWeeksInYear; w >= 1; w--) {
      const weekId = `${year}-W${String(w).padStart(2, '0')}`;
      
      const simple = new Date(year, 0, 1 + (w - 1) * 7);
      const dow = simple.getDay();
      const weekStart = new Date(simple);
      weekStart.setDate(simple.getDate() - ((dow + 1) % 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const startMonth = ARABIC_MONTHS[weekStart.getMonth()];
      const endMonth = ARABIC_MONTHS[weekEnd.getMonth()];

      list.push({
        weekId,
        year,
        weekNumber: w,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        startDateArabic: `${weekStart.getDate()} ${startMonth} ${weekStart.getFullYear()}`,
        endDateArabic: `${weekEnd.getDate()} ${endMonth} ${weekEnd.getFullYear()}`,
        label: `الأسبوع ${w} (${year}) — من ${weekStart.getDate()} ${startMonth} إلى ${weekEnd.getDate()} ${endMonth}`,
        isCurrent: weekId === currentWeek
      });
    }
  }

  return list;
}

export function formatDateArabic(dateInput) {
  if (!dateInput) return "—";
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function formatDateTimeArabic(dateInput) {
  if (!dateInput) return "—";
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    day: 'numeric',
    month: 'short'
  }).format(date);
}

/* ==========================================================================
   Web Audio API Beep Synthesizer (Instant Offline Sound)
   ========================================================================== */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playSuccessBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
    
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.25);

    // Trigger haptic vibration on mobile
    if (navigator.vibrate) {
      navigator.vibrate([60, 40, 80]);
    }
  } catch (e) {
    console.warn("Audio play error", e);
  }
}

export function playErrorBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
    osc.frequency.setValueAtTime(160, ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.35);

    if (navigator.vibrate) {
      navigator.vibrate(250);
    }
  } catch (e) {
    console.warn("Audio play error", e);
  }
}

/* ==========================================================================
   Toast Notification System
   ========================================================================== */

export function showToast(message, type = 'success', duration = 3500) {
  if (typeof document === 'undefined') {
    console.log(`[Toast ${type}]:`, message);
    return;
  }

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'fa-circle-check text-success',
    error: 'fa-circle-xmark text-danger',
    warning: 'fa-triangle-exclamation text-warning',
    info: 'fa-circle-info text-primary'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
    <div class="toast-message">${message}</div>
    <button class="toast-close" aria-label="إغلاق">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.style.animation = 'fadeOutLeft 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'fadeOutLeft 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

/* ==========================================================================
   Modal Helpers
   ========================================================================== */

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Global modal background click close
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('active');
      document.body.style.overflow = '';
    }
    if (e.target.closest('[data-modal-close]')) {
      const modal = e.target.closest('.modal-backdrop');
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    }
  });
}
