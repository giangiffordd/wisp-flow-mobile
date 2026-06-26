import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  ActivityIndicator,
  Easing,
  ScrollView,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, AlertCircle, ArrowLeft, Square, CheckCircle, RefreshCw, Upload, Trash2, Wifi, WifiOff, Sparkles } from 'lucide-react-native';
import { supabase, submitScanBatch } from '../src/services/supabaseService';
import { getWorkerSession } from '../src/services/workerSession';
import { checkHealth, predictImage, getApiUrl, WISP_API_KEY } from '../src/services/yoloApiService';
import { CameraView, useCameraPermissions } from 'expo-camera';
import ApiSettingsModal from '../components/ApiSettingsModal';

async function notifySpecimenFlagged(speciesName) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Specimen Flagged for Review',
        body:  `${speciesName} — missing parts detected. Manager review required.`,
        sound: true,
      },
      trigger: null,
    });
  } catch {}
}

const NAVY = '#FFFFFF';
const SKY  = '#FFFFFF';

// ═══════════════════════════════════════════════════════════════════════════════
//  WISP-FLOW AI LOGIC — Ported directly from api.py / best.pt model
// ═══════════════════════════════════════════════════════════════════════════════

// The 12 parent species detected by best.pt
const PARENT_SPECIES = [
  'papilio_thoas', 'thysania_agripina', 'pomponia_imperatoria',
  'idea_lynceus', 'polyura_delphis_concha', 'papilio_palinurus',
  'papilio_karna', 'papilio_rumanzovia', 'papilio_blumei',
  'papilio_ulysses', 'phyllium_pulchrifolium', 'xylotrupes_gideon',
];

// The 5 anatomical part classes
const PART_CLASSES = ['wing', 'antenna', 'leg', 'shell_wing', 'horn'];

// Species display info — scientific name → common name mapping
const SPECIES_INFO = {
  'papilio_thoas':            { common: 'King Swallowtail' },
  'thysania_agripina':        { common: 'White Witch Moth' },
  'pomponia_imperatoria':     { common: 'Empress Cicada' },
  'idea_lynceus':             { common: 'Tree Nymph Butterfly' },
  'polyura_delphis_concha':   { common: 'Jewelled Nawab' },
  'papilio_palinurus':        { common: 'Emerald Swallowtail' },
  'papilio_karna':            { common: 'Karna Swallowtail' },
  'papilio_rumanzovia':       { common: 'Scarlet Mormon' },
  'papilio_blumei':           { common: 'Peacock Swallowtail' },
  'papilio_ulysses':          { common: 'Blue Emperor' },
  'phyllium_pulchrifolium':   { common: 'Leaf Insect' },
  'xylotrupes_gideon':        { common: 'Rhinoceros Beetle' },
};

// Group 1: Standard Butterflies & Moths — 4 wings + 2 antennae
const GROUP_4W_2A = [
  'papilio_thoas', 'thysania_agripina', 'idea_lynceus',
  'polyura_delphis_concha', 'papilio_palinurus', 'papilio_karna',
  'papilio_rumanzovia', 'papilio_blumei',
];

// QA rules: species → required parts for PASS status (mirroring api.py exactly)
const QA_RULES = {};
GROUP_4W_2A.forEach(sp => { QA_RULES[sp] = { wing: 4, antenna: 2 }; });

// Group 2: Pomponia Imperatoria — 4 wings + 4 legs
QA_RULES['pomponia_imperatoria'] = { wing: 4, leg: 4 };

// Group 3: Papilio Ulysses — 4 wings + 2 antennae (swallowtail, same as GROUP_4W_2A)
QA_RULES['papilio_ulysses'] = { wing: 4, antenna: 2 };

// Group 4: Leaf Insect — 6 legs + 2 antennae
QA_RULES['phyllium_pulchrifolium'] = { leg: 6, antenna: 2 };

// Group 5: Rhino Beetle — 2 wings + 2 shell_wings + 4 legs + 1 horn
QA_RULES['xylotrupes_gideon'] = { wing: 2, shell_wing: 2, leg: 4, horn: 1 };

// Part type colors for bounding box rendering (matching test.py palette)
const PART_COLORS = {
  wing:       '#00FFFF',  // Cyan
  antenna:    '#FFD700',  // Yellow/Gold
  leg:        '#00FF00',  // Lime Green
  shell_wing: '#FF8C00',  // Orange
  horn:       '#FF00FF',  // Magenta
};

// ── Helper functions (mirroring api.py) ──────────────────────────────────────

function formatSpeciesName(className) {
  const parts = className.split('_');
  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + ' ' + parts.slice(1).join(' ');
  }
  return className.charAt(0).toUpperCase() + className.slice(1);
}


function applyQaRouting(speciesName, foundParts) {
  const rules = QA_RULES[speciesName];
  if (!rules) return { status: 'FLAGGED', required: {} };
  const isPass = Object.entries(rules).every(
    ([part, count]) => (foundParts[part] || 0) === count
  );
  return { status: isPass ? 'PASS' : 'FLAGGED', required: rules };
}

// A specimen is flagged on an EXACT count mismatch (applyQaRouting above),
// not just an absent part type -- e.g. 3 wings found when 4 are required
// still flags it, even though "wing" is technically present in partsFound.
// Reporting only outright-absent part types left this case showing
// "Missing unknown" with no actionable info. This reports every
// mismatched part with its found/required count so the artisan knows
// exactly what to fix.
function describeMissingParts(partsRequired, partsFound) {
  const found = partsFound || {};
  return Object.entries(partsRequired || {})
    .filter(([part, reqCount]) => (found[part] || 0) !== reqCount)
    .map(([part, reqCount]) => `${part} (${found[part] || 0}/${reqCount})`);
}

// ── Simulation Engine ────────────────────────────────────────────────────────

function generateSimulatedPartBox(parentBox, partType, index, totalOfType) {
  // Generate realistic part bounding boxes relative to parent box
  const pw = parentBox.w;
  const ph = parentBox.h;
  const px = parentBox.x;
  const py = parentBox.y;

  let partW, partH, partX, partY;

  switch (partType) {
    case 'wing':
      // Wings are placed in quadrants of the specimen
      partW = pw * (0.25 + Math.random() * 0.15);
      partH = ph * (0.3 + Math.random() * 0.15);
      if (totalOfType <= 4) {
        // 4-wing layout: TL, TR, BL, BR
        const col = index % 2;
        const row = Math.floor(index / 2);
        partX = px + col * (pw * 0.45) + pw * 0.05 + (Math.random() * pw * 0.05);
        partY = py + row * (ph * 0.4) + ph * 0.1 + (Math.random() * ph * 0.05);
      } else {
        // 8-wing: arranged in a grid (Papilio ulysses)
        const col = index % 4;
        const row = Math.floor(index / 4);
        partW = pw * (0.18 + Math.random() * 0.08);
        partH = ph * (0.25 + Math.random() * 0.1);
        partX = px + col * (pw * 0.22) + pw * 0.05 + (Math.random() * pw * 0.03);
        partY = py + row * (ph * 0.35) + ph * 0.12 + (Math.random() * ph * 0.05);
      }
      break;

    case 'antenna':
      // Antennae at the top of the specimen
      partW = pw * (0.06 + Math.random() * 0.04);
      partH = ph * (0.15 + Math.random() * 0.08);
      partX = px + pw * (0.3 + index * 0.25) + (Math.random() * pw * 0.05);
      partY = py + ph * 0.05 + (Math.random() * ph * 0.05);
      break;

    case 'leg':
      // Legs along the sides/bottom
      partW = pw * (0.05 + Math.random() * 0.04);
      partH = ph * (0.12 + Math.random() * 0.1);
      if (totalOfType <= 4) {
        const col = index % 2;
        const row = Math.floor(index / 2);
        partX = px + col * (pw * 0.7) + pw * 0.1 + (Math.random() * pw * 0.05);
        partY = py + ph * 0.4 + row * (ph * 0.2) + (Math.random() * ph * 0.05);
      } else {
        // 6 legs (leaf insect) — 2 columns of 3
        const col = index % 2;
        partX = px + col * (pw * 0.65) + pw * 0.1 + (Math.random() * pw * 0.05);
        partY = py + ph * 0.25 + (index % 3) * (ph * 0.2) + (Math.random() * ph * 0.03);
      }
      break;

    case 'shell_wing':
      // Shell wings on the back
      partW = pw * (0.3 + Math.random() * 0.1);
      partH = ph * (0.35 + Math.random() * 0.1);
      partX = px + index * (pw * 0.35) + pw * 0.08 + (Math.random() * pw * 0.05);
      partY = py + ph * 0.2 + (Math.random() * ph * 0.05);
      break;

    case 'horn':
      // Horn at the top center
      partW = pw * (0.12 + Math.random() * 0.06);
      partH = ph * (0.2 + Math.random() * 0.08);
      partX = px + pw * 0.4 + (Math.random() * pw * 0.1);
      partY = py + ph * 0.02 + (Math.random() * ph * 0.05);
      break;

    default:
      partW = pw * 0.15;
      partH = ph * 0.15;
      partX = px + pw * 0.3 + Math.random() * pw * 0.3;
      partY = py + ph * 0.3 + Math.random() * ph * 0.3;
  }

  // Clamp to parent bounds
  partX = Math.max(px, Math.min(partX, px + pw - partW));
  partY = Math.max(py, Math.min(partY, py + ph - partH));

  return {
    x: partX,
    y: partY,
    w: partW,
    h: partH,
  };
}

function simulateDetection() {
  // Pick a random species from the 12 real species
  const speciesKey = PARENT_SPECIES[Math.floor(Math.random() * PARENT_SPECIES.length)];
  const info = SPECIES_INFO[speciesKey] || { common: formatSpeciesName(speciesKey) };
  const rules = QA_RULES[speciesKey] || {};

  // Generate the parent bounding box
  const parentBox = {
    x: 0.08 + Math.random() * 0.15,
    y: 0.08 + Math.random() * 0.12,
    w: 0.5 + Math.random() * 0.2,
    h: 0.45 + Math.random() * 0.2,
  };
  // Clamp to viewport
  parentBox.w = Math.min(parentBox.w, 1 - parentBox.x - 0.02);
  parentBox.h = Math.min(parentBox.h, 1 - parentBox.y - 0.02);

  const parentConfidence = (0.82 + Math.random() * 0.16);

  // Decide whether to simulate a PASS or FLAGGED scenario (~65% pass)
  const shouldPass = Math.random() < 0.65;

  // Generate parts based on QA rules
  const generatedParts = [];
  const foundParts = {};
  PART_CLASSES.forEach(p => { foundParts[p] = 0; });

  Object.entries(rules).forEach(([partType, requiredCount]) => {
    // For PASS: generate exact count; for FLAGGED: vary the count
    let count;
    if (shouldPass) {
      count = requiredCount;
    } else {
      // Generate incorrect count: missing 1-2 parts or extra 1
      const variation = Math.random() < 0.7
        ? -Math.ceil(Math.random() * Math.min(2, requiredCount))
        : 1;
      count = Math.max(0, requiredCount + variation);
    }

    foundParts[partType] = count;

    for (let i = 0; i < count; i++) {
      const partBox = generateSimulatedPartBox(parentBox, partType, i, count);
      generatedParts.push({
        name: partType,
        confidence: (0.75 + Math.random() * 0.2),
        box: partBox,
      });
    }
  });

  // Apply QA routing using the real logic
  const { status: qaStatus, required: requiredParts } = applyQaRouting(speciesKey, foundParts);

  // Build the specimen result (same shape as API response)
  const specimen = {
    id: `sim-${Date.now()}-0`,
    species: formatSpeciesName(speciesKey),
    rawSpecies: speciesKey,
    commonName: info.common,
    confidence: parentConfidence,
    qcStatus: qaStatus === 'PASS' ? 'pass' : 'flagged',
    box: parentBox,
    partsFound: Object.fromEntries(Object.entries(foundParts).filter(([, v]) => v > 0)),
    partsRequired: requiredParts,
    detectedParts: generatedParts,  // Individual part boxes for rendering
  };

  return specimen;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function YoloCameraModule({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const stepTitle       = route?.params?.stepTitle       || 'YOLO Scan';
  const stepId          = route?.params?.stepId          ?? null;
  const batchId         = route?.params?.batchId         ?? null;
  const batchSpecies    = route?.params?.batchSpecies    ?? null;
  const scanMode        = route?.params?.mode            || 'standalone';
  const specimenId      = route?.params?.specimenId      ?? null;
  const originalDefects = route?.params?.originalDefects ?? null;

  // ── Camera permission state ──
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // ── API connection state ──
  const [apiStatus, setApiStatus] = useState('checking'); // 'checking' | 'connected' | 'offline'
  const [settingsVisible, setSettingsVisible] = useState(false);

  // ── Scan state ──
  const [isScanning, setIsScanning] = useState(false);
  const [specimens, setSpecimens]   = useState([]);       // array of detected specimens
  const [rawParts, setRawParts]     = useState([]);       // individual part detections for rendering
  const [annotatedImageBase64, setAnnotatedImageBase64] = useState(null); // Server-rendered image
  const [capturedPhotoUri, setCapturedPhotoUri] = useState(null); // Instant freeze frame
  const [isLoading, setIsLoading]   = useState(false);
  const [source, setSource]         = useState(null);      // 'api' | 'simulation'
  const [scanError, setScanError]   = useState(null);

  // ── Phase 2 States ──
  const [workerName, setWorkerName] = useState('Operator');
  const [dailyStats, setDailyStats] = useState({ scanned: 0, passed: 0 });
  const [isCooldown, setIsCooldown] = useState(false);
  const isRepairMode = scanMode === 'rescan';
  const [toastMessage, setToastMessage] = useState(null);

  // ── Pending scan session: each capture is reviewed (Retake/Keep) before
  // it's added here, and nothing reaches Supabase/AsyncStorage until the
  // whole session is Confirmed. Lets a worker scan several specimens (any
  // species) in one continuous session, drop ones they don't want, then
  // commit everything at once. ──
  const [pendingReview, setPendingReview] = useState(null); // { specimens, base64Image } awaiting Retake/Keep
  const [pendingScans, setPendingScans]   = useState([]);   // [{ id, specimens, base64Image, timestamp }]
  const [isConfirming, setIsConfirming]   = useState(false);

  // ── Animations ──
  const pulseAnim        = useRef(new Animated.Value(1)).current;
  const boundingBoxOpacity = useRef(new Animated.Value(0)).current;
  const bannerOpacity    = useRef(new Animated.Value(0)).current;
  const laserAnim        = useRef(new Animated.Value(0)).current;
  const translateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 240],
  });

  // ── Check API connection on mount and when settings close ──
  // Retries a couple of times before giving up -- a single slow/transient
  // network blip right as the screen mounts (common right after the phone's
  // WiFi/data connection wakes up) shouldn't permanently show "unreachable"
  // with no way to recover short of leaving and re-entering the screen.
  const checkApiConnection = useCallback(async () => {
    setApiStatus('checking');
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await checkHealth();
      if (result.reachable && result.modelLoaded) {
        setApiStatus('connected');
        return;
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
    }
    setApiStatus('offline');
  }, []);

  useEffect(() => {
    checkApiConnection();
  }, [checkApiConnection]);

  useEffect(() => {
    getWorkerSession().then(s => { if (s?.name) setWorkerName(s.name); });
  }, []);

  const handleSettingsClose = useCallback(() => {
    setSettingsVisible(false);
    checkApiConnection();
  }, [checkApiConnection]);

  // ── Pulse animation ──
  useEffect(() => {
    let pulse;
    if (isScanning) {
      pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => pulse && pulse.stop();
  }, [isScanning]);

  // ── Idle scan-sweep: keeps the empty-state illustration alive so the
  //    onboarding panel reads as a live scanner, not a static placeholder. ──
  const idleSweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idleSweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(idleSweep, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── Bounding box + banner animation ──
  useEffect(() => {
    if (specimens.length > 0 && !isLoading) {
      Animated.timing(boundingBoxOpacity, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }).start();
      Animated.timing(bannerOpacity, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }).start();
    } else {
      boundingBoxOpacity.setValue(0);
      bannerOpacity.setValue(0);
    }
  }, [specimens, isLoading]);

  // ── Laser sweep animation ──
  useEffect(() => {
    let animation;
    if (isScanning && isLoading) {
      laserAnim.setValue(0);
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1, duration: 1500,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0, duration: 1500,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      laserAnim.setValue(0);
      if (animation) animation.stop();
    }
    return () => animation && animation.stop();
  }, [isScanning, isLoading]);

  // ── REAL SCAN: Capture frame and send to YOLO API ──
  const doRealScan = async () => {
    setIsLoading(true);
    setScanError(null);

    try {
      if (!cameraRef.current) {
        throw new Error('Camera ref not available');
      }

      // Send the OS-processed photo AS-IS, with its EXIF orientation intact --
      // the server's pipeline rotates by EXIF to see the specimen upright. We do
      // NOT downscale via expo-image-manipulator: on Android BOTH its APIs (the
      // new object API and the legacy manipulateAsync) strip EXIF WITHOUT baking
      // the rotation into the pixels, so the server got sideways images and the
      // model detected nothing on every scan. quality 0.6 shrinks the JPEG for
      // cellular without touching dimensions or orientation; the 30s timeout +
      // single retry in predictImage cover the rest.
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: false,
      });
      setCapturedPhotoUri(photo.uri);

      const result = await predictImage(photo.uri);

      if (result && result.status === 'success' && result.specimens && result.specimens.length > 0) {
        // Real detections from the AI model
        const mappedSpecimens = result.specimens.map((s, i) => ({
          id: `real-${Date.now()}-${i}`,
          species: s.species_display,
          rawSpecies: s.species,
          commonName: s.species_display,
          confidence: s.confidence,
          qcStatus: s.qa_status === 'PASS' ? 'pass' : 'flagged',
          box: s.box,
          partsFound: s.parts_found || {},
          partsRequired: s.parts_required || {},
          detectedParts: [],  // Individual parts come from raw_detections
        }));

        // Extract part-level detections from raw_detections
        const partDetections = (result.raw_detections || [])
          .filter(d => PART_CLASSES.includes(d.class))
          .map(d => ({
            name: d.class,
            confidence: d.confidence,
            box: d.box,
          }));

        setSpecimens(mappedSpecimens);
        setRawParts(partDetections);
        if (result.annotated_image_base64) {
          setAnnotatedImageBase64(result.annotated_image_base64);
        }
        setSource('api');
        setPendingReview({ specimens: mappedSpecimens, base64Image: result.annotated_image_base64 || null });
        return;
      }

      if (result && result.status === 'success' && result.specimens && result.specimens.length === 0) {
        setScanError('None detected — aim at the specimen and try again.');
        setSpecimens([]);
        setRawParts([]);
        setSource('api');
        setPendingReview({ specimens: [], base64Image: null });
        return;
      }

      // A structured failure means the AI never actually looked at the
      // photo (timeout / dropped connection / busy server) -- this is NOT
      // the same as a clean "no specimen found" result, and must not be
      // shown as one.
      if (result && result.ok === false) {
        let connectionError = 'Scan failed — check your connection and retake.';
        if (result.reason === 'timeout') {
          connectionError = 'Connection is slow — couldn\'t reach the scanner. Move to better signal and retake.';
        } else if (result.reason === 'network') {
          connectionError = 'Can\'t reach the scanner — check your connection and retake.';
        } else if (result.reason === 'http') {
          connectionError = 'Scanner is busy right now — please retake in a moment.';
        }
        setScanError(connectionError);
        setSpecimens([]);
        setRawParts([]);
        setSource('api');
        setPendingReview({ specimens: [], base64Image: null });
        return;
      }

      throw new Error('API returned no data');
    } catch (err) {
      // Never fabricate a result. A failed real scan now shows an honest
      // error and an empty review (Retake only). The old behavior fell back
      // to doSimulatedScan(), which invented a RANDOM specimen that was
      // "clearly not there" and could even be written to real inventory if
      // the worker Kept + Confirmed it. A QA tool must never invent a
      // detection the AI did not actually make.
      console.warn('Real scan failed:', err.message);
      setScanError('Scan failed — check your connection and retake.');
      setSpecimens([]);
      setRawParts([]);
      setSource('api');
      setPendingReview({ specimens: [], base64Image: null });
    } finally {
      setIsLoading(false);
    }
  };

  // ── SIMULATED SCAN: Uses full WISP-FLOW AI logic ──
  const doSimulatedScan = async () => {
    try {
      // Simulate a realistic detection delay
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

      const specimen = simulateDetection();

      setSpecimens([specimen]);
      setRawParts(specimen.detectedParts || []);
      setSource('simulation');
      setPendingReview({ specimens: [specimen], base64Image: null });
    } catch (err) {
      console.warn('Simulation error:', err);
      setScanError('Simulation failed. Please try again.');
    }
  };

  // ── Capture a frame -- used for both the first capture and every
  // subsequent one in the same session (Retake/Keep both return here). ──
  const handleCapture = async () => {
    setIsScanning(true);
    setSpecimens([]);
    setRawParts([]);
    setAnnotatedImageBase64(null);
    setCapturedPhotoUri(null);
    setSource(null);
    setScanError(null);
    setPendingReview(null);

    if (apiStatus === 'connected' && permission?.granted) {
      await doRealScan();
    } else {
      // No fabricated fallback. If the AI is unreachable or we lack camera
      // permission, say so honestly instead of inventing a specimen.
      setScanError(
        !permission?.granted
          ? 'Camera access is off. Turn it on so WISP-FLOW can see the specimen.'
          : "Lost the AI server. Reconnect, then give it another go."
      );
      setPendingReview({ specimens: [], base64Image: null });
    }
  };

  // ── Retake: discard the capture awaiting review, return to live camera ──
  const handleRetake = () => {
    setPendingReview(null);
    setSpecimens([]);
    setRawParts([]);
    setAnnotatedImageBase64(null);
    setCapturedPhotoUri(null);
    setSource(null);
    setScanError(null);
  };

  // ── Keep: add the reviewed capture to the pending session list, then
  // return to live camera for the next one. Nothing is saved yet. ──
  const handleKeepScan = () => {
    // Defensive: the UI hides the Keep button whenever anything is
    // flagged, but never accept a flagged capture even if this is somehow
    // called anyway -- it needs the artisan to fix it first, not a save.
    const hasFlagged = pendingReview?.specimens.some(s => s.qcStatus !== 'pass');
    if (pendingReview && pendingReview.specimens.length > 0 && !hasFlagged) {
      setPendingScans(prev => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          specimens: pendingReview.specimens,
          base64Image: pendingReview.base64Image,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ]);
    }
    handleRetake();
  };

  const handleDeletePending = (id) => {
    setPendingScans(prev => prev.filter(e => e.id !== id));
  };

  // ── Handle Stop Scan -- back to idle. Does not touch pendingScans itself;
  // callers decide whether those should be discarded first. ──
  const handleStopScan = () => {
    setIsScanning(false);
    setIsLoading(false);
    setSpecimens([]);
    setRawParts([]);
    setAnnotatedImageBase64(null);
    setCapturedPhotoUri(null);
    setSource(null);
    setScanError(null);
    setPendingReview(null);
    bannerOpacity.setValue(0);
  };

  // ── Leaving the scan session (back button / End Session) while scans are
  // still pending would silently lose them -- confirm first. ──
  const guardPendingScans = (proceed) => {
    if (pendingScans.length > 0) {
      Alert.alert(
        'Discard Pending Scans?',
        `You have ${pendingScans.length} scan${pendingScans.length === 1 ? '' : 's'} not yet confirmed. Leaving now will discard ${pendingScans.length === 1 ? 'it' : 'them'}.`,
        [
          { text: 'Keep Reviewing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => { setPendingScans([]); proceed(); } },
        ]
      );
      return;
    }
    proceed();
  };

  const handleEndSessionPress = () => guardPendingScans(handleStopScan);
  const handleBackPress = () => guardPendingScans(() => navigation.goBack());

  // ── WorkflowModule batch mode: write result to AsyncStorage then go back.
  // Only the active-batch / re-scan flow uses this -- it expects exactly
  // one outcome per trip, same as before this screen supported multi-scan
  // sessions. ──
  const finalizeWorkflowBatch = async (primary, isMismatch) => {
    const info = SPECIES_INFO[primary.rawSpecies];
    await Promise.all([
      AsyncStorage.setItem('last_detected_species', JSON.stringify({
        species:    primary.species,
        commonName: info ? info.common : primary.species,
      })),
      AsyncStorage.setItem('pending_specimen_result', JSON.stringify({
        isRescan:        scanMode === 'rescan',
        specimenId:      specimenId,
        batchId:         batchId,
        status:          primary.qcStatus,
        species:         primary.rawSpecies,
        speciesDisplay:  primary.species,
        confidence:      primary.confidence,
        partsFound:      primary.partsFound   || {},
        partsRequired:   primary.partsRequired || {},
        species_mismatch: isMismatch,
        timestamp:       new Date().toISOString(),
      })),
    ]).catch(() => {});

    if (primary.qcStatus === 'flagged') {
      await notifySpecimenFlagged(primary.species);
    }

    setPendingScans([]);
    navigation.goBack();
  };

  // ── Submit one species group as a PENDING scan batch (Human-in-the-Loop).
  // Per the project's scope, the mobile app NEVER writes inventory directly:
  // it submits the QC scan for manager approval, and inventory is applied
  // server-side by a Supabase trigger only when the manager approves (see
  // supabase/qc_approval_migration.sql). Side effects: flagged push-notify,
  // annotated images to the backend for the manager's image review, and the
  // local stage scan-count pill. ──
  const submitSpeciesGroup = async (species, entries) => {
    const allSpecs = entries.flatMap(e => e.specimens);
    const passCount = allSpecs.filter(s => s.qcStatus === 'pass').length;
    const flaggedCount = allSpecs.length - passCount;
    const primary = entries[0].specimens[0];

    if (supabase) {
      await submitScanBatch({
        species,
        species_display: primary?.commonName || species,
        stage_number: stepId || 9,
        stage_name: stepTitle || 'Quality Control',
        production_batch_id: batchId || null,
        worker_name: workerName || 'Worker',
        total_scanned: allSpecs.length,
        pass_count: passCount,
        flagged_count: flaggedCount,
        specimens: allSpecs.map(s => ({
          species: s.species,
          status: s.qcStatus,
          confidence: s.confidence,
          parts_found: s.partsFound || {},
          parts_required: s.partsRequired || {},
          missing_parts: s.qcStatus !== 'pass' ? describeMissingParts(s.partsRequired, s.partsFound) : [],
          scanned_at: new Date().toISOString(),
        })),
      });

      // Flagged specimens also go to the `defects` review queue (preserves
      // the manager's existing flagged view; defects never touch inventory).
      for (const s of allSpecs.filter(x => x.qcStatus !== 'pass')) {
        const missing = describeMissingParts(s.partsRequired, s.partsFound);
        await supabase.from('defects').insert({
          species: s.species,
          missing_parts: missing.length > 0 ? missing.join(', ') : 'unknown',
          status: 'new',
          worker: workerName || 'Unknown',
        });
      }

      if (flaggedCount > 0) await notifySpecimenFlagged(species);
    }

    // Annotated images -> backend so the manager can review them on approval.
    // (Previously read a never-set `api_host` key, so images were silently
    // dropped; now uses the real configured API host.)
    for (const e of entries) {
      if (!e.base64Image) continue;
      try {
        const base = await getApiUrl();
        await fetch(`${base}/save_scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': WISP_API_KEY },
          body: JSON.stringify({
            annotated_image_base64: e.base64Image,
            species: e.specimens[0]?.species,
            confidence: e.specimens[0]?.confidence,
            qa_status: e.specimens[0]?.qcStatus === 'pass' ? 'PASS' : 'FLAGGED',
          }),
        });
      } catch {}
    }

    if (primary) {
      const info = SPECIES_INFO[primary.rawSpecies];
      await AsyncStorage.setItem('last_detected_species', JSON.stringify({
        species: primary.species,
        commonName: info ? info.common : primary.species,
      })).catch(() => {});
    }

    // Local stage scan-count pill (per batch + stage). Counts captures
    // submitted; the canonical record is the pending scan_batches in Supabase.
    if (batchId && stepId) {
      const countKey = `stage_scan_count_${batchId}_${stepId}`;
      const logKey   = `stage_scan_log_${batchId}_${stepId}`;
      const prevCount = parseInt((await AsyncStorage.getItem(countKey).catch(() => null)) || '0', 10);
      await AsyncStorage.setItem(countKey, String(prevCount + entries.length)).catch(() => {});
      const logRaw = await AsyncStorage.getItem(logKey).catch(() => null);
      const existing = logRaw ? JSON.parse(logRaw) : [];
      const logEntry = {
        timestamp: new Date().toISOString(),
        species, passCount, flaggedCount, total: allSpecs.length,
        type: 'yolo', status: 'pending_approval',
      };
      await AsyncStorage.setItem(logKey, JSON.stringify([logEntry, ...existing].slice(0, 50))).catch(() => {});
    }

    return { passCount, total: allSpecs.length };
  };

  // ── Confirm: commit every kept-but-unconfirmed scan. WorkflowModule's
  // active-batch / re-scan flow only ever expects one outcome, so it uses
  // the most recently kept entry (with the existing species-mismatch
  // check); standalone/Stages sessions sync every pending entry. ──
  const handleConfirmSession = async () => {
    if (pendingScans.length === 0) return;

    if ((scanMode === 'new' || scanMode === 'rescan') && batchId) {
      const last = pendingScans[0]; // most recently kept (list is newest-first)
      const primary = last.specimens[0];
      const isMismatch = batchSpecies && primary.species.toLowerCase() !== batchSpecies.toLowerCase();

      if (isMismatch) {
        Alert.alert(
          'Species Mismatch',
          `This batch is for ${batchSpecies}.\nYou scanned ${primary.species}.\n\nWas this intentional?`,
          [
            { text: 'Add Anyway', onPress: () => finalizeWorkflowBatch(primary, true) },
            {
              text: 'Clear Batch & Start New',
              onPress: async () => {
                const session = await getWorkerSession();
                const prefix  = session?.employee_id || 'default';
                await AsyncStorage.removeItem(`${prefix}_active_batch`);
                setPendingScans([]);
                navigation.goBack();
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      await finalizeWorkflowBatch(primary, false);
      return;
    }

    setIsConfirming(true);
    try {
      // Group kept captures by AI-detected species; each species becomes one
      // pending scan batch submitted for manager approval.
      const groups = {};
      for (const e of pendingScans) {
        const sp = e.specimens[0]?.species || 'Unknown';
        (groups[sp] = groups[sp] || []).push(e);
      }
      let totalAll = 0, totalPass = 0;
      for (const species of Object.keys(groups)) {
        const { passCount, total } = await submitSpeciesGroup(species, groups[species]);
        totalAll += total; totalPass += passCount;
      }
      setDailyStats(prev => ({ scanned: prev.scanned + totalAll, passed: prev.passed + totalPass }));
      setPendingScans([]);
      setIsCooldown(true);
      setTimeout(() => setIsCooldown(false), 3000);
      // Honest wording: nothing is in inventory yet -- it's awaiting the
      // manager's approval (human-in-the-loop).
      setToastMessage(`Submitted ${totalAll} scan${totalAll === 1 ? '' : 's'} for approval`);
      setTimeout(() => setToastMessage(null), 3500);
      handleStopScan();
    } catch (err) {
      console.error('Error confirming session:', err);
      Alert.alert('Error', 'Failed to submit some scans. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  // Compute total parts count
  const totalPartsCount = rawParts.length;

  return (
    <View style={styles.container}>
      {/* ── Non-blocking Toast Notification ── */}
      {toastMessage && (
        <View style={{ position: 'absolute', top: insets.top + 10, alignSelf: 'center', backgroundColor: '#10b981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 0, zIndex: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{toastMessage}</Text>
        </View>
      )}



      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color="#5B21D9" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{stepTitle}</Text>
        </View>

        {/* Header right — pending scan count */}
        <View style={styles.headerRight}>
          {pendingScans.length > 0 && (
            <View style={styles.tallyHeaderBadge}>
              <Text style={styles.tallyHeaderNum}>{pendingScans.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Operator Bar ── */}
      {workerName && (
        <View style={styles.workerBar}>
          <Text style={styles.workerBarName}>OPERATOR: {workerName.toUpperCase()}</Text>
          <Text style={styles.workerBarStats}>
            {dailyStats.scanned} this session · {dailyStats.scanned > 0 ? Math.round((dailyStats.passed / dailyStats.scanned) * 100) : 0}% pass
          </Text>
        </View>
      )}

      {/* ── Re-scan Mode Banner ── */}
      {scanMode === 'rescan' && (
        <View style={styles.rescanBanner}>
          <RefreshCw size={13} color="#c2410c" />
          <View style={{ flex: 1 }}>
            <Text style={styles.rescanBannerTitle}>RE-SCAN MODE</Text>
            {originalDefects && (
              <Text style={styles.rescanBannerSub}>
                Original defects: {Object.entries(originalDefects).map(([k, v]) => `${v} ${k}`).join(', ')}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* ── Camera Viewport ── */}
      <View style={styles.cameraContainer}>
        {!permission ? (
          <View style={StyleSheet.absoluteFillObject}>
            <View style={styles.cameraOverlay}>
              <ActivityIndicator size="small" color={SKY} />
            </View>
          </View>
        ) : permission.granted ? (
          <>
            {annotatedImageBase64 && !isLoading ? (
              <Animated.Image 
                source={{ uri: `data:image/jpeg;base64,${annotatedImageBase64}` }} 
                style={[StyleSheet.absoluteFillObject, { opacity: boundingBoxOpacity }]} 
                resizeMode="cover" 
              />
            ) : capturedPhotoUri ? (
              <Image 
                source={{ uri: capturedPhotoUri }} 
                style={StyleSheet.absoluteFillObject} 
                resizeMode="cover" 
              />
            ) : (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing="back"
                // expo-camera's naming is inverted from what it looks like:
                // "off" = continuously autofocus as needed (what we want for
                // close-up specimens at varying distances). "on" = focus
                // once then LOCK -- if that locked on something far away
                // when the screen first opened, every later close-up shot
                // would be stuck out-of-focus, matching the "farsighted"
                // symptom. Explicit here so it can't silently regress.
                autofocus="off"
                zoom={0}
              />
            )}

          </>
        ) : (
          // Camera permission denied. Simulation no longer exists, so there's
          // no "SIMULATION MODE" -- the centered prompt below shows the
          // "Camera permission required" message + Enable link instead.
          <View style={StyleSheet.absoluteFillObject} />
        )}

        <View style={styles.cameraMockup}>
          {/* Corner brackets */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          {/* Top pill: ready-state prompt / kept count, kept OUT of the
              center so it never covers the specimen being scanned. */}
          {isScanning && !isLoading && !pendingReview && !scanError && (
            <View style={styles.capturePillWrap} pointerEvents="none">
              <View style={styles.glassBadge}>
                <Text style={styles.glassBadgeText}>
                  {pendingScans.length > 0
                    ? `${pendingScans.length} KEPT · READY FOR NEXT`
                    : 'READY · PRESS CAPTURE'}
                </Text>
              </View>
            </View>
          )}

          {/* Render local bounding boxes ONLY for simulation mode */}
          {source === 'simulation' && specimens.length > 0 && !isLoading && specimens.map((spec, idx) => (
            <Animated.View
              key={spec.id || idx}
              style={[
                styles.boundingBox,
                {
                  top: `${spec.box.y * 100}%`,
                  left: `${spec.box.x * 100}%`,
                  width: `${spec.box.w * 100}%`,
                  height: `${spec.box.h * 100}%`,
                  opacity: boundingBoxOpacity,
                  borderColor: spec.qcStatus === 'flagged' ? '#ef4444' : '#10b981',
                },
              ]}
            >
              <View style={[styles.boxCorner, styles.boxCornerTL, spec.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />
              <View style={[styles.boxCorner, styles.boxCornerTR, spec.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />
              <View style={[styles.boxCorner, styles.boxCornerBL, spec.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />
              <View style={[styles.boxCorner, styles.boxCornerBR, spec.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />

              <View style={[styles.boundingBoxLabel, spec.qcStatus === 'flagged' && { backgroundColor: '#ef4444' }]}>
                <Text style={styles.boundingBoxText}>
                  {spec.species} ({Math.round(spec.confidence * 100)}%) - {spec.qcStatus === 'flagged' ? 'FLAGGED' : 'PASS'}
                </Text>
              </View>
            </Animated.View>
          ))}

          {/* Render individual PART bounding boxes ONLY for simulation mode */}
          {source === 'simulation' && rawParts.length > 0 && !isLoading && rawParts.map((part, idx) => (
            <Animated.View
              key={`part-${idx}`}
              style={[
                styles.partBox,
                {
                  top: `${part.box.y * 100}%`,
                  left: `${part.box.x * 100}%`,
                  width: `${part.box.w * 100}%`,
                  height: `${part.box.h * 100}%`,
                  opacity: boundingBoxOpacity,
                  borderColor: PART_COLORS[part.name] || '#888',
                },
              ]}
            >
              <View style={[styles.partBoxLabel, { backgroundColor: PART_COLORS[part.name] || '#888' }]}>
                <Text style={styles.partBoxText}>
                  {part.name} {(part.confidence * 100).toFixed(0)}%
                </Text>
              </View>
            </Animated.View>
          ))}

          {!pendingReview && (
            apiStatus === 'offline' && !isScanning ? (
              <View style={styles.offlineCard}>
                <WifiOff size={30} color="#ef4444" style={{ marginBottom: 10 }} />
                <Text style={styles.offlineCardTitle}>AI SERVER UNREACHABLE</Text>
                <Text style={styles.offlineCardSub}>We can't reach the AI right now. Check your Wi-Fi, or let your supervisor know.</Text>
                <TouchableOpacity onPress={checkApiConnection} style={styles.offlineCardBtn} activeOpacity={0.8}>
                  <Text style={styles.offlineCardBtnText}>RETRY CONNECTION</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center', zIndex: 10 }}>
                {!isScanning && (
                  <Camera size={52} color={SKY} style={{ marginBottom: 10 }} />
                )}
                <Text style={[styles.cameraText, isScanning && styles.cameraTextActive]}>
                  {isLoading
                    ? (apiStatus === 'connected' ? 'Analyzing frame with best.pt model...' : 'Running WISP-FLOW simulation...')
                    : isScanning
                      // Ready-state prompt moved to a top pill (see capturePill
                      // below) so it doesn't block the specimen in the center.
                      // Only errors stay centered here.
                      ? (scanError || '')
                      : permission?.granted
                        ? ''
                        : 'Camera permission required to scan.'}
                </Text>
                {!permission?.granted && !isScanning && (
                  <TouchableOpacity onPress={requestPermission} style={{ marginTop: 8 }} activeOpacity={0.7}>
                    <Text style={{ color: SKY, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>
                      Enable Camera Access
                    </Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )
          )}


          {/* Scanning sweep laser */}
          {isScanning && isLoading && (
            <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
          )}
        </View>

        {/* Controls -- hidden during review so nothing floats over the frozen
            frame; the review panel's Retake/Keep are the only actions then.
            Also hidden while the server is offline and idle: the AI SERVER
            UNREACHABLE card above already owns that state with its own RETRY,
            so the redundant grayed-out "Server Offline" button is dropped. */}
        {!pendingReview && !(apiStatus === 'offline' && !isScanning) && (
        <View style={styles.cameraControls}>
          {!isScanning ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[
                  styles.startButton,
                  // Cooldown ("clearing the table" between scans) uses the
                  // app's amber accent, not dead gray -- it's a transient
                  // wait state, not a disabled one. Offline stays gray.
                  isCooldown && { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
                  apiStatus === 'offline' && { backgroundColor: '#E5E7EB', borderColor: '#E5E7EB' },
                  isRepairMode && apiStatus !== 'offline' && !isCooldown && { borderColor: '#f59e0b', borderWidth: 1.5 },
                ]}
                onPress={handleCapture}
                disabled={isCooldown || apiStatus === 'offline'}
              >
                {isRepairMode && apiStatus !== 'offline'
                  ? <RefreshCw size={18} color="#f59e0b" style={{ marginRight: 8 }} />
                  : <Camera size={18} color="#F5F5F7" style={{ marginRight: 8 }} />}
                <Text style={[styles.mainButtonText, { color: '#F5F5F7', letterSpacing: 3, textTransform: 'uppercase' }]}>
                  {apiStatus === 'offline'
                    ? 'Server Offline'
                    : isCooldown
                      ? 'Clear Table...'
                      : isRepairMode
                        ? 'Start Re-Scan'
                        : 'Start Scan'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.scanningControls}>
              {!isLoading && !pendingReview && (
                <TouchableOpacity style={styles.scanNextButton} onPress={handleCapture}>
                  <Camera size={15} color="#5B21D9" style={{ marginRight: 6 }} />
                  <Text style={[styles.mainButtonText, { color: '#5B21D9' }]}>Capture</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.stopButton} onPress={handleEndSessionPress}>
                <Square size={15} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.mainButtonText}>End Session</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        )}
      </View>

      {/* ── Results Panel ── */}
      <View style={[styles.resultsContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>

        {pendingReview ? (
          /* ── Scan Review: fills this whole panel (the space between the
             camera and where it ends, right above Pending Scans) instead
             of floating over the camera. Retake discards; Keep is only
             offered when nothing is flagged -- a flagged specimen needs
             the artisan to physically fix it first, so there's nothing
             valid to keep yet. ── */
          (() => {
            const revSpecimens = pendingReview.specimens;
            const flaggedItems = revSpecimens.filter(s => s.qcStatus !== 'pass');
            const hasFlagged = flaggedItems.length > 0;

            return (
              <View style={{ flex: 1 }}>
                {/* Content area fills the panel and centers short results
                    (pass / no-specimen) so they don't sit at the top with a
                    big empty gap below; flagged stays top-aligned to scroll. */}
                <View style={{ flex: 1, justifyContent: hasFlagged ? 'flex-start' : 'center' }}>
                  {revSpecimens.length === 0 ? (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <AlertCircle color="#f59e0b" size={34} />
                      <Text style={{ color: '#111827', fontSize: 17, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' }}>Nothing in frame</Text>
                      <Text style={{ color: '#6B7280', fontSize: 15, textAlign: 'center' }}>Center the specimen in the frame, then retake.</Text>
                    </View>
                  ) : hasFlagged ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <AlertCircle color="#ef4444" size={20} />
                        <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' }}>Flagged — Needs Fixing</Text>
                      </View>
                      <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                        <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 0, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                          {flaggedItems.map((f, idx) => {
                            const missing = describeMissingParts(f.partsRequired, f.partsFound);
                            return (
                              <Text key={idx} style={{ color: '#7f1d1d', fontSize: 15, marginBottom: 3 }}>
                                • <Text style={{ fontWeight: '700' }}>{f.species}</Text>: Missing {missing.length > 0 ? missing.join(', ') : 'unknown'}
                              </Text>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <CheckCircle color="#10b981" size={26} />
                        <Text style={{ color: '#10b981', fontSize: 18, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {revSpecimens.length} {revSpecimens.length === 1 ? 'Specimen' : 'Specimens'} Passed
                        </Text>
                      </View>
                      {/* Show what was actually detected so the panel is
                          informative, not just a lone checkmark. */}
                      {revSpecimens.map((s, i) => (
                        <View key={i} style={{ width: '100%', backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', padding: 12 }}>
                          <Text style={{ fontSize: 17, fontWeight: '700', fontStyle: 'italic', color: '#111827', textAlign: 'center' }}>{s.species}</Text>
                          {s.commonName && s.commonName !== s.species && (
                            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 2 }}>{s.commonName}</Text>
                          )}
                          {s.partsFound && Object.keys(s.partsFound).length > 0 && (
                            <Text style={{ fontSize: 14, color: '#10b981', fontWeight: '600', textAlign: 'center', marginTop: 6 }}>
                              {Object.entries(s.partsFound).map(([k, v]) => `${v} ${k}`).join(' · ')}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {pendingScans.length > 0 && (
                  <Text style={{ color: '#6B7280', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
                    {pendingScans.length} kept this session
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[{ flex: 1, paddingVertical: 13, borderRadius: 0, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }, (revSpecimens.length === 0 || hasFlagged) && { flex: 1 }]}
                    onPress={handleRetake}
                  >
                    <Text style={{ color: '#5B21D9', fontSize: 15, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>Retake</Text>
                  </TouchableOpacity>
                  {revSpecimens.length > 0 && !hasFlagged && (
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 13, borderRadius: 0, backgroundColor: '#5B21D9', alignItems: 'center' }}
                      onPress={handleKeepScan}
                    >
                      <Text style={{ color: '#F5F5F7', fontSize: 15, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' }}>Keep</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })()
        ) : (
          <>
            {/* Detection results header */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Detection Results</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {source === 'api' && (
                  <View style={styles.aiSourceBadge}>
                    <Text style={styles.aiSourceText}>AI</Text>
                  </View>
                )}
                {source === 'simulation' && (
                  <View style={styles.simSourceBadge}>
                    <Text style={styles.simSourceText}>SIM</Text>
                  </View>
                )}
                <View style={[styles.detectionCount, specimens.length === 0 && styles.detectionCountZero]}>
                  <Text style={styles.detectionCountText}>{specimens.length}</Text>
                </View>
              </View>
            </View>

            {source === 'simulation' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: '#F59E0B', marginHorizontal: 0, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <AlertCircle size={13} color="#F59E0B" />
                <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>SIMULATION MODE — results are not from the AI model</Text>
              </View>
            )}

            {isLoading ? (
              <View style={styles.detectionLoadingRow}>
                <ActivityIndicator size="small" color={SKY} />
                <Text style={styles.emptyStateText}>
                  {apiStatus === 'connected' ? 'Sending frame to best.pt model…' : 'Running WISP-FLOW detection logic…'}
                </Text>
              </View>
            ) : specimens.length > 0 ? (
              <ScrollView
                style={styles.specimensScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {specimens.map((spec, idx) => (
                  <View
                    key={spec.id || idx}
                    style={[
                      styles.detectionCard,
                      specimens.length > 1 && { marginBottom: 6 },
                    ]}
                  >
                    <View style={styles.detectionInfo}>
                      <View style={[styles.colorIndicator, {
                        backgroundColor: spec.qcStatus === 'flagged' ? '#ef4444' : '#10b981'
                      }]} />
                      <View style={styles.specimenTexts}>
                        <Text style={styles.specimenScientific}>{spec.species}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {spec.commonName !== spec.species && (
                            <Text style={styles.specimenCommon}>{spec.commonName}</Text>
                          )}
                          <View style={[
                            styles.qcBadge,
                            spec.qcStatus === 'pass' ? styles.qcBadgePass : styles.qcBadgeFlagged
                          ]}>
                            <Text style={[
                              styles.qcBadgeText,
                              spec.qcStatus === 'pass' ? styles.qcBadgeTextPass : styles.qcBadgeTextFlagged
                            ]}>
                              {spec.qcStatus === 'pass' ? 'PASS' : 'FLAGGED'}
                            </Text>
                          </View>
                        </View>

                        {/* Parts breakdown with color-coded pills */}
                        {Object.keys(spec.partsFound).length > 0 && (
                          <View style={styles.partsBreakdown}>
                            {Object.entries(spec.partsFound).map(([partName, count]) => (
                              <View
                                key={partName}
                                style={[styles.partPill, { borderColor: PART_COLORS[partName] || '#888' }]}
                              >
                                <View style={[styles.partPillDot, { backgroundColor: PART_COLORS[partName] || '#888' }]} />
                                <Text style={[styles.partPillText, { color: PART_COLORS[partName] || '#888' }]}>
                                  {count} {partName}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Required vs found comparison */}
                        {spec.partsRequired && Object.keys(spec.partsRequired).length > 0 && (
                          <Text style={styles.requiredText}>
                            Required: {Object.entries(spec.partsRequired).map(([k, v]) => `${v} ${k}`).join(', ')}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : scanError ? (
              // ── Error state: human, on-brand, never a dead end — always a
              //    way forward (enable the camera, or try the scan again). ──
              <View style={styles.emptyState}>
                <View style={styles.emptyErrorBadge}>
                  <AlertCircle size={30} color="#EF4444" />
                </View>
                <Text style={styles.emptyStateTitle}>Can't scan just yet</Text>
                <Text style={styles.emptyStateSubtext}>{scanError}</Text>
                <TouchableOpacity
                  style={styles.onboardCta}
                  onPress={scanError.toLowerCase().includes('camera') ? requestPermission : handleCapture}
                  activeOpacity={0.85}
                >
                  <RefreshCw size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.onboardCtaText}>
                    {scanError.toLowerCase().includes('camera') ? 'Enable Camera' : 'Try Again'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : isScanning ? (
              <View style={styles.emptyState}>
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Camera size={28} color="#5B21D9" />
                </Animated.View>
                <Text style={styles.emptyStateText}>Reading the frame…</Text>
              </View>
            ) : (
              // ── Onboarding empty state: teaches the operator what this does
              //    and how to use it BEFORE the first scan. Five rules:
              //    illustration · human tone · context · onboarding · primary CTA. ──
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.emptyOnboard}
                showsVerticalScrollIndicator={false}
              >
                {/* Alive viewfinder illustration — echoes the camera brackets
                    above, with a sweeping scan line and an AI sparkle badge. */}
                <View style={styles.illoFrame}>
                  <View style={[styles.illoBracket, styles.illoTL]} />
                  <View style={[styles.illoBracket, styles.illoTR]} />
                  <View style={[styles.illoBracket, styles.illoBL]} />
                  <View style={[styles.illoBracket, styles.illoBR]} />
                  <Camera size={30} color="#DDD6FE" />
                  <Animated.View
                    style={[styles.illoSweep, {
                      transform: [{ translateY: idleSweep.interpolate({ inputRange: [0, 1], outputRange: [-24, 24] }) }],
                    }]}
                  />
                  <View style={styles.illoAiBadge}>
                    <Sparkles size={11} color="#FFFFFF" />
                  </View>
                </View>

                <Text style={styles.onboardTitle}>Ready to inspect</Text>
                <Text style={styles.onboardContext}>
                  No more counting by hand or writing in notebooks.
                </Text>

                <View style={styles.onboardSteps}>
                  <View style={styles.onboardStep}>
                    <View style={styles.onboardStepNum}><Text style={styles.onboardStepNumText}>1</Text></View>
                    <Text style={styles.onboardStepText}>Lay one or more specimens inside the frame</Text>
                  </View>
                  <View style={styles.onboardStep}>
                    <View style={styles.onboardStepNum}><Text style={styles.onboardStepNumText}>2</Text></View>
                    <Text style={styles.onboardStepText}>Tap Start Scan</Text>
                  </View>
                  <View style={styles.onboardStep}>
                    <View style={styles.onboardStepNum}><Text style={styles.onboardStepNumText}>3</Text></View>
                    <Text style={styles.onboardStepText}>Keep the passes, flag anything missing</Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </>
        )}

        {/* ── Pending Scans: kept captures awaiting Confirm. Nothing here
            has been saved to Supabase/the stage log yet. ── */}
        {!pendingReview && pendingScans.length > 0 && (
          <View style={styles.sessionLogContainer}>

            <View style={styles.sessionLogHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.sessionLogTitle}>Pending Scans</Text>
                <View style={styles.sessionCountBadge}>
                  <Text style={styles.sessionCountText}>{pendingScans.length}</Text>
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.sessionLogScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {(() => {
                // Group kept captures by their AI-detected species, so a
                // worker doing several species in one session (e.g. 5
                // Papilio ulysses in the morning, then 6 Papilio thoas in
                // the afternoon) gets a clean per-species breakdown with
                // subtotals. The species is read from the model on each
                // scan -- there's nothing to pick by hand, and a mis-tagged
                // scan can just be deleted from its group.
                const groups = {};
                for (const entry of pendingScans) {
                  const sp = entry.specimens[0]?.species || 'Unknown';
                  (groups[sp] = groups[sp] || []).push(entry);
                }
                return Object.keys(groups).sort().map(species => {
                  const entries = groups[species];
                  const common = entries[0].specimens[0]?.commonName;
                  return (
                    <View key={species} style={{ marginBottom: 6 }}>
                      <View style={styles.speciesGroupHeader}>
                        <Text style={styles.speciesGroupName} numberOfLines={1}>{species}</Text>
                        <View style={styles.speciesGroupCount}>
                          <Text style={styles.speciesGroupCountText}>×{entries.length}</Text>
                        </View>
                      </View>
                      {entries.map(entry => (
                        <View key={entry.id} style={styles.sessionLogEntry}>
                          <View style={styles.sessionEntryLeft}>
                            <View style={[styles.sessionEntryDot, { backgroundColor: '#10b981' }]} />
                            <Text style={styles.sessionEntryMeta} numberOfLines={1}>
                              {common ? common + ' · ' : ''}{entry.timestamp}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => handleDeletePending(entry.id)} style={styles.clearLogButton}>
                            <Trash2 size={15} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  );
                });
              })()}
            </ScrollView>

            {/* Confirm bar -- nothing above this has touched Supabase or the
                stage log yet. This is the only action that actually saves. */}
            <View style={styles.syncBar}>
              <TouchableOpacity
                style={[styles.syncButton, isConfirming && styles.syncButtonDisabled]}
                onPress={handleConfirmSession}
                disabled={isConfirming || pendingScans.length === 0}
              >
                {isConfirming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Upload size={14} color="#fff" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.syncButtonText}>
                  {isConfirming ? 'Confirming…' : `Confirm ${pendingScans.length} Scan${pendingScans.length === 1 ? '' : 's'}`}
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        )}

      </View>

      {/* ── API Settings Modal ── */}
      <ApiSettingsModal visible={settingsVisible} onClose={handleSettingsClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#5B21D9',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
    paddingLeft: 1,
    textAlign: 'center',
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  headerSub: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.5,
    paddingLeft: 0.5,
    textAlign: 'center',
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  apiStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  apiStatusConnected: {
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  apiStatusOffline: {
    borderColor: 'rgba(90,112,128,0.3)',
  },
  apiStatusText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tallyHeaderBadge: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tallyHeaderNum: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },

  // ── Operator Bar ──
  workerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  workerBarName: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  workerBarStats: {
    color: SKY,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Camera ──
  cameraContainer: {
    flex: 2,
    backgroundColor: '#000000',
    position: 'relative',
  },
  cameraMockup: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cameraText: {
    color: '#6B7280',
    marginTop: 14,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  cameraTextActive: {
    color: SKY,
  },
  scanLine: {
    position: 'absolute',
    left: 40,
    right: 40,
    height: 2,
    backgroundColor: '#7C3AED', // on-theme purple sweep, not plain white
    opacity: 0.85,
    top: '50%',
    borderRadius: 0,
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: SKY,
  },
  cornerTL: { top: 28, left: 28, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 28, right: 28, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 80, left: 28, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 80, right: 28, borderBottomWidth: 3, borderRightWidth: 3 },

  cameraControls: {
    position: 'absolute',
    bottom: 25,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    zIndex: 50,
  },
  scanningControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 0,
    backgroundColor: '#5B21D9',
    borderWidth: 0,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 0,
    backgroundColor: '#dc2626',
  },
  stopCountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 0,
    backgroundColor: '#f59e0b',
  },
  scanNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  mainButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    includeFontPadding: false,
  },

  // ── Results ──
  resultsContainer: {
    flex: 2,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    marginTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultsTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  aiSourceBadge: {
    backgroundColor: '#EDE9FE',
    borderRadius: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  aiSourceText: {
    color: '#5B21D9',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  simSourceBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  simSourceText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  detectionCount: {
    backgroundColor: '#5B21D9',
    width: 26,
    height: 26,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#5B21D9',
  },
  detectionCountZero: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  detectionCountText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  detectionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  specimensScroll: {
    flex: 1,
  },

  // ── Detection Card ──
  detectionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderLeftWidth: 3,
    borderLeftColor: '#5B21D9',
    marginBottom: 6,
  },
  detectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 0,
    marginRight: 12,
  },
  specimenTexts: {
    flex: 1,
  },
  specimenScientific: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  specimenCommon: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Parts breakdown with color-coded pills ──
  partsBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 5,
  },
  partPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FFFFFF',
  },
  partPillDot: {
    width: 6,
    height: 6,
    borderRadius: 0,
  },
  partPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  requiredText: {
    color: '#7C3AED',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
    fontStyle: 'italic',
  },

  // ── Session Log ──
  sessionLogContainer: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  // Per-species group header in the pending-scans list (on-theme purple).
  speciesGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F3EEFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  speciesGroupName: { flex: 1, fontSize: 14, fontWeight: '800', fontStyle: 'italic', color: '#5B21D9', letterSpacing: 0.3, marginRight: 8 },
  speciesGroupCount: { backgroundColor: '#5B21D9', paddingHorizontal: 8, paddingVertical: 2 },
  speciesGroupCountText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  sessionLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sessionLogTitle: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sessionCountBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(200,216,228,0.15)',
  },
  sessionCountText: {
    color: SKY,
    fontSize: 12,
    fontWeight: '700',
  },
  clearLogButton: {
    padding: 4,
  },
  sessionLogScroll: {
    maxHeight: 130,
  },
  sessionLogEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,43,56,0.6)',
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: '#E5E7EB',
  },
  sessionLogEntryLatest: {
    backgroundColor: 'rgba(16,185,129,0.05)',
  },
  sessionEntryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  sessionEntryDot: {
    width: 7,
    height: 7,
    borderRadius: 0,
    backgroundColor: SKY,
    flexShrink: 0,
  },
  sessionEntrySpecies: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  sessionEntryMeta: {
    color: '#7C3AED',
    fontSize: 12,
    marginTop: 1,
  },
  // ── Sync Bar ──
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 10,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5B21D9',
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 0,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    color: '#F5F5F7',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.7,
  },
  emptyStateText: {
    color: '#5B21D9',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyStateTitle: {
    color: '#111827',
    marginTop: 12,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    color: '#6B7280',
    marginTop: 4,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 21,
  },

  // ── Error state badge ──
  emptyErrorBadge: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    marginBottom: 4,
  },

  // ── Onboarding empty state ──
  emptyOnboard: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  illoFrame: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  illoBracket: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#5B21D9',
  },
  illoTL: { top: 0,    left: 0,  borderTopWidth: 2,    borderLeftWidth: 2 },
  illoTR: { top: 0,    right: 0, borderTopWidth: 2,    borderRightWidth: 2 },
  illoBL: { bottom: 0, left: 0,  borderBottomWidth: 2, borderLeftWidth: 2 },
  illoBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  illoSweep: {
    position: 'absolute',
    width: 56,
    height: 2,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
  },
  illoAiBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  onboardContext: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    maxWidth: 360,
  },
  onboardSteps: {
    alignSelf: 'stretch',
    marginTop: 20,
    marginBottom: 22,
    gap: 12,
    paddingHorizontal: 14,
  },
  onboardStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  onboardStepNum: {
    width: 22,
    height: 22,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardStepNumText: {
    color: '#5B21D9',
    fontSize: 12,
    fontWeight: '800',
  },
  onboardStepText: {
    flex: 1,
    color: '#374151',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  onboardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5B21D9',
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignSelf: 'stretch',
    marginHorizontal: 14,
    marginTop: 8,
  },
  onboardCtaDisabled: {
    backgroundColor: '#E5E7EB',
  },
  onboardCtaText: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // ── Camera Permission & Overlay Styles ──
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  cameraOverlayTop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 14,
    zIndex: 3,
  },
  glassBadge: {
    backgroundColor: 'rgba(8, 11, 15, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.6)',
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  capturePillWrap: {
    position: 'absolute',
    top: 34,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 15,
  },
  offlineCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,11,15,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginHorizontal: 24,
    maxWidth: 320,
    zIndex: 10,
  },
  offlineCardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    includeFontPadding: false,
  },
  offlineCardSub: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
  offlineCardBtn: {
    marginTop: 14,
    backgroundColor: '#ef4444',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  offlineCardBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    includeFontPadding: false,
  },
  glassBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    includeFontPadding: false,
  },

  // ── Specimen Detected Banner ──
  specimenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 10,
  },
  specimenBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 0,
    backgroundColor: '#10b981',
  },
  specimenBannerText: {
    color: '#065f46',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },

  // ── Parent Species Bounding Box ──
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: 0,
    zIndex: 20,
  },
  boxCorner: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderColor: '#34d399',
  },
  boxCornerTL: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  boxCornerTR: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  boxCornerBL: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  boxCornerBR: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
  boundingBoxLabel: {
    position: 'absolute',
    top: -22,
    left: -2,
    backgroundColor: '#10b981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
  },
  boundingBoxText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Part Bounding Box ──
  partBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 0,
    zIndex: 25,
  },
  partBoxLabel: {
    position: 'absolute',
    top: -16,
    left: -1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 0,
  },
  partBoxText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── QC Badges ──
  qcBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
    borderWidth: 1,
  },
  qcBadgePass: {
    backgroundColor: 'rgba(16,185,129,0.25)',
    borderColor: 'rgba(16,185,129,0.6)',
  },
  qcBadgeFlagged: {
    backgroundColor: 'rgba(239,68,68,0.3)',
    borderColor: 'rgba(239,68,68,0.6)',
  },
  qcBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  qcBadgeTextPass: {
    color: '#10b981',
  },
  qcBadgeTextFlagged: {
    color: '#ef4444',
  },
  qcBadgeMini: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 0,
    borderWidth: 0.5,
  },
  qcBadgeTextMini: {
    fontSize: 10,
    fontWeight: '700',
  },
  sessionLogEntryLatestFlagged: {
    backgroundColor: 'rgba(239,68,68,0.05)',
  },

  // ── Re-scan mode banner ──
  rescanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,158,11,0.25)',
  },
  rescanBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  rescanBannerSub: {
    fontSize: 13,
    color: '#5B21D9',
    fontWeight: '500',
    marginTop: 1,
  },
});
