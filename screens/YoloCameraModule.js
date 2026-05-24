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
} from 'react-native';
import { Camera, AlertCircle, ArrowLeft, Hash, Square } from 'lucide-react-native';
import { fetchRandomSpecimen } from '../src/supabaseClient';
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
    } else {
      boundingBoxOpacity.setValue(0);
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
        if (result) {
          setSpecimen(result);
          setSource('supabase');
        } else {
          const fb = FALLBACK_SPECIMENS[Math.floor(Math.random() * FALLBACK_SPECIMENS.length)];
          setSpecimen(fb);
          setSource('fallback');
        }
      } catch {
        const fb = FALLBACK_SPECIMENS[Math.floor(Math.random() * FALLBACK_SPECIMENS.length)];
        setSpecimen(fb);
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

    // Mock: increment tally every 1.5 seconds (simulates more detections)
    countIntervalRef.current = setInterval(() => {
      tallyRef.current += 1;
      setTally(tallyRef.current);
      animateTally();
    }, 1500);
  };

  // ── Stop counting and save result ──
  const stopCounting = () => {
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }
    setIsCounting(false);
  };

  // ── Handle Start Scan button ──
  const handleStartScan = async () => {
    setIsScanning(true);
    setSpecimen(null);
    setSource(null);
    setTally(0);
    tallyRef.current = 0;
    setIsCounting(false);
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

  // ── Handle Stop Scan — navigate back with count data if counting ──
  const handleStopScan = () => {
    stopCounting();
    setIsScanning(false);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    setIsLoading(false);

    if (isCounting && specimen && stepId !== null) {
      const finalCount = tallyRef.current;
      const specimenName = specimen.species;
      // Navigate back to Workflow tab passing the scan result
      navigation && navigation.navigate('MainTabs', {
        screen: 'Workflow',
        params: {
          scanResult: { stepId, count: finalCount, specimenName },
        },
      });
    } else {
      navigation && navigation.goBack();
    }
  };

  // ── Tapping detected specimen card — prompt to start counting ──
  const handleSpecimenPress = () => {
    if (!specimen || isCounting) return;
    Alert.alert(
      'Start Counting?',
      `Begin tallying all "${specimen.species}" detections until you stop the scan?`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Start Counting', onPress: startCounting },
      ]
    );
  };

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
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
            
            {/* Dark glassmorphic layer when not scanning */}
            {!isScanning && (
              <View style={styles.cameraOverlay}>
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
                },
              ]}
            >
              <View style={[styles.boxCorner, styles.boxCornerTL]} />
              <View style={[styles.boxCorner, styles.boxCornerTR]} />
              <View style={[styles.boxCorner, styles.boxCornerBL]} />
              <View style={[styles.boxCorner, styles.boxCornerBR]} />
              
              <View style={styles.boundingBoxLabel}>
                <Text style={styles.boundingBoxText}>
                  {specimen.species} ({(85 + Math.floor(Math.random() * 14))}%)
                </Text>
              </View>
            </Animated.View>
          )}

          <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center', zIndex: 10 }}>
            {!isScanning && (
              <Camera size={52} color={SKY} style={{ marginBottom: 10 }} />
            )}
            <Text style={[styles.cameraText, isScanning && styles.cameraTextActive]}>
              {isLoading
                ? 'Scanning environment with YOLOv8...'
                : isScanning
                  ? isCounting
                    ? `Tracking ${specimen?.species ?? 'specimen'}…`
                    : 'Target acquired — tap specimen below to count'
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

          {/* Scanning sweep laser */}
          {isScanning && isLoading && (
            <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
          )}

          {/* Counting pulse ring */}
          {isCounting && (
            <View style={styles.countingRing} />
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
            <TouchableOpacity style={styles.stopButton} onPress={handleStopScan}>
              <Square size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.mainButtonText}>Stop Scan</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Results Panel ── */}
      <View style={styles.resultsContainer}>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Live Detection</Text>
          <View style={[styles.detectionCount, !specimen && styles.detectionCountZero]}>
            <Text style={styles.detectionCountText}>{specimen ? '1' : '0'}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.emptyState}>
            <AlertCircle size={28} color={SKY} />
            <Text style={styles.emptyStateText}>Fetching specimen from inventory…</Text>
          </View>
        ) : specimen ? (
          <TouchableOpacity
            style={[styles.detectionCard, isCounting && styles.detectionCardCounting]}
            onPress={handleSpecimenPress}
            activeOpacity={isCounting ? 1 : 0.75}
          >
            <View style={styles.detectionInfo}>
              <View style={[styles.colorIndicator, { backgroundColor: isCounting ? '#f59e0b' : '#10b981' }]} />
              <View style={styles.specimenTexts}>
                <Text style={styles.specimenScientific}>{specimen.species}</Text>
                <Text style={styles.specimenCommon}>{specimen.commonName}</Text>
                {!isCounting && (
                  <Text style={styles.tapHint}>Tap to start counting</Text>
                )}
              </View>
            </View>
            <View style={styles.rightMeta}>
              {isCounting ? (
                /* Tally counter */
                <Animated.View style={[styles.tallyBadge, { transform: [{ scale: tallyScale }] }]}>
                  <Hash size={12} color={SKY} style={{ marginBottom: 1 }} />
                  <Text style={styles.tallyNum}>{tally}</Text>
                  <Text style={styles.tallyLabel}>counted</Text>
                </Animated.View>
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
            <AlertCircle size={32} color="#cbd5e1" />
            <Text style={styles.emptyStateText}>
              {isScanning ? 'Scanning…' : 'Press Start Scan to detect a specimen'}
            </Text>
          </View>
        )}

        {/* Counting summary row */}
        {isCounting && specimen && (
          <View style={styles.countingSummaryRow}>
            <View style={styles.countingDot} />
            <Text style={styles.countingSummaryText}>
              Counting <Text style={styles.countingSummaryBold}>{specimen.species}</Text> — {tally} detected so far
            </Text>
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
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 50,
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
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#dc2626',
  },
  mainButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },

  // ── Results ──
  resultsContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: -20,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultsTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  detectionCount: {
    backgroundColor: '#2B3441',
    width: 28,
    height: 28,
    borderRadius: 14,
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
    fontSize: 14,
  },

  // ── Detection Card ──
  detectionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detectionCardCounting: {
    borderColor: '#f59e0b',
    borderWidth: 1.5,
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
    marginTop: 14,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10,
    padding: 10,
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
    fontSize: 12,
    flex: 1,
  },
  countingSummaryBold: {
    color: '#f59e0b',
    fontWeight: '700',
    fontStyle: 'italic',
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
});
