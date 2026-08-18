/**
 * Church QR Attendance System - Main App Coordinator & Security UI Logic
 */

import { logoutAdmin, updateUserUI, getCurrentUser } from "./auth.js";
import { showToast } from "./utils.js";
import { initInactivityLock, unlockScreen } from "./security.js";

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initSidebarToggle();
    initThemeToggle();
    initNetworkStatus();
    initLogoutHandler();
    initSecurityLockUI();

    const user = getCurrentUser();
    if (user) {
      updateUserUI(user);
    }
  });
}

/**
 * Highlights the active navigation link based on current page
 */
function initNavigation() {
  const currentPath = window.location.pathname.split("/").pop() || "index.html";

  // Desktop sidebar links
  document.querySelectorAll(".sidebar-menu .nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPath || (currentPath === "index.html" && href === "dashboard.html")) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // Mobile bottom nav items
  document.querySelectorAll(".mobile-bottom-nav .mobile-nav-item").forEach(item => {
    const href = item.getAttribute("href");
    if (href === currentPath || (currentPath === "index.html" && href === "dashboard.html")) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

/**
 * Mobile Sidebar Drawer Toggle
 */
function initSidebarToggle() {
  const toggleBtn = document.getElementById("mobile-menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (!toggleBtn || !sidebar) return;

  const openDrawer = () => {
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  };

  const closeDrawer = () => {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("active");
    document.body.style.overflow = "";
  };

  toggleBtn.addEventListener("click", openDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);
}

/**
 * Light / Dark Theme Switcher with local storage persistence
 */
function initThemeToggle() {
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const savedTheme = localStorage.getItem("church_app_theme") || "light";
  
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    updateThemeIcon(true);
  }

  if (!themeToggleBtn) return;

  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("church_app_theme", "light");
      updateThemeIcon(false);
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("church_app_theme", "dark");
      updateThemeIcon(true);
    }
  });
}

function updateThemeIcon(isDark) {
  const icon = document.querySelector("#theme-toggle-btn i");
  if (icon) {
    icon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
}

/**
 * Network Offline Detection and UI Banner
 */
function initNetworkStatus() {
  let banner = document.getElementById("offline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "offline-banner";
    banner.className = "offline-banner";
    banner.innerHTML = `<i class="fa-solid fa-wifi-slash"></i> لا يوجد اتصال بالإنترنت (يعمل النظام في وضع عدم الاتصال)`;
    document.body.appendChild(banner);
  }

  const updateOnlineStatus = () => {
    if (navigator.onLine) {
      banner.classList.remove("visible");
    } else {
      banner.classList.add("visible");
      showToast("انقطع الاتصال بالإنترنت. البيانات محفوظة محلياً.", "warning");
    }
  };

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  if (!navigator.onLine) {
    banner.classList.add("visible");
  }
}

/**
 * Logout Button Handler
 */
function initLogoutHandler() {
  document.querySelectorAll("[data-action='logout']").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("هل أنت متأكد من رغبتك في تسجيل الخروج؟")) {
        logoutAdmin();
      }
    });
  });
}

/**
 * Security: Auto-Lock Screen after 15 minutes of inactivity
 */
function initSecurityLockUI() {
  if (typeof document === 'undefined') return;
  const isLoginPage = window.location.pathname.endsWith('login.html');
  if (isLoginPage) return;

  // Create Lock Screen Modal in DOM
  const lockModal = document.createElement("div");
  lockModal.id = "security-lock-screen-modal";
  lockModal.style.cssText = `
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 42, 0.96);
    backdrop-filter: blur(8px);
    z-index: 999999;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: white;
    font-family: 'Cairo', sans-serif;
    direction: rtl;
    padding: 1.5rem;
  `;

  lockModal.innerHTML = `
    <div style="background: var(--bg-surface, #ffffff); color: var(--text-main, #1e293b); padding: 2rem; border-radius: 1rem; max-width: 380px; width: 100%; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
      <div style="width: 60px; height: 60px; background: rgba(67, 56, 202, 0.1); color: #4338ca; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; font-size: 1.75rem;">
        <i class="fa-solid fa-lock"></i>
      </div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.25rem;">تم قفل الشاشة لحماية البيانات</h3>
      <p style="color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem;">تم قفل النظام تلقائياً بعد فترة من الخمول للحفاظ على سرية سجلات الطلاب.</p>
      
      <form id="unlock-screen-form">
        <div style="margin-bottom: 1rem; text-align: right;">
          <label style="font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 0.25rem;">أدخل كلمة المرور لإلغاء القفل:</label>
          <input type="password" id="unlock-password-input" class="form-control" placeholder="••••••••" required style="width: 100%; text-align: center; font-size: 1.2rem; letter-spacing: 2px;">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">
          <i class="fa-solid fa-lock-open"></i> إلغاء القفل ومتابعة العمل
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(lockModal);

  const unlockForm = document.getElementById("unlock-screen-form");
  const unlockPass = document.getElementById("unlock-password-input");

  unlockForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (unlockPass.value.trim().length >= 4) {
      unlockScreen();
      lockModal.style.display = "none";
      unlockPass.value = "";
      showToast("تم إلغاء القفل بنجاح ✅", "success");
    } else {
      showToast("كلمة المرور غير صحيحة", "error");
    }
  });

  // Initialize inactivity sensor (15 minutes)
  initInactivityLock(15, () => {
    lockModal.style.display = "flex";
    unlockPass.focus();
  });
}
