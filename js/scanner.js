/**
 * Church QR Attendance System - Ultra High Performance QR & Barcode Scanner Engine
 * Enhanced with multi-format detection (QR, Code128, Code39, EAN, DataMatrix),
 * auto-focus, responsive viewfinder, and multi-camera support.
 */

import { playSuccessBeep, playErrorBeep, showToast } from "./utils.js";

let html5QrCode = null;
let isScanning = false;
let lastScannedCode = null;
let lastScanTimestamp = 0;
let currentFacingMode = "environment"; // default to rear/environment camera
const SCAN_COOLDOWN_MS = 1500; // Fast 1.5s cooldown for rapid responsive scanning

/**
 * Initializes and starts the High Performance Scanner
 */
export async function initScanner(elementId, onSuccess, onError) {
  // Ensure library is loaded
  if (typeof Html5Qrcode === "undefined") {
    console.log("Loading Html5Qrcode library dynamically...");
    await loadQrLibrary();
  }

  // If already scanning or instance exists, cleanly stop and clear
  if (html5QrCode) {
    try {
      if (isScanning) await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {}
    isScanning = false;
  }

  try {
    const formatsToSupport = typeof Html5QrcodeSupportedFormats !== "undefined" ? [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF
    ] : undefined;

    html5QrCode = new Html5Qrcode(elementId, {
      formatsToSupport,
      verbose: false
    });

    const config = {
      fps: 25,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const w = viewfinderWidth || 300;
        const h = viewfinderHeight || 300;
        const minEdge = Math.min(w, h);
        const size = Math.max(180, Math.floor(minEdge * 0.85));
        return { width: size, height: size };
      },
      aspectRatio: 1.0,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    // 1. Try with facingMode
    try {
      await html5QrCode.start(
        { facingMode: currentFacingMode },
        config,
        (decodedText) => handleDecodedCode(decodedText, onSuccess),
        () => {}
      );
      isScanning = true;
      console.log("✅ Camera started with facing mode:", currentFacingMode);
      return;
    } catch (facingErr) {
      console.warn("FacingMode failed, trying direct camera device selection:", facingErr.message);
    }

    // 2. Fallback: enumerate available cameras and pick the first / back camera
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      const selectedCameraId = devices[devices.length - 1].id; // Often back camera is last
      await html5QrCode.start(
        selectedCameraId,
        config,
        (decodedText) => handleDecodedCode(decodedText, onSuccess),
        () => {}
      );
      isScanning = true;
      console.log("✅ Camera started with device ID:", selectedCameraId);
    } else {
      throw new Error("لم يتم العثور على كاميرا متصلة بالجهاز.");
    }

  } catch (err) {
    console.error("Camera startup error:", err);
    isScanning = false;

    let errMsg = "تعذر الوصول إلى الكاميرا. يرجى التأكد من إعطاء المتصفح إذن الكاميرا أو استخدام الإدخال اليدوي بالكود.";
    if (err.name === "NotAllowedError" || err.message?.includes("Permission")) {
      errMsg = "يرجى السماح باستخدام الكاميرا من إعدادات المتصفح لمسح الكارنيهات.";
    }
    showToast(errMsg, "error");
    if (onError) onError(err);
  }
}

/**
 * Switch between Front and Rear Cameras
 */
export async function toggleCameraFacing(elementId, onSuccess, onError) {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  await stopScanner();
  await initScanner(elementId, onSuccess, onError);
  showToast(`تم التبديل إلى الكاميرا ${currentFacingMode === 'environment' ? 'الخلفية' : 'الأمامية'}`, "info");
}

/**
 * Handle scan event with audio beep and callback
 */
function handleDecodedCode(rawCode, onSuccess) {
  const code = (rawCode || "").trim();
  if (!code) return;

  const now = Date.now();
  // If same code is read within cooldown, skip
  if (code === lastScannedCode && (now - lastScanTimestamp) < SCAN_COOLDOWN_MS) {
    return;
  }

  lastScannedCode = code;
  lastScanTimestamp = now;

  console.log("📸 Scanned QR / Barcode Code:", code);
  playSuccessBeep();

  if (onSuccess) {
    onSuccess(code);
  }
}

/**
 * Stops scanner safely
 */
export async function stopScanner() {
  if (html5QrCode) {
    try {
      if (isScanning) {
        await html5QrCode.stop();
      }
      html5QrCode.clear();
    } catch (e) {
      console.warn("Error stopping scanner:", e.message);
    } finally {
      isScanning = false;
    }
  }
}

/**
 * Dynamically loads HTML5-QRCode script if not already present
 */
function loadQrLibrary() {
  return new Promise((resolve, reject) => {
    if (window.Html5Qrcode) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    script.onload = () => resolve();
    script.onerror = () => {
      // Fallback CDN
      const fallbackScript = document.createElement("script");
      fallbackScript.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
      fallbackScript.onload = () => resolve();
      fallbackScript.onerror = () => reject(new Error("Failed to load QR scanner library"));
      document.head.appendChild(fallbackScript);
    };
    document.head.appendChild(script);
  });
}
