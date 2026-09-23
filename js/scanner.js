/**
 * Church QR Attendance System - Ultra High Performance QR & Barcode Scanner Engine
 * Dual-Engine Architecture:
 * 1. Native BarcodeDetector (Android Chrome, PC, Mac, Edge) - Instant 60 FPS, zero lag
 * 2. Html5Qrcode Fallback (iOS Safari, older webviews)
 * 3. Direct Photo File Scanner (Gallery / Photo fallback)
 * Universal WebRTC constraints guaranteeing camera start on ALL phones and laptops.
 */

import { playSuccessBeep, playErrorBeep, showToast } from "./utils.js";

let html5QrCode = null;
let nativeMediaStream = null;
let nativeScanAnimFrameId = null;
let isScanning = false;
let lastScannedCode = null;
let lastScanTimestamp = 0;
let currentFacingMode = "environment"; // default to rear camera
const SCAN_COOLDOWN_MS = 1500; // 1.5s cooldown for responsive rapid scanning

/**
 * Universal Camera Stream Request Helper (WebRTC standard, safe on phones and laptops)
 */
async function requestUniversalCameraStream(preferredFacing) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("المتصفح الحالي لا يدعم الوصول للكاميرا، يرجى فتح الموقع عبر رابط HTTPS آمن.");
  }

  // Strategy 1: Ideal facingMode (W3C standard - adapts to front camera on laptops without erroring)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: preferredFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    console.log("✅ [Scanner] Stream opened with ideal facingMode:", preferredFacing);
    return stream;
  } catch (e1) {
    console.warn("Camera Strategy 1 (ideal facingMode) note:", e1.message);
  }

  // Strategy 2: Plain facingMode string
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: preferredFacing },
      audio: false
    });
    console.log("✅ [Scanner] Stream opened with plain facingMode:", preferredFacing);
    return stream;
  } catch (e2) {
    console.warn("Camera Strategy 2 (facingMode string) note:", e2.message);
  }

  // Strategy 3: Opposite facingMode (e.g. front if rear not found)
  try {
    const oppositeFacing = preferredFacing === "environment" ? "user" : "environment";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: oppositeFacing },
      audio: false
    });
    console.log("✅ [Scanner] Stream opened with opposite facingMode:", oppositeFacing);
    return stream;
  } catch (e3) {
    console.warn("Camera Strategy 3 (opposite facingMode) note:", e3.message);
  }

  // Strategy 4: Universal fallback - ANY available video source
  console.log("Using universal video constraint fallback...");
  return await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });
}

/**
 * Initializes and starts the High Performance Scanner
 */
export async function initScanner(elementId, onSuccess, onError) {
  // Cleanly stop any existing scanner or stream
  await stopScanner();

  const container = document.getElementById(elementId);
  if (!container) {
    console.error(`Scanner container #${elementId} not found in DOM.`);
    return;
  }

  try {
    // 1. Try Native BarcodeDetector Engine if supported
    let nativeStarted = false;
    if ("BarcodeDetector" in window && typeof BarcodeDetector.getSupportedFormats === "function") {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        if (Array.isArray(supported) && (supported.includes("qr_code") || supported.includes("code_128") || supported.length > 0)) {
          console.log("🚀 [Scanner] Initializing Native BarcodeDetector Engine with formats:", supported);
          nativeMediaStream = await requestUniversalCameraStream(currentFacingMode);

          container.innerHTML = "";
          const videoEl = document.createElement("video");
          videoEl.id = `${elementId}-live-video`;
          videoEl.autoplay = true;
          videoEl.muted = true;
          videoEl.playsInline = true;
          videoEl.setAttribute("playsinline", "true");
          videoEl.setAttribute("webkit-playsinline", "true");
          videoEl.style.width = "100%";
          videoEl.style.height = "100%";
          videoEl.style.objectFit = "cover";

          container.appendChild(videoEl);
          videoEl.srcObject = nativeMediaStream;
          await videoEl.play();

          const detector = new BarcodeDetector({ formats: supported });
          isScanning = true;
          const scanLoop = async () => {
            if (!isScanning || !nativeMediaStream) return;
            try {
              if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                const barcodes = await detector.detect(videoEl);
                if (barcodes && barcodes.length > 0) {
                  const code = barcodes[0].rawValue;
                  if (code) {
                    handleDecodedCode(code, onSuccess);
                  }
                }
              }
            } catch (frameErr) {
              // ignore transient frame drop
            }
            if (isScanning && nativeMediaStream) {
              nativeScanAnimFrameId = requestAnimationFrame(scanLoop);
            }
          };

          nativeScanAnimFrameId = requestAnimationFrame(scanLoop);
          nativeStarted = true;
          console.log("✅ [Scanner] Native BarcodeDetector live loop active at 60 FPS!");
          return;
        }
      } catch (nativeErr) {
        console.warn("Native BarcodeDetector capability note, falling back cleanly to Html5Qrcode:", nativeErr.message);
        await stopScanner();
      }
    }

    // 2. Fallback: Html5Qrcode Engine (iOS Safari / Standard Web)
    console.log("ℹ️ [Scanner] Starting Html5Qrcode engine...");
    if (typeof Html5Qrcode === "undefined") {
      await loadQrLibrary();
    }

    container.innerHTML = "";
    html5QrCode = new Html5Qrcode(elementId, { verbose: false });

    const config = {
      fps: 22,
      qrbox: (w, h) => {
        const minEdge = Math.min(w || 280, h || 280);
        const size = Math.max(180, Math.floor(minEdge * 0.85));
        return { width: size, height: size };
      }
    };

    let started = false;

    // Try Strategy A: facingMode string
    try {
      await html5QrCode.start(
        { facingMode: currentFacingMode },
        config,
        (decodedText) => handleDecodedCode(decodedText, onSuccess),
        () => {}
      );
      started = true;
    } catch (eA) {
      console.warn("Html5Qrcode facingMode attempt note:", eA.message);
    }

    // Try Strategy B: Camera enumeration
    if (!started && typeof Html5Qrcode.getCameras === "function") {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          const chosen = (currentFacingMode === "environment")
            ? (devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1])
            : (devices.find(d => /front|user/i.test(d.label)) || devices[0]);
          await html5QrCode.start(
            chosen.id,
            config,
            (decodedText) => handleDecodedCode(decodedText, onSuccess),
            () => {}
          );
          started = true;
        }
      } catch (eB) {
        console.warn("Html5Qrcode camera list attempt note:", eB.message);
      }
    }

    // Try Strategy C: Opposite facing mode
    if (!started) {
      const fallbackMode = currentFacingMode === "environment" ? "user" : "environment";
      await html5QrCode.start(
        { facingMode: fallbackMode },
        config,
        (decodedText) => handleDecodedCode(decodedText, onSuccess),
        () => {}
      );
      started = true;
    }

    isScanning = true;
    ensureVideoInline(elementId);
    console.log("✅ [Scanner] Html5Qrcode started successfully!");

  } catch (err) {
    console.error("Camera startup error:", err);
    await stopScanner();

    let errMsg = "تعذر تشغيل الكاميرا: " + (err.message || err);
    if (err.name === "NotAllowedError" || String(err).includes("Permission")) {
      errMsg = "تم رفض إذن الكاميرا. يرجى الضغط على علامة القفل 🔒 في شريط عنوان المتصفح والسماح للكاميرا ثم إعادة المحاولة.";
    } else if (err.name === "NotFoundError" || String(err).includes("NotFound")) {
      errMsg = "لم يتم العثور على كاميرا في هذا الجهاز.";
    } else if (err.name === "NotReadableError") {
      errMsg = "الكاميرا مشغولة في تطبيق آخر على هاتفك. يرجى إغلاق التطبيقات الأخرى.";
    }

    showToast(errMsg, "error");
    if (onError) onError(err);
  }
}

/**
 * Switch between Front and Rear Cameras
 */
export async function toggleCameraFacing(elementId = "attendance-qr-reader", onSuccess, onError) {
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
  if (code === lastScannedCode && (now - lastScanTimestamp) < SCAN_COOLDOWN_MS) {
    return;
  }

  lastScannedCode = code;
  lastScanTimestamp = now;

  console.log("📸 Scanned Code:", code);
  playSuccessBeep();

  if (onSuccess) {
    onSuccess(code);
  }
}

/**
 * Scan QR / Barcode from an Image File directly (Gallery fallback)
 */
export async function scanImageFile(file, onSuccess, onError) {
  if (!file) return;

  try {
    // Strategy 1: Native BarcodeDetector on Image
    if ("BarcodeDetector" in window) {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();
      const detector = new BarcodeDetector();
      const barcodes = await detector.detect(img);
      URL.revokeObjectURL(img.src);

      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        handleDecodedCode(barcodes[0].rawValue, onSuccess);
        return barcodes[0].rawValue;
      }
    }

    // Strategy 2: Html5Qrcode scanFile
    if (typeof Html5Qrcode === "undefined") {
      await loadQrLibrary();
    }

    const tempDivId = "temp-qr-image-decoder";
    let tempDiv = document.getElementById(tempDivId);
    if (!tempDiv) {
      tempDiv = document.createElement("div");
      tempDiv.id = tempDivId;
      tempDiv.style.display = "none";
      document.body.appendChild(tempDiv);
    }

    const scanner = new Html5Qrcode(tempDivId);
    const decoded = await scanner.scanFile(file, true);
    try { scanner.clear(); } catch(e){}

    if (decoded) {
      handleDecodedCode(decoded, onSuccess);
      return decoded;
    }

    throw new Error("لم يتم العثور على رمز QR أو باركود واضح في الصورة.");
  } catch (err) {
    console.error("Photo scan error:", err);
    showToast("تعذر قراءة الكود من الصورة المختارة: " + (err.message || err), "error");
    if (onError) onError(err);
  }
}

/**
 * Stops scanner safely and terminates all hardware camera tracks
 */
export async function stopScanner() {
  isScanning = false;

  if (nativeScanAnimFrameId) {
    cancelAnimationFrame(nativeScanAnimFrameId);
    nativeScanAnimFrameId = null;
  }

  if (nativeMediaStream) {
    nativeMediaStream.getTracks().forEach(t => {
      try { t.stop(); } catch(e){}
    });
    nativeMediaStream = null;
  }

  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {
      // ignore
    } finally {
      html5QrCode = null;
    }
  }

  // Force stop any rogue video streams in the page
  try {
    if (typeof document !== "undefined") {
      document.querySelectorAll("video").forEach(v => {
        if (v.srcObject && typeof v.srcObject.getTracks === "function") {
          v.srcObject.getTracks().forEach(track => {
            try { track.stop(); } catch (err) {}
          });
          v.srcObject = null;
        }
      });
    }
  } catch (trackErr) {}
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
    script.src = "js/html5-qrcode.min.js";
    script.onload = () => resolve();
    script.onerror = () => {
      const fallbackScript = document.createElement("script");
      fallbackScript.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      fallbackScript.onload = () => resolve();
      fallbackScript.onerror = () => {
        const jsdelivrScript = document.createElement("script");
        jsdelivrScript.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
        jsdelivrScript.onload = () => resolve();
        jsdelivrScript.onerror = () => reject(new Error("Failed to load QR scanner library"));
        document.head.appendChild(jsdelivrScript);
      };
      document.head.appendChild(fallbackScript);
    };
    document.head.appendChild(script);
  });
}

function ensureVideoInline(elementId) {
  setTimeout(() => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.querySelectorAll("video").forEach(v => {
      v.setAttribute("playsinline", "true");
      v.setAttribute("webkit-playsinline", "true");
      v.setAttribute("muted", "true");
      v.setAttribute("autoplay", "true");
      v.playsInline = true;
    });
  }, 100);
}
