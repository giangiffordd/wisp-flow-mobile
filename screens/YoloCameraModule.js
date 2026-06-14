import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, AlertCircle, ArrowLeft, Hash, Square, CheckCircle, RefreshCw, Upload, Trash2, ChevronRight } from 'lucide-react-native';
import { fetchRandomSpecimen, supabase } from '../src/supabaseClient';
import { CameraView, useCameraPermissions } from 'expo-camera';

const NAVY = '#2B3441';
const SKY  = '#B8D4E8';

// Fallback specimens if Supabase is unavailable
const FALLBACK_SPECIMENS = [
  { species: 'Danaus plexippus',       commonName: 'Monarch Butterfly' },
  { species: 'Morpho peleides',        commonName: 'Blue Morpho' },
  { species: 'Heliconius charithonia', commonName: 'Zebra Longwing' },
  { species: 'Graphium sarpedon',      commonName: 'Common Bluebottle' },
  { species: 'Papilio palinurus',      commonName: 'Emerald Swallowtail' },
  { species: 'Actias selene',          commonName: 'Indian Moon Moth' },
];

export default function YoloCameraModule({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const stepTitle = route?.params?.stepTitle || 'YOLO Scan';
  const stepId    = route?.params?.stepId    ?? null;

  // ── Camera permission state ──
  const [permission, requestPermission] = useCameraPermissions();

  // ── Scan state ──
  const [isScanning, setIsScanning] = useState(false);
  const [specimen, setSpecimen]     = useState(null);   // detected specimen
  const [isLoading, setIsLoading]   = useState(false);
  const [source, setSource]         = useState(null);   // 'supabase' | 'fallback'

  // Bounding box position states for realism
  const [boxPosition, setBoxPosition] = useState({ top: '30%', left: '25%', width: '50%', height: '40%' });

  // ── Counting state ──
  const [isCounting, setIsCounting] = useState(false);
  const [tally, setTally]           = useState(0);
  const tallyRef                    = useRef(0);         // live ref for interval closure
  const countIntervalRef            = useRef(null);
  const scanTimeoutRef              = useRef(null);

  // ── Session log state ──
  // Each entry: { id, species, commonName, count, source, timestamp }
  const [sessionLog, setSessionLog]     = useState([]);
  const [isSyncing, setIsSyncing]       = useState(false);
  const [syncStatus, setSyncStatus]     = useState(null); // null | 'success' | 'error'
  const [countingDone, setCountingDone] = useState(false); // true after first stop-count

  // ── Pulse animation ──
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Counter badge pop animation ──
  const tallyScale = useRef(new Animated.Value(1)).current;

  // ── Bounding box opacity animation ──
  const boundingBoxOpacity = useRef(new Animated.Value(0)).current;

  // ── Laser line sweep animation ──
  const laserAnim = useRef(new Animated.Value(0)).current;
  const translateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 240],
  });

  // ── Specimen detected banner fade animation ──
  const bannerOpacity = useRef(new Animated.Value(0)).current;

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

  // Cleanup count interval and scan timeout on unmount
  useEffect(() => {
    return () => {
      if (countIntervalRef.current) clearInterval(countIntervalRef.current);
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, []);

  // ── Animate tally badge every increment ──
  const animateTally = () => {
    Animated.sequence([
      Animated.timing(tallyScale, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.spring(tallyScale,  { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
  };

  // ── Bounding box opacity trigger ──
  useEffect(() => {
    if (specimen && !isLoading) {
      Animated.timing(boundingBoxOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
      // Fade in the specimen detected banner
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      boundingBoxOpacity.setValue(0);
      bannerOpacity.setValue(0);
    }
  }, [specimen, isLoading]);

  // ── Laser line sweep loop ──
  useEffect(() => {
    let animation;
    if (isScanning && isLoading) {
      laserAnim.setValue(0);
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1500,
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

  // ── Fetch ONE specimen on demand ──
  const doFetchSpecimen = async () => {
    setIsLoading(true);
    // Randomize bounding box coordinates for realistic look
    const randomTop = Math.floor(Math.random() * 25) + 15; // 15% to 40%
    const randomLeft = Math.floor(Math.random() * 30) + 10; // 10% to 40%
    const randomWidth = Math.floor(Math.random() * 20) + 35; // 35% to 55%
    const randomHeight = Math.floor(Math.random() * 20) + 30; // 30% to 50%
    setBoxPosition({
      top: `${randomTop}%`,
      left: `${randomLeft}%`,
      width: `${randomWidth}%`,
      height: `${randomHeight}%`
    });

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    // Simulate 3.5 seconds scanning phase before finding a specimen
    scanTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await fetchRandomSpecimen();
        const qcStatus = Math.random() < 0.7 ? 'pass' : 'flagged'; // 70% pass, 30% flagged
        if (result) {
          setSpecimen({ ...result, qcStatus });
          setSource('supabase');
        } else {
          const fb = FALLBACK_SPECIMENS[Math.floor(Math.random() * FALLBACK_SPECIMENS.length)];
          setSpecimen({ ...fb, qcStatus });
          setSource('fallback');
        }
      } catch {
        const fb = FALLBACK_SPECIMENS[Math.floor(Math.random() * FALLBACK_SPECIMENS.length)];
        const qcStatus = Math.random() < 0.7 ? 'pass' : 'flagged';
        setSpecimen({ ...fb, qcStatus });
        setSource('fallback');
      } finally {
        setIsLoading(false);
      }
    }, 3500);
  };

  // ── Start counting for a detected specimen ──
  const startCounting = () => {
    tallyRef.current = 1; // count the first detection
    setTally(1);
    setIsCounting(true);

    // Immediately fade out the Specimen Detected banner & Target Acquired pill
    Animated.timing(bannerOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();

    // Mock: increment tally every 1.5 seconds (simulates more detections)
    countIntervalRef.current = setInterval(() => {
      tallyRef.current += 1;
      setTally(tallyRef.current);
      animateTally();
    }, 1500);
  };

  // ── Stop counting, save result to session log ──
  const stopCounting = (saveToLog = false) => {
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }
    setIsCounting(false);
    setCountingDone(true);

    if (saveToLog && specimen && tallyRef.current > 0) {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        species: specimen.species,
        commonName: specimen.commonName,
        count: tallyRef.current,
        source: source,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        qcStatus: specimen.qcStatus,
      };
      setSessionLog(prev => [entry, ...prev]);
      setSyncStatus(null); // reset sync status since we have new data
    }
  };

  // ── Handle Start Scan button ──
  const handleStartScan = async () => {
    setIsScanning(true);
    setSpecimen(null);
    setSource(null);
    setTally(0);
    tallyRef.current = 0;
    setIsCounting(false);
    setCountingDone(false);
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    await doFetchSpecimen();
  };

  // ── Scan Next: keep scanning session alive, fetch another specimen ──
  const handleScanNext = async () => {
    setSpecimen(null);
    setSource(null);
    setTally(0);
    tallyRef.current = 0;
    setIsCounting(false);
    setCountingDone(false);
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }
    await doFetchSpecimen();
  };

  // ── Handle Stop Scan — save to AsyncStorage, then clear all visual state ──
  const handleStopScan = async () => {
    // If actively counting when stop pressed, save that count to log first
    const finalLog = [...sessionLog];
    if (isCounting && specimen && tallyRef.current > 0) {
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
          notes: `${e.species} ×${e.count} detected by YOLO${e.qcStatus === 'flagged' ? ' — Flagged for review' : ''}`,
        })), ...prev];
        await AsyncStorage.setItem('task_history', JSON.stringify(merged));
      } catch (err) {
        console.warn('AsyncStorage write failed:', err);
      }
    }

    // Clear all intervals and visual state
    if (countIntervalRef.current) { clearInterval(countIntervalRef.current); countIntervalRef.current = null; }
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    setIsScanning(false);
    setIsLoading(false);
    setSpecimen(null);
    setSource(null);
    setTally(0);
    tallyRef.current = 0;
    setIsCounting(false);
    setCountingDone(false);
    setSessionLog([]);
    setSyncStatus(null);
    bannerOpacity.setValue(0);
  };

  // ── Sync session log to Supabase ──
  const handleSyncSession = async () => {
    if (sessionLog.length === 0) return;
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      if (!supabase) {
        // Simulate a sync for offline mode
        await new Promise(r => setTimeout(r, 1800));
        setSyncStatus('success');
        return;
      }

      // For each session entry, try to find the matching inventory row and increment stock
      const results = await Promise.all(
        sessionLog.map(async (entry) => {
          const speciesParts = entry.species.trim().split(' ');
          const genus = speciesParts[0] || '';
          const species = speciesParts.slice(1).join(' ') || '';

          // Find the row
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

  // ── Tapping detected specimen card — prompt to start counting ──
  const handleSpecimenPress = () => {
    if (!specimen || isCounting || countingDone) return;
    Alert.alert(
      'Start Counting?',
      `Begin tallying all "${specimen.species}" detections until you tap Stop Count?`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Start Counting', onPress: startCounting },
      ]
    );
  };

  // ── Stop counting and save to log (called from button) ──
  const handleStopCount = () => {
    stopCounting(true);
  };

  return (
    <View style={styles.container}>

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
          <Text style={styles.headerSub}>YOLO Specimen Scan</Text>
        </View>
        {/* Tally badge in header top-right */}
        <Animated.View style={[styles.tallyHeaderBadge, { transform: [{ scale: tallyScale }], opacity: isCounting ? 1 : 0 }]}>
          <Text style={styles.tallyHeaderNum}>{tally}</Text>
        </Animated.View>
      </View>

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
            <CameraView style={StyleSheet.absoluteFillObject} facing="back" />
            
            {/* Status badge pinned to top when not scanning */}
            {!isScanning && (
              <View style={styles.cameraOverlayTop}>
                <View style={styles.glassBadge}>
                  <Text style={styles.glassBadgeText}>CAMERA ONLINE</Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={StyleSheet.absoluteFillObject}>
            <View style={styles.cameraOverlay}>
              <View style={styles.glassBadge}>
                <Text style={[styles.glassBadgeText, { color: '#fb7185' }]}>SIMULATOR / OFFLINE MODE</Text>
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

          {/* Bounding box overlay for realism */}
          {specimen && !isLoading && (
            <Animated.View
              style={[
                styles.boundingBox,
                {
                  top: boxPosition.top,
                  left: boxPosition.left,
                  width: boxPosition.width,
                  height: boxPosition.height,
                  opacity: boundingBoxOpacity,
                  borderColor: specimen.qcStatus === 'flagged' ? '#ef4444' : '#10b981',
                },
              ]}
            >
              <View style={[styles.boxCorner, styles.boxCornerTL, specimen.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />
              <View style={[styles.boxCorner, styles.boxCornerTR, specimen.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />
              <View style={[styles.boxCorner, styles.boxCornerBL, specimen.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />
              <View style={[styles.boxCorner, styles.boxCornerBR, specimen.qcStatus === 'flagged' && { borderColor: '#f87171' }]} />
              
              <View style={[styles.boundingBoxLabel, specimen.qcStatus === 'flagged' && { backgroundColor: '#ef4444' }]}>
                <Text style={styles.boundingBoxText}>
                  {specimen.species} ({(85 + Math.floor(Math.random() * 14))}%) - {specimen.qcStatus === 'flagged' ? 'FLAGGED' : 'PASS'}
                </Text>
              </View>
            </Animated.View>
          )}

          <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center', zIndex: 10 }}>
            {!isScanning && (
              <Camera size={52} color={SKY} style={{ marginBottom: 10 }} />
            )}
            {/* Idle/loading/counting status — only shown when NOT in target-acquired state */}
            <Text style={[styles.cameraText, isScanning && styles.cameraTextActive]}>
              {isLoading
                ? 'Scanning environment with YOLOv8...'
                : isScanning
                  ? isCounting
                    ? `Tracking ${specimen?.species ?? 'specimen'}…`
                    : '' // target acquired pill shown separately below
                  : permission?.granted
                    ? 'System ready. Press Start Scan.'
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

          {/* Specimen Detected Banner — pinned bottom of camera, fades away when counting starts */}
          {specimen && !isLoading && !isCounting && (
            <Animated.View style={[styles.specimenBanner, { opacity: bannerOpacity }]}>
              <View style={styles.specimenBannerDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.specimenBannerText}>
                  Specimen Detected - Tap specimen below to count
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
            <TouchableOpacity 
              style={styles.startButton} 
              onPress={handleStartScan}
            >
              <Camera size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.mainButtonText}>Start Scan</Text>
            </TouchableOpacity>
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

        {/* Live Detection row */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Live Detection</Text>
          <View style={[styles.detectionCount, !specimen && styles.detectionCountZero]}>
            <Text style={styles.detectionCountText}>{specimen ? '1' : '0'}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.detectionLoadingRow}>
            <ActivityIndicator size="small" color={SKY} />
            <Text style={styles.emptyStateText}>Scanning for specimen…</Text>
          </View>
        ) : specimen ? (
          <TouchableOpacity
            style={[
              styles.detectionCard,
              isCounting && styles.detectionCardCounting,
              countingDone && !isCounting && styles.detectionCardDone,
            ]}
            onPress={handleSpecimenPress}
            activeOpacity={(isCounting || countingDone) ? 1 : 0.75}
          >
            <View style={styles.detectionInfo}>
              <View style={[styles.colorIndicator, {
                backgroundColor: isCounting 
                  ? '#f59e0b' 
                  : specimen.qcStatus === 'flagged' 
                    ? '#ef4444' 
                    : '#10b981'
              }]} />
              <View style={styles.specimenTexts}>
                <Text style={styles.specimenScientific}>{specimen.species}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.specimenCommon}>{specimen.commonName}</Text>
                  <View style={[
                    styles.qcBadge,
                    specimen.qcStatus === 'pass' ? styles.qcBadgePass : styles.qcBadgeFlagged
                  ]}>
                    <Text style={[
                      styles.qcBadgeText,
                      specimen.qcStatus === 'pass' ? styles.qcBadgeTextPass : styles.qcBadgeTextFlagged
                    ]}>
                      {specimen.qcStatus === 'pass' ? 'PASS' : 'FLAGGED'}
                    </Text>
                  </View>
                </View>
                {!isCounting && !countingDone && (
                  <Text style={styles.tapHint}>Tap to start counting</Text>
                )}
                {countingDone && (
                  <Text style={[styles.tapHint, specimen.qcStatus === 'flagged' ? { color: '#ef4444' } : { color: '#10b981' }]}>
                    {specimen.qcStatus === 'flagged' ? `⚠ Logged ${tally} to session (Flagged)` : `✓ Logged ${tally} to session`}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.rightMeta}>
              {isCounting ? (
                <Animated.View style={[styles.tallyBadge, { transform: [{ scale: tallyScale }] }]}>
                  <Hash size={12} color={SKY} style={{ marginBottom: 1 }} />
                  <Text style={styles.tallyNum}>{tally}</Text>
                  <Text style={styles.tallyLabel}>counted</Text>
                </Animated.View>
              ) : countingDone ? (
                <View style={styles.doneBadge}>
                  <CheckCircle size={14} color="#10b981" />
                  <Text style={styles.doneText}>{tally}</Text>
                </View>
              ) : (
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>
                    {(85 + Math.floor(Math.random() * 14))}%
                  </Text>
                </View>
              )}
              {source === 'fallback' && (
                <Text style={styles.sourceTag}>Offline</Text>
              )}
              {source === 'supabase' && (
                <Text style={[styles.sourceTag, styles.sourceTagLive]}>Live DB</Text>
              )}
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyState}>
            <AlertCircle size={28} color={isScanning ? SKY : '#475569'} />
            <Text style={styles.emptyStateText}>
              {isScanning ? 'Scanning environment…' : 'Press Start Scan to detect a specimen'}
            </Text>
          </View>
        )}

        {/* Counting live summary */}
        {isCounting && specimen && (
          <View style={styles.countingSummaryRow}>
            <View style={styles.countingDot} />
            <Text style={styles.countingSummaryText}>
              Counting <Text style={styles.countingSummaryBold}>{specimen.species}</Text> — {tally} detected so far
            </Text>
          </View>
        )}

        {/* ── Session Log ── */}
        {sessionLog.length > 0 && (
          <View style={styles.sessionLogContainer}>

            {/* Session log header */}
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

            {/* Log entries */}
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
                    </View>
                  </View>
                  <View style={styles.sessionEntryRight}>
                    <Text style={styles.sessionEntryCount}>+{entry.count}</Text>
                    {entry.source === 'supabase' && (
                      <Text style={[styles.sourceTag, styles.sourceTagLive, { fontSize: 8 }]}>DB</Text>
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
  countingRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#f59e0b',
    opacity: 0.35,
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
  sourceTagLive: {
    color: SKY,
    borderColor: 'rgba(184,212,232,0.3)',
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

  // ── Camera Permission & Realism Overlay Styles ──
  permissionContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    zIndex: 100,
  },
  permissionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: NAVY,
    borderColor: SKY,
    borderWidth: 2,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
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
  disabledButton: {
    opacity: 0.5,
    backgroundColor: '#334155',
    borderColor: '#475569',
  },

  // ── Specimen Detected Banner ──
  specimenBanner: {
    position: 'absolute',
    bottom: 78,        // just above camera controls row
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
  specimenBannerSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },

  // ── Target Acquired pill (top-right, out of center) ──
  targetAcquiredPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    zIndex: 25,
  },
  targetAcquiredDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  targetAcquiredText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Bounding Box Realism Styles ──
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
});
