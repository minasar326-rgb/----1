/**
 * Church QR Attendance System - Comprehensive Security & Protection Module
 * XSS Sanitization, Input Validation, Rate Limiting / Cooldown, Brute-Force & Session Protection
 */

/* ==========================================================================
   1. XSS (Cross-Site Scripting) Sanitization & Escaping
   ========================================================================== */

/**
 * Escapes HTML characters to prevent XSS injection in DOM rendering
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  const s = String(str);
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;"
  };
  return s.replace(/[&<>"'/]/g, m => map[m]);
}

/**
 * Strips out dangerous HTML tags, script patterns, and protocol attacks (e.g. javascript:)
 */
export function sanitizeInput(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    .trim();
}

/* ==========================================================================
   2. Input Validation Rules
   ========================================================================== */

/**
 * Validates Student Name (Min 2 chars, Max 100 chars, no forbidden symbols)
 */
export function validateName(name) {
  if (!name || typeof name !== "string") return { valid: false, message: "اسم الطالب مطلوب" };
  const clean = sanitizeInput(name);
  if (clean.length < 2) return { valid: false, message: "اسم الطالب يجب أن يكون حرفين على الأقل" };
  if (clean.length > 100) return { valid: false, message: "اسم الطالب طويل جداً (الحد الأقصى 100 حرف)" };
  if (/[<>{}[\]\\]/.test(clean)) return { valid: false, message: "يحتوي الاسم على رموز غير مسموح بها" };
  return { valid: true, clean };
}

/**
 * Validates Student Code format (Supports all barcodes, QR formats, English, Arabic, Numbers, 1-100 chars)
 */
export function validateStudentCode(code) {
  if (!code || typeof code !== "string") return { valid: false, message: "كود الطالب مطلوب" };
  const clean = sanitizeInput(code).trim();
  if (clean.length < 1) return { valid: false, message: "كود الطالب مطلوب" };
  if (clean.length > 100) return { valid: false, message: "كود الطالب طويل جداً" };
  if (/[<>{}[\]\\]/.test(clean)) return { valid: false, message: "كود الطالب يحتوي على رموز غير مسموحة" };
  return { valid: true, clean };
}

/**
 * Validates Phone number (Optional, but if provided must match phone pattern)
 */
export function validatePhone(phone) {
  if (!phone) return { valid: true, clean: "" };
  const clean = String(phone).replace(/\s+/g, "").trim();
  const phoneRegex = /^[0-9+\-]{8,16}$/;
  if (!phoneRegex.test(clean)) {
    return { valid: false, message: "رقم الهاتف غير صالح" };
  }
  return { valid: true, clean };
}

/* ==========================================================================
   3. QR Scan Cooldown & Rate Limiting (Replay & Double-Scan Protection)
   ========================================================================== */

class CooldownManager {
  constructor(cooldownMs = 3000) {
    this.cooldownMs = cooldownMs;
    this.recentKeys = new Map();
  }

  /**
   * Checks if an action with the given key is throttled. If not, locks it for cooldown period.
   * @param {string} key Unique action key (e.g. studentId or qrId)
   * @returns {boolean} True if allowed, False if throttled (in cooldown)
   */
  checkAndLock(key) {
    const now = Date.now();
    const lastTime = this.recentKeys.get(key);
    if (lastTime && (now - lastTime) < this.cooldownMs) {
      const remainingSec = Math.ceil((this.cooldownMs - (now - lastTime)) / 1000);
      return { allowed: false, remainingSec };
    }
    this.recentKeys.set(key, now);
    
    // Cleanup old keys periodically
    if (this.recentKeys.size > 500) {
      for (const [k, t] of this.recentKeys.entries()) {
        if (now - t > this.cooldownMs * 2) {
          this.recentKeys.delete(k);
        }
      }
    }
    return { allowed: true, remainingSec: 0 };
  }
}

export const scanCooldown = new CooldownManager(3000);

/* ==========================================================================
   4. Brute-Force Login Defense & Account Lockout
   ========================================================================== */

const BRUTE_FORCE_KEY = "attendance_qr_login_attempts";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
let memoryBruteForceStore = null;

export function getLoginSecurityState() {
  try {
    let raw = null;
    if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(BRUTE_FORCE_KEY);
    } else {
      raw = memoryBruteForceStore;
    }

    if (!raw) return { isLocked: false, attempts: 0 };
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const now = Date.now();
    if (state.lockedUntil && now < state.lockedUntil) {
      const remainingMinutes = Math.ceil((state.lockedUntil - now) / 60000);
      return { isLocked: true, remainingMinutes, attempts: state.attempts };
    }
    if (state.lockedUntil && now >= state.lockedUntil) {
      // Lockout expired, reset
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(BRUTE_FORCE_KEY);
      }
      memoryBruteForceStore = null;
      return { isLocked: false, attempts: 0 };
    }
    return { isLocked: false, attempts: state.attempts || 0 };
  } catch (e) {
    return { isLocked: false, attempts: 0 };
  }
}

export function recordFailedLoginAttempt() {
  try {
    const current = getLoginSecurityState();
    const attempts = current.attempts + 1;
    const now = Date.now();
    let lockedUntil = null;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    const data = JSON.stringify({ attempts, lockedUntil, lastAttempt: now });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BRUTE_FORCE_KEY, data);
    }
    memoryBruteForceStore = data;
  } catch (e) {}
}

export function resetLoginAttempts() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(BRUTE_FORCE_KEY);
    }
    memoryBruteForceStore = null;
  } catch (e) {}
}

/* ==========================================================================
   5. Auto-Lock Inactivity Sensor
   ========================================================================== */

let autoLockTimeoutId = null;
let isScreenLocked = false;

export function initInactivityLock(timeoutMinutes = 15, onLockCallback) {
  if (typeof window === 'undefined') return;
  const timeoutMs = timeoutMinutes * 60 * 1000;

  function resetTimer() {
    if (isScreenLocked) return;
    if (autoLockTimeoutId) clearTimeout(autoLockTimeoutId);
    autoLockTimeoutId = setTimeout(() => {
      isScreenLocked = true;
      if (typeof onLockCallback === 'function') {
        onLockCallback();
      }
    }, timeoutMs);
  }

  ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  resetTimer();
}

export function unlockScreen() {
  isScreenLocked = false;
}
