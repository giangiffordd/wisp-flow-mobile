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
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, AlertCircle, ArrowLeft, Hash, Square, CheckCircle, RefreshCw, Upload, Trash2, Wifi, WifiOff } from 'lucide-react-native';
import { supabase } from '../src/services/supabaseService';
import { checkHealth, predictImage } from '../src/services/yoloApiService';
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

const NAVY = '#2B3441';
const SKY  = '#B8D4E8';

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
  const [workerName] = useState('Operator');
  const [dailyStats, setDailyStats] = useState({ scanned: 0, passed: 0 });
  const [isCooldown, setIsCooldown] = useState(false);
  const [isRepairMode, setIsRepairMode] = useState(false);
  const [scanSummaryData, setScanSummaryData] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // ── Selected specimen for counting ──
  const [selectedIdx, setSelectedIdx]     = useState(null);
  const [isCounting, setIsCounting]       = useState(false);
  const [tally, setTally]                 = useState(0);
  const tallyRef                          = useRef(0);
  const countIntervalRef                  = useRef(null);

  // ── Session log state ──
  const [sessionLog, setSessionLog]     = useState([]);
  const [isSyncing, setIsSyncing]       = useState(false);
  const [syncStatus, setSyncStatus]     = useState(null);
  const [countingDone, setCountingDone] = useState(false);

  // ── Animations ──
  const pulseAnim        = useRef(new Animated.Value(1)).current;
  const tallyScale       = useRef(new Animated.Value(1)).current;
  const boundingBoxOpacity = useRef(new Animated.Value(0)).current;
  const bannerOpacity    = useRef(new Animated.Value(0)).current;
  const laserAnim        = useRef(new Animated.Value(0)).current;
  const translateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 240],
  });

  // ── Check API connection on mount and when settings close ──
  const checkApiConnection = useCallback(async () => {
    setApiStatus('checking');
    const result = await checkHealth();
    setApiStatus(result.reachable && result.modelLoaded ? 'connected' : 'offline');
  }, []);

  useEffect(() => {
    checkApiConnection();
  }, [checkApiConnection]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countIntervalRef.current) clearInterval(countIntervalRef.current);
    };
  }, []);

  // ── Animate tally badge ──
  const animateTally = () => {
    Animated.sequence([
      Animated.timing(tallyScale, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.spring(tallyScale,  { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
  };

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

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        skipProcessing: true,
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
        setSelectedIdx(null);
        
        // Prompt user immediately
        setTimeout(() => {
          promptSaveAndSync(mappedSpecimens, result.annotated_image_base64);
        }, 500);
        return;
      }

      if (result && result.status === 'success' && result.specimens && result.specimens.length === 0) {
        setScanError('None detected — aim at the specimen and try again.');
        setSpecimens([]);
        setRawParts([]);
        setSource('api');
        return;
      }

      throw new Error('API returned no data');
    } catch (err) {
      console.warn('Real scan failed, falling back to simulation:', err.message);
      await doSimulatedScan();
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
      setSelectedIdx(null);
    } catch (err) {
      console.warn('Simulation error:', err);
      setScanError('Simulation failed. Please try again.');
    }
  };

  // ── Start counting for a detected specimen ──
  const startCounting = (idx) => {
    setSelectedIdx(idx);
    tallyRef.current = 1;
    setTally(1);
    setIsCounting(true);

    Animated.timing(bannerOpacity, {
      toValue: 0, duration: 150, useNativeDriver: true,
    }).start();

    countIntervalRef.current = setInterval(() => {
      tallyRef.current += 1;
      setTally(tallyRef.current);
      animateTally();
    }, 1500);
  };

  // ── Stop counting ──
  const stopCounting = (saveToLog = false) => {
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }
    setIsCounting(false);
    setCountingDone(true);

    if (saveToLog && selectedIdx !== null && specimens[selectedIdx] && tallyRef.current > 0) {
      const specimen = specimens[selectedIdx];
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        species: specimen.species,
        commonName: specimen.commonName,
        count: tallyRef.current,
        source: source,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        qcStatus: specimen.qcStatus,
        confidence: specimen.confidence,
        partsFound: specimen.partsFound,
        partsRequired: specimen.partsRequired,
      };
      setSessionLog(prev => [entry, ...prev]);
      setSyncStatus(null);
    }
  };

  // ── Handle Start Scan ──
  const handleStartScan = async () => {
    setIsScanning(true);
    setSpecimens([]);
    setRawParts([]);
    setAnnotatedImageBase64(null);
    setCapturedPhotoUri(null);
    setSource(null);
    setTally(0);
    tallyRef.current = 0;
    setIsCounting(false);
    setCountingDone(false);
    setSelectedIdx(null);
    setScanError(null);
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }

    if (apiStatus === 'connected' && permission?.granted) {
      await doRealScan();
    } else {
      setIsLoading(true);
      await doSimulatedScan();
      setIsLoading(false);
    }
  };

  // ── Scan Next ──
  const handleScanNext = async () => {
    setSpecimens([]);
    setRawParts([]);
    setAnnotatedImageBase64(null);
    setCapturedPhotoUri(null);
    setSource(null);
    setTally(0);
    tallyRef.current = 0;
    setIsCounting(false);
    setCountingDone(false);
    setSelectedIdx(null);
    setScanError(null);
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }

    if (apiStatus === 'connected' && permission?.granted) {
      await doRealScan();
    } else {
      setIsLoading(true);
      await doSimulatedScan();
      setIsLoading(false);
    }
  };

  // ── Handle Stop Scan ──
  const handleStopScan = async () => {
    setScanSummaryData(null);
    const finalLog = [...sessionLog];
    if (isCounting && selectedIdx !== null && specimens[selectedIdx] && tallyRef.current > 0) {
      const specimen = specimens[selectedIdx];
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        species: specimen.species,
        commonName: specimen.commonName,
        count: tallyRef.current,
        source: source,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        qcStatus: specimen.qcStatus,
        stepTitle,
        stepId,
      };
      finalLog.unshift(entry);
    }

    // Persist to AsyncStorage for Task History
    if (finalLog.length > 0) {
      try {
        const existing = await AsyncStorage.getItem('task_history');
        const prev = existing ? JSON.parse(existing) : [];
        const merged = [...finalLog.map(e => ({
          id: `scan-${e.id}`,
          batchId: stepId ? `STEP-${stepId}` : 'SCAN',
          stage: stepTitle || 'YOLO Scan',
          timestamp: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          status: e.qcStatus === 'flagged' ? 'pending' : 'approved',
          operator: 'EMP-Scan',
          notes: `${e.species} ×${e.count} detected by YOLO (${source === 'api' ? 'AI Model' : 'Simulation'})${e.qcStatus === 'flagged' ? ' — Flagged for review' : ''}`,
        })), ...prev];
        await AsyncStorage.setItem('task_history', JSON.stringify(merged));
      } catch (err) {
        console.warn('AsyncStorage write failed:', err);
      }
    }

    // Clear all state
    if (countIntervalRef.current) { clearInterval(countIntervalRef.current); countIntervalRef.current = null; }
    setIsScanning(false);
    setIsLoading(false);
    setSpecimens([]);
    setRawParts([]);
    setAnnotatedImageBase64(null);
    setCapturedPhotoUri(null);
    setSource(null);
    setTally(0);
    tallyRef.current = 0;
    setIsCounting(false);
    setCountingDone(false);
    setSelectedIdx(null);
    setSessionLog([]);
    setSyncStatus(null);
    setScanError(null);
    bannerOpacity.setValue(0);
  };

  // ── Batch mode: write result to AsyncStorage then go back ──
  const commitToBatch = async (primary, isMismatch) => {
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

    navigation.goBack();
  };

  const handleAddToBatch = () => {
    if (!batchId || specimens.length === 0) return;
    const primary = specimens[0];

    const isMismatch =
      batchSpecies &&
      primary.species.toLowerCase() !== batchSpecies.toLowerCase();

    if (isMismatch) {
      Alert.alert(
        'Species Mismatch',
        `This batch is for ${batchSpecies}.\nYou scanned ${primary.species}.\n\nWas this intentional?`,
        [
          { text: 'Add Anyway',   onPress: () => commitToBatch(primary, true) },
          { text: 'Discard Scan', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Cancel',       style: 'cancel' },
        ]
      );
      return;
    }

    commitToBatch(primary, false);
  };

  // ── Post-Scan Prompt & Save Flow ──
  const promptSaveAndSync = (detectedSpecimens, base64Image) => {
    if (!detectedSpecimens || detectedSpecimens.length === 0) return;
    // SEAMLESS FLOW: Bypass the modal and auto-save immediately.
    saveAndSyncScan(detectedSpecimens, base64Image);
  };

  const saveAndSyncScan = async (detectedSpecimens, base64Image) => {
    setScanSummaryData(null);
    setIsLoading(true);
    try {
      let passedThisScan = 0;
      let scannedThisScan = detectedSpecimens.length;
      
      // 1. Sync Inventory & Defects to Supabase
      if (supabase) {
        for (const spec of detectedSpecimens) {
          const genus = spec.species.trim().split(' ')[0] || '';
          
          if (spec.qcStatus === 'pass') {
            passedThisScan++;
            if (isRepairMode) {
              await supabase
                .from('defects')
                .insert({
                   species: spec.species,
                   missing_parts: 'Fixed (Pending Approval)',
                   status: 'pending_approval',
                   worker: workerName || 'Unknown'
                });
            } else {
              const { data: rows, error: fetchErr } = await supabase
                .from('inventory')
                .select('id, quantity, stock')
                .ilike('genus', `%${genus}%`)
                .limit(1);

              if (!fetchErr && rows && rows.length > 0) {
                const row = rows[0];
                const quantityKey = 'quantity' in row ? 'quantity' : 'stock';
                const currentQty = row[quantityKey] ?? 0;
                await supabase
                  .from('inventory')
                  .update({ [quantityKey]: currentQty + 1 })
                  .eq('id', row.id);
              }
            }
          } else {
            // It is FLAGGED, log to 'defects' table
            const required = Object.keys(spec.partsRequired || {});
            const found = Object.keys(spec.partsFound || {});
            const missing = required.filter(p => !found.includes(p));
            
            await supabase
              .from('defects')
              .insert({
                 species: spec.species,
                 missing_parts: missing.length > 0 ? missing.join(', ') : 'unknown',
                 status: 'new',
                 worker: workerName || 'Unknown'
              });
          }
        }
      }

      setDailyStats(prev => ({
         scanned: prev.scanned + scannedThisScan,
         passed: prev.passed + passedThisScan
      }));
      setDailyStats(prev => ({
         scanned: prev.scanned + scannedThisScan,
         passed: prev.passed + passedThisScan
      }));

      // 2. Persist detected species so WorkflowModule can pick it up on refocus
      if (detectedSpecimens.length > 0) {
        const primary = detectedSpecimens[0];
        const info = SPECIES_INFO[primary.rawSpecies];
        await AsyncStorage.setItem('last_detected_species', JSON.stringify({
          species: primary.species,
          commonName: info ? info.common : primary.species,
        })).catch(() => {});
      }

      // 3. Save Image to Local Database via API
      if (base64Image) {
        const primary = detectedSpecimens[0];
        const payload = {
          annotated_image_base64: base64Image,
          species: primary.species,
          confidence: primary.confidence,
          qa_status: primary.qcStatus === 'pass' ? 'PASS' : 'FLAGGED'
        };

        const apiHost = await AsyncStorage.getItem('api_host');
        if (apiHost) {
          await fetch(`http://${apiHost}/save_scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      }

      setIsLoading(false);
      setIsCooldown(true);
      setTimeout(() => setIsCooldown(false), 3000);

      // Show non-blocking toast instead of Alert
      const passCount = detectedSpecimens.filter(s => s.qcStatus === 'pass').length;
      const flaggedCount = detectedSpecimens.filter(s => s.qcStatus !== 'pass').length;
      let msg = `✅ Saved! ${passCount} Pass`;
      if (flaggedCount > 0) msg += `, ⚠️ ${flaggedCount} Flagged`;
      
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);

    } catch (err) {
      console.error("Error during save/sync:", err);
      setIsLoading(false);
      Alert.alert('Error', 'Failed to save or sync inventory.');
    }
  };

  // ── Sync session log to Supabase ──
  const handleSyncSession = async () => {
    if (sessionLog.length === 0) return;
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      if (!supabase) {
        await new Promise(r => setTimeout(r, 1800));
        setSyncStatus('success');
        return;
      }

      const results = await Promise.all(
        sessionLog.map(async (entry) => {
          const speciesParts = entry.species.trim().split(' ');
          const genus = speciesParts[0] || '';

          const { data: rows, error: fetchErr } = await supabase
            .from('inventory')
            .select('id, quantity, stock')
            .ilike('genus', `%${genus}%`)
            .limit(1);

          if (fetchErr || !rows || rows.length === 0) return false;

          const row = rows[0];
          const quantityKey = 'quantity' in row ? 'quantity' : 'stock';
          const currentQty = row[quantityKey] ?? 0;

          const { error: updateErr } = await supabase
            .from('inventory')
            .update({ [quantityKey]: currentQty + entry.count })
            .eq('id', row.id);

          return !updateErr;
        })
      );

      const allOk = results.every(Boolean);
      setSyncStatus(allOk ? 'success' : 'partial');
    } catch (err) {
      console.error('Sync error:', err);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Clear session log ──
  const handleClearSession = () => {
    Alert.alert(
      'Clear Session?',
      'This will remove all scanned entries from this session log.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => {
          setSessionLog([]);
          setSyncStatus(null);
        }},
      ]
    );
  };

  // ── Tap specimen to start counting ──
  const handleSpecimenPress = (idx) => {
    if (isCounting || countingDone) return;
    const specimen = specimens[idx];
    if (!specimen) return;
    Alert.alert(
      'Start Counting?',
      `Begin tallying all "${specimen.species}" detections until you tap Stop Count?`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Start Counting', onPress: () => startCounting(idx) },
      ]
    );
  };

  const handleStopCount = () => {
    stopCounting(true);
  };

  const selectedSpecimen = selectedIdx !== null ? specimens[selectedIdx] : (specimens.length === 1 ? specimens[0] : null);

  // Compute total parts count
  const totalPartsCount = rawParts.length;

  return (
    <View style={styles.container}>
      {/* ── Non-blocking Toast Notification ── */}
      {toastMessage && (
        <View style={{ position: 'absolute', top: insets.top + 10, alignSelf: 'center', backgroundColor: '#10b981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, zIndex: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{toastMessage}</Text>
        </View>
      )}

      {/* ── Custom Scan Summary Modal ── */}
      <Modal visible={!!scanSummaryData} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', backgroundColor: '#1e293b', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 }}>
            {scanSummaryData && (() => {
              const specimens = scanSummaryData.specimens;
              const passCount = specimens.filter(s => s.qcStatus === 'pass').length;
              const flaggedItems = specimens.filter(s => s.qcStatus !== 'pass');
              const itemWording = specimens.length === 1 ? 'specimen' : 'specimens';
              
              return (
                <>
                  <Text style={{ color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 6, textAlign: 'center' }}>Scan Summary</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>Detected {specimens.length} {itemWording}</Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 }}>
                    <View style={{ alignItems: 'center' }}>
                      <CheckCircle color="#10b981" size={32} style={{ marginBottom: 8 }} />
                      <Text style={{ color: '#10b981', fontSize: 20, fontWeight: 'bold' }}>{passCount}</Text>
                      <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>PASS</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: '#334155' }} />
                    <View style={{ alignItems: 'center' }}>
                      <AlertCircle color={flaggedItems.length > 0 ? "#ef4444" : "#64748b"} size={32} style={{ marginBottom: 8 }} />
                      <Text style={{ color: flaggedItems.length > 0 ? "#ef4444" : "#64748b", fontSize: 20, fontWeight: 'bold' }}>{flaggedItems.length}</Text>
                      <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>FLAGGED</Text>
                    </View>
                  </View>

                  {flaggedItems.length > 0 && (
                    <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                      <Text style={{ color: '#fca5a5', fontSize: 13, fontWeight: '700', marginBottom: 8 }}>FLAGGED DETAILS:</Text>
                      {flaggedItems.map((f, idx) => {
                        const required = Object.keys(f.partsRequired || {});
                        const found = Object.keys(f.partsFound || {});
                        const missing = required.filter(p => !found.includes(p));
                        return (
                          <Text key={idx} style={{ color: '#f8fafc', fontSize: 13, marginBottom: 4 }}>
                            • <Text style={{ fontWeight: '600' }}>{f.species}</Text>: Missing {missing.length > 0 ? missing.join(', ') : 'unknown'}
                          </Text>
                        );
                      })}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity 
                      style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#334155', alignItems: 'center' }}
                      onPress={handleScanNext}
                    >
                      <Text style={{ color: '#f8fafc', fontSize: 16, fontWeight: '600' }}>Discard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#3b82f6', alignItems: 'center', shadowColor: '#3b82f6', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8 }}
                      onPress={() => saveAndSyncScan(scanSummaryData.specimens, scanSummaryData.base64Image)}
                    >
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Save & Sync</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>


      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            stopCounting();
            navigation && navigation.goBack();
          }}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color="#f8fafc" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{stepTitle}</Text>
          <Text style={styles.headerSub}>WISP-FLOW AI Scan</Text>
        </View>


        {/* API status + settings button in header */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.apiStatusBadge,
              apiStatus === 'connected' && styles.apiStatusConnected,
              apiStatus === 'offline' && styles.apiStatusOffline,
            ]}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            {apiStatus === 'checking' ? (
              <ActivityIndicator size={10} color={SKY} />
            ) : apiStatus === 'connected' ? (
              <Wifi size={12} color="#10b981" />
            ) : (
              <WifiOff size={12} color="#94a3b8" />
            )}
            <Text style={[
              styles.apiStatusText,
              apiStatus === 'connected' && { color: '#10b981' },
            ]}>
              {apiStatus === 'checking' ? 'AI…' : apiStatus === 'connected' ? 'AI' : 'SIM'}
            </Text>
          </TouchableOpacity>

          {/* Tally badge */}
          {isCounting && (
            <Animated.View style={[styles.tallyHeaderBadge, { transform: [{ scale: tallyScale }] }]}>
              <Text style={styles.tallyHeaderNum}>{tally}</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* ── Operator Bar ── */}
      {workerName && (
        <View style={styles.workerBar}>
          <Text style={styles.workerBarName}>OPERATOR: {workerName.toUpperCase()}</Text>
          <Text style={styles.workerBarStats}>
            {dailyStats.scanned} scanned · {dailyStats.scanned > 0 ? Math.round((dailyStats.passed / dailyStats.scanned) * 100) : 0}% pass rate
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
              />
            )}

          </>
        ) : (
          <View style={StyleSheet.absoluteFillObject}>
            <View style={styles.cameraOverlay}>
              <View style={styles.glassBadge}>
                <Text style={[styles.glassBadgeText, { color: '#fb7185' }]}>SIMULATION MODE</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.cameraMockup}>
          {/* Corner brackets */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

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

          <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center', zIndex: 10 }}>
            {!isScanning && (
              <Camera size={52} color={SKY} style={{ marginBottom: 10 }} />
            )}
            <Text style={[styles.cameraText, isScanning && styles.cameraTextActive]}>
              {isLoading
                ? (apiStatus === 'connected' ? 'Analyzing frame with best.pt model...' : 'Running WISP-FLOW simulation...')
                : isScanning
                  ? isCounting
                    ? `Tracking ${selectedSpecimen?.species ?? 'specimen'}…`
                    : scanError
                      ? scanError
                      : ''
                  : permission?.granted
                    ? (apiStatus === 'connected'
                        ? 'AI Model connected. Press Start Scan.'
                        : 'WISP-FLOW simulation ready. Press Start Scan.')
                    : 'Camera offline. Press Start Scan to run simulation.'}
            </Text>
            {!permission?.granted && !isScanning && (
              <TouchableOpacity onPress={requestPermission} style={{ marginTop: 8 }} activeOpacity={0.7}>
                <Text style={{ color: SKY, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }}>
                  Enable Camera Access
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Specimen Detected Banner */}
          {specimens.length > 0 && !isLoading && !isCounting && (
            <Animated.View style={[styles.specimenBanner, { opacity: bannerOpacity }]}>
              <View style={styles.specimenBannerDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.specimenBannerText}>
                  {specimens.length === 1
                    ? `${specimens[0].species} — ${totalPartsCount} parts detected`
                    : `${specimens.length} Specimens — ${totalPartsCount} parts`}
                  {source === 'api' && ' (AI Model)'}
                  {source === 'simulation' && ' (Simulation)'}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Scanning sweep laser */}
          {isScanning && isLoading && (
            <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
          )}
        </View>

        {/* Controls */}
        <View style={styles.cameraControls}>
          {!isScanning ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.startButton, isCooldown && { backgroundColor: '#475569', borderColor: '#64748b' }]}
                onPress={handleStartScan}
                disabled={isCooldown}
              >
                <Camera size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.mainButtonText}>{isCooldown ? 'Clear Table...' : 'Start Scan'}</Text>
              </TouchableOpacity>
              
              {!isCooldown && (
                <TouchableOpacity
                  style={[styles.startButton, { backgroundColor: '#2B3441', paddingHorizontal: 20 }]}
                  onPress={() => {
                    setIsRepairMode(true);
                    handleStartScan();
                  }}
                >
                  <RefreshCw size={18} color="#f59e0b" style={{ marginRight: 8 }} />
                  <Text style={styles.mainButtonText}>Re-Scan Defect</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.scanningControls}>
              {isCounting ? (
                <TouchableOpacity style={styles.stopCountButton} onPress={handleStopCount}>
                  <Square size={15} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.mainButtonText}>Stop Count</Text>
                </TouchableOpacity>
              ) : countingDone ? (
                <TouchableOpacity style={styles.scanNextButton} onPress={handleScanNext}>
                  <RefreshCw size={15} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.mainButtonText}>Scan Next</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.stopButton} onPress={handleStopScan}>
                <Square size={15} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.mainButtonText}>End Session</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ── Results Panel ── */}
      <View style={styles.resultsContainer}>

        {/* Live Detection header */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Live Detection</Text>
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
            {specimens.map((spec, idx) => {
              const isSelected = selectedIdx === idx;
              const isActive = isCounting && isSelected;
              const isDone = countingDone && isSelected;

              return (
                <TouchableOpacity
                  key={spec.id || idx}
                  style={[
                    styles.detectionCard,
                    isActive && styles.detectionCardCounting,
                    isDone && styles.detectionCardDone,
                    specimens.length > 1 && { marginBottom: 6 },
                  ]}
                  onPress={() => handleSpecimenPress(idx)}
                  activeOpacity={(isCounting || countingDone) ? 1 : 0.75}
                >
                  <View style={styles.detectionInfo}>
                    <View style={[styles.colorIndicator, {
                      backgroundColor: isActive
                        ? '#f59e0b'
                        : spec.qcStatus === 'flagged'
                          ? '#ef4444'
                          : '#10b981'
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

                      {!isCounting && !countingDone && (
                        <Text style={styles.tapHint}>Tap to start counting</Text>
                      )}
                      {isDone && (
                        <Text style={[styles.tapHint, spec.qcStatus === 'flagged' ? { color: '#ef4444' } : { color: '#10b981' }]}>
                          {spec.qcStatus === 'flagged' ? `⚠ Logged ${tally} to session (Flagged)` : `✓ Logged ${tally} to session`}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.rightMeta}>
                    {isActive ? (
                      <Animated.View style={[styles.tallyBadge, { transform: [{ scale: tallyScale }] }]}>
                        <Hash size={12} color={SKY} style={{ marginBottom: 1 }} />
                        <Text style={styles.tallyNum}>{tally}</Text>
                        <Text style={styles.tallyLabel}>counted</Text>
                      </Animated.View>
                    ) : isDone ? (
                      <View style={styles.doneBadge}>
                        <CheckCircle size={14} color="#10b981" />
                        <Text style={styles.doneText}>{tally}</Text>
                      </View>
                    ) : (
                      <View style={styles.confidenceBadge}>
                        <Text style={styles.confidenceText}>
                          {Math.round(spec.confidence * 100)}%
                        </Text>
                      </View>
                    )}
                    {source === 'simulation' && (
                      <Text style={styles.sourceTag}>Sim</Text>
                    )}
                    {source === 'api' && (
                      <Text style={[styles.sourceTag, styles.sourceTagAi]}>AI Model</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <AlertCircle size={28} color={isScanning ? SKY : '#475569'} />
            <Text style={styles.emptyStateText}>
              {scanError
                ? scanError
                : isScanning
                  ? 'Running WISP-FLOW detection…'
                  : 'Press Start Scan to detect specimens'}
            </Text>
          </View>
        )}

        {/* ── Add to Batch / Confirm Re-Scan (batch mode only) ── */}
        {batchId && specimens.length > 0 && !isLoading && (
          <TouchableOpacity
            style={[styles.addToBatchBtn, { marginBottom: Math.max(insets.bottom, 12) }]}
            onPress={handleAddToBatch}
            activeOpacity={0.85}
          >
            <CheckCircle size={15} color="#fff" />
            <Text style={styles.addToBatchBtnText}>
              {scanMode === 'rescan' ? 'Confirm Re-Scan' : 'Add to Batch'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Counting live summary */}
        {isCounting && selectedSpecimen && (
          <View style={styles.countingSummaryRow}>
            <View style={styles.countingDot} />
            <Text style={styles.countingSummaryText}>
              Counting <Text style={styles.countingSummaryBold}>{selectedSpecimen.species}</Text> — {tally} detected so far
            </Text>
          </View>
        )}

        {/* ── Session Log ── */}
        {sessionLog.length > 0 && (
          <View style={styles.sessionLogContainer}>

            <View style={styles.sessionLogHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.sessionLogTitle}>Session Log</Text>
                <View style={styles.sessionCountBadge}>
                  <Text style={styles.sessionCountText}>{sessionLog.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClearSession} style={styles.clearLogButton}>
                <Trash2 size={13} color="#ef4444" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sessionLogScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {sessionLog.map((entry, idx) => (
                <View
                  key={entry.id}
                  style={[
                    styles.sessionLogEntry,
                    idx === 0 && (entry.qcStatus === 'flagged' ? styles.sessionLogEntryLatestFlagged : styles.sessionLogEntryLatest),
                  ]}
                >
                  <View style={styles.sessionEntryLeft}>
                    <View style={[
                      styles.sessionEntryDot,
                      idx === 0 && { backgroundColor: entry.qcStatus === 'flagged' ? '#ef4444' : '#10b981' }
                    ]} />
                    <View>
                      <Text style={styles.sessionEntrySpecies}>{entry.species}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 1 }}>
                        <Text style={styles.sessionEntryMeta}>{entry.commonName} · {entry.timestamp}</Text>
                        {entry.qcStatus && (
                          <View style={[
                            styles.qcBadgeMini,
                            entry.qcStatus === 'pass' ? styles.qcBadgePass : styles.qcBadgeFlagged
                          ]}>
                            <Text style={[
                              styles.qcBadgeTextMini,
                              entry.qcStatus === 'pass' ? styles.qcBadgeTextPass : styles.qcBadgeTextFlagged
                            ]}>
                              {entry.qcStatus === 'pass' ? 'PASS' : 'FLAGGED'}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Show parts found in session log */}
                      {entry.partsFound && Object.keys(entry.partsFound).length > 0 && (
                        <View style={[styles.partsBreakdown, { marginTop: 3 }]}>
                          {Object.entries(entry.partsFound).map(([partName, count]) => (
                            <View
                              key={partName}
                              style={[styles.partPillMini, { borderColor: PART_COLORS[partName] || '#888' }]}
                            >
                              <Text style={[styles.partPillTextMini, { color: PART_COLORS[partName] || '#888' }]}>
                                {count} {partName}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.sessionEntryRight}>
                    <Text style={styles.sessionEntryCount}>+{entry.count}</Text>
                    {entry.source === 'api' && (
                      <Text style={[styles.sourceTag, styles.sourceTagAi, { fontSize: 8 }]}>AI</Text>
                    )}
                    {entry.source === 'simulation' && (
                      <Text style={[styles.sourceTag, { fontSize: 8 }]}>SIM</Text>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Sync bar */}
            <View style={styles.syncBar}>
              {syncStatus === 'success' && (
                <View style={styles.syncStatusRow}>
                  <CheckCircle size={14} color="#10b981" />
                  <Text style={[styles.syncStatusText, { color: '#10b981' }]}>Synced to database!</Text>
                </View>
              )}
              {syncStatus === 'partial' && (
                <View style={styles.syncStatusRow}>
                  <AlertCircle size={14} color="#f59e0b" />
                  <Text style={[styles.syncStatusText, { color: '#f59e0b' }]}>Partially synced</Text>
                </View>
              )}
              {syncStatus === 'error' && (
                <View style={styles.syncStatusRow}>
                  <AlertCircle size={14} color="#ef4444" />
                  <Text style={[styles.syncStatusText, { color: '#ef4444' }]}>Sync failed</Text>
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.syncButton,
                  isSyncing && styles.syncButtonDisabled,
                  syncStatus === 'success' && styles.syncButtonSuccess,
                ]}
                onPress={handleSyncSession}
                disabled={isSyncing || sessionLog.length === 0}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Upload size={14} color="#fff" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.syncButtonText}>
                  {isSyncing ? 'Syncing…' : syncStatus === 'success' ? 'Re-Sync' : 'Sync to Database'}
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
    backgroundColor: '#0f172a',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2B3441',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 50,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSub: {
    color: '#B8D4E8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.5,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  apiStatusConnected: {
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  apiStatusOffline: {
    borderColor: 'rgba(148,163,184,0.2)',
  },
  apiStatusText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tallyHeaderBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tallyHeaderNum: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  // ── Operator Bar ──
  workerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  workerBarName: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  workerBarStats: {
    color: SKY,
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Camera ──
  cameraContainer: {
    flex: 3,
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
    color: '#94a3b8',
    marginTop: 14,
    fontSize: 13,
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
    backgroundColor: SKY,
    opacity: 0.6,
    top: '50%',
    borderRadius: 2,
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
    borderRadius: 28,
    backgroundColor: NAVY,
    borderWidth: 2,
    borderColor: SKY,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#dc2626',
  },
  stopCountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#f59e0b',
  },
  scanNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#2B3441',
    borderWidth: 1.5,
    borderColor: SKY,
  },
  mainButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Results ──
  resultsContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    marginTop: -20,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultsTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  aiSourceBadge: {
    backgroundColor: 'rgba(37,99,235,0.15)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.3)',
  },
  aiSourceText: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  simSourceBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  simSourceText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  detectionCount: {
    backgroundColor: '#2B3441',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SKY,
  },
  detectionCountZero: {
    backgroundColor: '#334155',
    borderColor: '#475569',
  },
  detectionCountText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  detectionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  specimensScroll: {
    maxHeight: 190,
  },

  // ── Detection Card ──
  detectionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detectionCardCounting: {
    borderColor: '#f59e0b',
    borderWidth: 1.5,
  },
  detectionCardDone: {
    borderColor: 'rgba(16,185,129,0.4)',
    borderWidth: 1.5,
    backgroundColor: 'rgba(16,185,129,0.04)',
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  doneText: {
    color: '#10b981',
    fontWeight: '800',
    fontSize: 14,
  },
  detectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  specimenTexts: {
    flex: 1,
  },
  specimenScientific: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '700',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  specimenCommon: {
    color: '#94a3b8',
    fontSize: 12,
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
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  partPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  partPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  partPillMini: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  partPillTextMini: {
    fontSize: 8,
    fontWeight: '600',
  },
  requiredText: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 3,
    fontStyle: 'italic',
  },
  tapHint: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rightMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  confidenceBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  confidenceText: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 12,
  },

  // ── Tally badge ──
  tallyBadge: {
    alignItems: 'center',
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    minWidth: 52,
  },
  tallyNum: {
    color: '#f59e0b',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  tallyLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sourceTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    backgroundColor: '#1e293b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sourceTagAi: {
    color: '#60a5fa',
    borderColor: 'rgba(96,165,250,0.3)',
    backgroundColor: 'rgba(37,99,235,0.08)',
  },

  // ── Counting summary ──
  countingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    gap: 8,
  },
  countingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
  countingSummaryText: {
    color: '#94a3b8',
    fontSize: 11,
    flex: 1,
  },
  countingSummaryBold: {
    color: '#f59e0b',
    fontWeight: '700',
    fontStyle: 'italic',
  },

  // ── Session Log ──
  sessionLogContainer: {
    marginTop: 10,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    overflow: 'hidden',
  },
  sessionLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  sessionLogTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sessionCountBadge: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(184,212,232,0.2)',
  },
  sessionCountText: {
    color: SKY,
    fontSize: 10,
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
    borderBottomColor: 'rgba(30,58,95,0.5)',
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
    borderRadius: 4,
    backgroundColor: SKY,
    flexShrink: 0,
  },
  sessionEntrySpecies: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  sessionEntryMeta: {
    color: '#475569',
    fontSize: 10,
    marginTop: 1,
  },
  sessionEntryRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  sessionEntryCount: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '800',
  },

  // ── Sync Bar ──
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e3a5f',
    gap: 10,
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  syncStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2B3441',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: SKY,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonSuccess: {
    borderColor: '#10b981',
  },
  syncButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.7,
  },
  emptyStateText: {
    color: '#cbd5e1',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  glassBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // ── Specimen Detected Banner ──
  specimenBanner: {
    position: 'absolute',
    bottom: 78,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 10,
    zIndex: 30,
  },
  specimenBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  specimenBannerText: {
    color: '#34d399',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.2,
  },

  // ── Parent Species Bounding Box ──
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: 4,
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
    borderRadius: 3,
  },
  boundingBoxText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Part Bounding Box ──
  partBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 3,
    zIndex: 25,
  },
  partBoxLabel: {
    position: 'absolute',
    top: -16,
    left: -1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  partBoxText: {
    color: '#000000',
    fontSize: 8,
    fontWeight: '800',
  },

  // ── QC Badges ──
  qcBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  qcBadgePass: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  qcBadgeFlagged: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  qcBadgeText: {
    fontSize: 9,
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
    borderRadius: 3,
    borderWidth: 0.5,
  },
  qcBadgeTextMini: {
    fontSize: 8,
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
    backgroundColor: '#fff7ed',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#fdba74',
  },
  rescanBannerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#c2410c',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  rescanBannerSub: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '500',
    marginTop: 1,
  },

  // ── Add to Batch button ──
  addToBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  addToBatchBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
