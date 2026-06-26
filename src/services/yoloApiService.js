// ===== AI GENERATED: yoloApiService =====
// Purpose: Wraps all HTTP communication with the WISP-FLOW FastAPI backend
// Inputs: image URI, API URL string
// Returns: prediction result object or null on failure
// Flow:
// 1. getApiUrl always returns the production droplet -- no AsyncStorage
//    override, so a stale "point at my laptop" setting from local testing
//    can never silently redirect a real build away from the live server.
// 2. predictImage builds multipart form and POSTs to /predict
// 3. checkHealth GETs / to verify server + model readiness

// HTTPS via a Caddy reverse proxy on the droplet (auto-issued Let's Encrypt
// cert through the free nip.io wildcard DNS, no domain purchase needed).
// Plain http://<ip>:8000 worked fine on iOS Expo Go, but Android's Expo Go
// build enforces cleartext-HTTP blocking by default and that can't be
// overridden from this app's config -- Expo Go is a pre-built Play Store
// binary, not something compiled from app.json. HTTPS is the only fix that
// doesn't require giving up Expo Go for Android testing.
const DEFAULT_API_URL = 'https://139-59-117-202.nip.io';
const REQUEST_TIMEOUT = 30000;
export const WISP_API_KEY = 'wf-G9YTobnU300n3EyGVY_KFjfwGCm4iMbJ';

// Transient-failure retry: a single retry on timeout/network errors only.
// Slow cellular uploads can abort mid-flight even with a generous timeout --
// one extra attempt after a short backoff recovers many of those without
// making the user manually retake the photo.
const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 800;

/**
 * @function getApiUrl
 * @description The YOLO API base URL. Hardcoded to the production droplet --
 * intentionally not configurable at runtime.
 * @returns {Promise<string>}
 */
export async function getApiUrl() {
  return DEFAULT_API_URL;
}

/**
 * @function setApiUrl
 * @description No-op: the API URL is hardcoded to the production droplet
 * and can't be changed at runtime. Kept (rather than deleted) so
 * ApiSettingsModal doesn't need a separate code path -- it just always
 * shows/tests the real production URL now.
 * @param {string} _url
 * @returns {Promise<string>} The hardcoded production URL
 */
export async function setApiUrl(_url) {
  return DEFAULT_API_URL;
}

/**
 * @function checkHealth
 * @description Check if the backend is reachable and the model is loaded.
 * @returns {Promise<{ reachable: boolean, modelLoaded: boolean }>}
 */
export async function checkHealth() {
  const baseUrl = await getApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return { reachable: false, modelLoaded: false };
    const responseData = await response.json();
    return { reachable: true, modelLoaded: responseData.model_loaded === true };
  } catch {
    clearTimeout(timeout);
    return { reachable: false, modelLoaded: false };
  }
}

/**
 * @function predictImageOnce
 * @description Single attempt at POSTing the image to /predict. Internal
 * helper for predictImage's retry loop -- not exported.
 * @param {string} baseUrl
 * @param {string} imageUri
 * @returns {Promise<Object>} Either the parsed success JSON, or a
 * structured failure object: { ok: false, reason: 'timeout' | 'network' | 'http', status? }
 */
async function predictImageOnce(baseUrl, imageUri) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const formData = new FormData();
    formData.append('image', { uri: imageUri, type: 'image/jpeg', name: 'scan.jpg' });
    const response = await fetch(`${baseUrl}/predict`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'multipart/form-data', 'X-API-Key': WISP_API_KEY },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return { ok: false, reason: 'http', status: response.status };
    return await response.json();
  } catch (fetchError) {
    clearTimeout(timeout);
    if (fetchError.name === 'AbortError') {
      console.warn('YOLO API request timed out');
      return { ok: false, reason: 'timeout' };
    }
    console.warn('YOLO API request failed:', fetchError.message);
    return { ok: false, reason: 'network' };
  }
}

/**
 * @function predictImage
 * @description Send a captured image to the backend for YOLOv8 detection and
 * QA routing. Retries once (2 attempts total) on timeout/network errors only
 * -- a clean HTTP error or a successful JSON response is never retried.
 * @param {string} imageUri - Local URI from CameraView.takePictureAsync
 * @returns {Promise<Object>} The parsed success JSON (has `.status`), or a
 * structured failure object `{ ok: false, reason, status? }` (has `.ok === false`).
 */
export async function predictImage(imageUri) {
  const baseUrl = await getApiUrl();
  let result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    result = await predictImageOnce(baseUrl, imageUri);
    const isRetryable = result && result.ok === false && (result.reason === 'timeout' || result.reason === 'network');
    if (!isRetryable || attempt === MAX_ATTEMPTS) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
  }
  return result;
}
