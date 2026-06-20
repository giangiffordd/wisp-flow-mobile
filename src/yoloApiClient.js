import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Storage key for persisted API URL ──
const API_URL_KEY = 'yolo_api_url';

// ── Default API URL (your PC's local IP running the Flask server) ──
const DEFAULT_API_URL = 'http://192.168.1.4:8000';

// ── Timeout for API calls (ms) ──
const REQUEST_TIMEOUT = 12000;

/**
 * Get the currently configured YOLO API URL from AsyncStorage.
 * Falls back to DEFAULT_API_URL if nothing is saved.
 */
export async function getApiUrl() {
  try {
    const saved = await AsyncStorage.getItem(API_URL_KEY);
    return saved || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
}

/**
 * Save a new API URL to AsyncStorage.
 */
export async function setApiUrl(url) {
  try {
    // Normalize: strip trailing slash
    const normalized = url.replace(/\/+$/, '');
    await AsyncStorage.setItem(API_URL_KEY, normalized);
    return normalized;
  } catch (err) {
    console.warn('Failed to save API URL:', err);
    return url;
  }
}

/**
 * Check if the YOLO API is reachable and the model is loaded.
 * Returns { reachable: boolean, modelLoaded: boolean }
 */
export async function checkHealth() {
  const baseUrl = await getApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${baseUrl}/`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { reachable: false, modelLoaded: false };
    }

    const data = await response.json();
    return {
      reachable: true,
      modelLoaded: data.model_loaded === true,
    };
  } catch (err) {
    clearTimeout(timeout);
    console.warn('YOLO health check failed:', err.message);
    return { reachable: false, modelLoaded: false };
  }
}

/**
 * Send a captured image to the YOLO API for prediction.
 *
 * @param {string} imageUri - The local URI of the captured image (from CameraView.takePictureAsync)
 * @returns {object} - The prediction response from the API, or null on failure
 *
 * Response shape:
 * {
 *   status: 'success',
 *   specimens: [{
 *     species,           // e.g. 'papilio_ulysses'
 *     species_display,   // e.g. 'Papilio ulysses'
 *     confidence,        // 0-1
 *     box: { x, y, w, h },  // normalized bounding box
 *     qa_status,         // 'PASS' | 'FLAGGED'
 *     parts_found: { wing: 4, antenna: 2, ... },
 *     parts_required: { wing: 4, antenna: 2, ... },
 *   }],
 *   raw_detections: [{
 *     class,             // e.g. 'wing', 'antenna', 'leg', 'shell_wing', 'horn', or species name
 *     class_display,     // formatted display name
 *     confidence,        // 0-1
 *     box: { x, y, w, h },  // normalized bounding box (used for part-level rendering)
 *     box_abs: { x1, y1, x2, y2 },  // absolute pixel coordinates
 *   }],
 *   total_specimens: number,
 *   total_parts: number,
 *   image_size: { width, height }
 * }
 */
export async function predictImage(imageUri) {
  const baseUrl = await getApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    // Build multipart form data with the image
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'scan.jpg',
    });

    const response = await fetch(`${baseUrl}/predict`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('YOLO API error:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.warn('YOLO API request timed out');
    } else {
      console.warn('YOLO API request failed:', err.message);
    }
    return null;
  }
}
