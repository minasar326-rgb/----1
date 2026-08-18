/**
 * Church QR Attendance System - Authentication & Route Guards
 */

import { 
  auth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  isDemoMode,
  setDemoModeState
} from "./firebase-config.js";
import { showToast } from "./utils.js";

// Session Key for Demo / Offline Mode
const DEMO_AUTH_KEY = "church_attendance_demo_user";

const DEFAULT_DEMO_ADMIN = {
  uid: "demo-admin-001",
  email: "admin@marinachurch.org",
  displayName: "مسؤول النظام (خادم)",
  role: "admin"
};

const DEMO_LOGIN_EMAIL = "admin@marinachurch.org";
const DEMO_LOGIN_PASSWORD = "M@rina2026";

export function getCurrentUser() {
  if (isDemoMode) {
    try {
      if (typeof localStorage !== 'undefined') {
        let saved = localStorage.getItem(DEMO_AUTH_KEY);
        if (!saved) {
          localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(DEFAULT_DEMO_ADMIN));
          return DEFAULT_DEMO_ADMIN;
        }
        return JSON.parse(saved);
      }
    } catch (e) {}
    return DEFAULT_DEMO_ADMIN;
  }
  return auth ? auth.currentUser : DEFAULT_DEMO_ADMIN;
}

/**
 * Route Guard: Ensures user is authenticated for protected admin pages
 */
export function requireAuth() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  const user = getCurrentUser();

  if (isDemoMode) {
    if (!user && !isLoginPage) {
      window.location.replace('login.html');
    } else if (user && isLoginPage) {
      // If already on login page and logged in, allow them to stay or redirect to dashboard
    } else if (user) {
      updateUserUI(user);
    }
    return;
  }

  if (auth) {
    onAuthStateChanged(auth, async (authUser) => {
      if (!authUser && !isLoginPage) {
        window.location.replace('login.html');
      } else if (authUser && isLoginPage) {
        window.location.replace('dashboard.html');
      } else if (authUser) {
        updateUserUI(authUser);
      }
    });
  }
}

/**
 * Updates Topbar/Sidebar user info
 */
export function updateUserUI(user) {
  if (!user) return;
  const email = user.email || "admin@marinachurch.org";
  const displayName = user.displayName || email.split('@')[0] || "مسؤول النظام";
  
  const nameEls = document.querySelectorAll('.user-name, [data-user-name]');
  const emailEls = document.querySelectorAll('.user-role, [data-user-email]');
  const avatarEls = document.querySelectorAll('.user-avatar, [data-user-avatar]');

  nameEls.forEach(el => el.textContent = displayName);
  emailEls.forEach(el => el.textContent = email);
  avatarEls.forEach(el => el.textContent = displayName.charAt(0).toUpperCase());
}

import { getLoginSecurityState, recordFailedLoginAttempt, resetLoginAttempts, sanitizeInput } from "./security.js";

/**
 * Handle Admin Login with Brute-Force Protection
 */
export async function loginAdmin(email, password) {
  const cleanEmail = sanitizeInput(email);
  if (!cleanEmail || !password) {
    showToast("يرجى إدخال البريد الإلكتروني وكلمة المرور", "warning");
    return false;
  }

  // 1. Check Brute-Force Lockout State
  const secState = getLoginSecurityState();
  if (secState.isLocked) {
    showToast(`تم قفل محاولات الدخول مؤقتاً لحماية النظام (${secState.remainingMinutes} دقيقة متبقية)`, "error");
    return false;
  }

  if (isDemoMode) {
    const expectedEmail = DEMO_LOGIN_EMAIL.toLowerCase();
    const providedEmail = cleanEmail.toLowerCase();
    const allowedPasswords = [DEMO_LOGIN_PASSWORD, "123456"];

    if (providedEmail !== expectedEmail || !allowedPasswords.includes(password)) {
      recordFailedLoginAttempt();
      showToast(`البريد الإلكتروني أو كلمة المرور غير صحيحة. استخدم: ${DEMO_LOGIN_EMAIL} / ${DEMO_LOGIN_PASSWORD}`, "error");
      return false;
    }

    resetLoginAttempts();
    const demoUser = {
      uid: "demo-admin-001",
      email: cleanEmail,
      displayName: "خادم كنيسة مارمينا",
      role: "admin"
    };
    try {
      localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(demoUser));
    } catch (e) {}
    showToast("تم تسجيل الدخول بنجاح ✅", "success");
    setTimeout(() => {
      window.location.replace('dashboard.html');
    }, 400);
    return true;
  }

  try {
    await signInWithEmailAndPassword(auth, cleanEmail, password);
    resetLoginAttempts();
    showToast("تم تسجيل الدخول بنجاح ✅", "success");
    setTimeout(() => {
      window.location.replace('dashboard.html');
    }, 400);
    return true;
  } catch (error) {
    const message = String(error?.message || error || "");
    const code = String(error?.code || "");
    const isFirebaseUnavailable = code.includes("configuration-not-found") || message.includes("configuration-not-found") || message.includes("auth/configuration-not-found");

    if (isFirebaseUnavailable) {
      setDemoModeState(true);
      const demoUser = {
        uid: "demo-admin-001",
        email: cleanEmail,
        displayName: "خادم كنيسة مارمينا",
        role: "admin"
      };
      try {
        localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(demoUser));
      } catch (e) {}
      showToast("تم التبديل إلى الوضع المحلي لأن Firebase غير مفعّل في المشروع. تم تسجيل الدخول بنجاح ✅", "success");
      setTimeout(() => {
        window.location.replace('dashboard.html');
      }, 400);
      return true;
    }

    console.error("Login error:", error);
    recordFailedLoginAttempt();
    const updatedState = getLoginSecurityState();
    if (updatedState.isLocked) {
      showToast(`تم قفل الحساب لمدة ${updatedState.remainingMinutes} دقيقة بسبب تكرار المحاولات الخاطئة!`, "error");
    } else {
      showToast(`البريد الإلكتروني أو كلمة المرور غير صحيحة (المحاولة ${updatedState.attempts} من 5).`, "error");
    }
    return false;
  }
}

/**
 * Handle Admin Logout
 */
export async function logoutAdmin() {
  localStorage.removeItem(DEMO_AUTH_KEY);
  if (auth) {
    try { await signOut(auth); } catch (e) {}
  }
  showToast("تم تسجيل الخروج بنجاح", "info");
  setTimeout(() => {
    window.location.replace('login.html');
  }, 400);
}

// Auto-run guard on module load
if (typeof window !== 'undefined') {
  requireAuth();
}
