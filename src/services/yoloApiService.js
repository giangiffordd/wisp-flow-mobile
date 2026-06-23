import AsyncStorage from '@react-native-async-storage/async-storage';

// ===== AI GENERATED: yoloApiService =====
// Purpose: Wraps all HTTP communication with the WISP-FLOW FastAPI backend
// Inputs: image URI, API URL string
// Returns: prediction result object or null on failure
// Flow:
// 1. getApiUrl resolves base URL from AsyncStorage (falls back to default)
// 2. predictImage builds multipart form and POSTs to /predict
// 3. checkHealth GETs / to verify server + model readiness

const API_URL_KEY = 'yolo_api_url';
const DEFAULT_API_URL = 'http://139.59.117.202:8000';
const REQUEST_TIMEOUT = 12000;
export const WISP_API_KEY = 'wf-G9YTobnU300n3EyGVY_KFjfwGCm4iMbJ';

/**
 * @function getApiUrl
 * @description Get the currently configured YOLO API base URL.
 * @returns {Promise<string>}
 */
export async function getApiUrl() {
  try {
    const savedUrl = await AsyncStorage.getItem(API_URL_KEY);
    return savedUrl || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
}

/**
 * @function setApiUrl
 * @description Persist a new API base URL to AsyncStorage.
 * @param {string} url
 * @returns {Promise<string>} Normalized URL
 */
export async function setApiUrl(url) {
  try {
    const normalizedUrl = url.replace(/\/+$/, '');
    await AsyncStorage.setItem(API_URL_KEY, normalizedUrl);
    return normalizedUrl;
  } catch (saveError) {
    console.warn('Failed to save API URL:', saveError);
    return url;
  }
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
 * @function predictImage
 * @description Send a captured image to the backend for YOLOv8 detection and QA routing.
 * @param {string} imageUri - Local URI from CameraView.takePictureAsync
 * @returns {Promise<Object|null>} Detection result or null on failure
 */
export async function predictImage(imageUri) {
  const baseUrl = await getApiUrl();
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
    if (!response.ok) return null;
    return await response.json();
  } catch (fetchError) {
    clearTimeout(timeout);
    if (fetchError.name === 'AbortError') console.warn('YOLO API request timed out');
    else console.warn('YOLO API request failed:', fetchError.message);
    return null;
  }
}
