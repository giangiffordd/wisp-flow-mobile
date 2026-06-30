import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, CheckCircle2, XCircle, Package } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/services/supabaseService';
import { getWorkerSession, workerLabel } from '../src/services/workerSession';
import { speciesForPrefix } from '../src/services/specimenUid';

const B = {
  bg:         '#F5F5F7',
  bgEl:       '#FFFFFF',
  border:     '#E5E7EB',
  accent:     '#5B21D9',
  accentText: '#FFFFFF',
  textPri:    '#111827',
  textMuted:  '#6B7280',
  error:      '#EF4444',
  success:    '#10B981',
};

const { width: SW, height: SH } = Dimensions.get('window');
const WIN   = SW * 0.78;
const WIN_L = (SW - WIN) / 2;
const WIN_T = SH * 0.18;

// Species QR codes are only ever encoded as QR codes
const BARCODE_SETTINGS = {
  barcodeTypes: ['qr'],
};

export default function PackagingBarcodeScanner({ navigation, route }) {
  const batchId = route?.params?.batchId ?? null;
  const stageId = route?.params?.stageId ?? 12;
  const insets  = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanState,       setScanState]       = useState('idle'); // idle | found | submitting | submitted | not_found
  const [matchedSpecies,  setMatchedSpecies]  = useState(null); // { prefix, genus, species, display }
  const [quantity,        setQuantity]        = useState(1);
  const [resultMsg,       setResultMsg]       = useState('');
  const [errorMsg,        setErrorMsg]        = useState('');
  const [errorTitle,      setErrorTitle]      = useState('NOT RECOGNISED');

  const scannedRef = useRef(false);
  // The prefix we just handled (found/cancelled/failed). While this QR is
  // still in the camera frame we ignore it, so cancelling doesn't instantly
  // re-scan the same sticker straight back into the CAPTURED state.
  const dismissedUidRef   = useRef(null);
  const lastScannedUidRef = useRef(null);

  const laserAnim    = useRef(new Animated.Value(0)).current;
  const cardAnim     = useRef(new Animated.Value(80)).current;
  const cardOpacity  = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const laserLoop    = useRef(null);

  useEffect(() => {
    laserLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, { toValue: WIN - 4, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(laserAnim, { toValue: 0,       duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    laserLoop.current.start();
    return () => laserLoop.current?.stop();
  }, []);

  const showCard = useCallback(() => {
    Animated.parallel([
      Animated.timing(cardAnim,    { toValue: 0,  duration: 380, easing: Easing.out(Easing.back(1.05)), useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1,  duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  const hideCard = useCallback(cb => {
    Animated.parallel([
      Animated.timing(cardAnim,    { toValue: 80, duration: 220, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0,  duration: 220, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, []);

  const processScan = useCallback(async (prefix, entry) => {
    const session = await getWorkerSession();
    if (!session) {
      setScanState('not_found');
      setErrorTitle('SIGN IN REQUIRED');
      setErrorMsg('Please log in as a worker to record stock.');
      showCard();
      return;
    }
    setMatchedSpecies({ prefix, genus: entry.genus, species: entry.species, display: entry.display });
    setQuantity(1);
    setScanState('found');
    showCard();
  }, [showCard]);

  const handleBarcodeScanned = useCallback(async ({ data }) => {
    if (scannedRef.current) return;
    const match = speciesForPrefix(data);
    // Not a recognised species prefix — keep the camera scanning, don't lock it
    if (!match) return;
    // Same QR we just dismissed and is still sitting in the frame — ignore it
    // so CANCEL doesn't bounce straight back to CAPTURED. A different sticker
    // clears the guard and scans normally.
    if (match.prefix === dismissedUidRef.current) return;
    scannedRef.current = true;
    dismissedUidRef.current = null;
    lastScannedUidRef.current = match.prefix;
    await processScan(match.prefix, match);
  }, [processScan]);

  const adjustQuantity = (delta) => setQuantity(q => Math.max(1, q + delta));
  const setQuantityDirect = (text) => {
    const n = parseInt(text, 10);
    setQuantity(Number.isNaN(n) ? 1 : Math.max(1, n));
  };

  const handleReset = useCallback(() => {
    // Remember the QR we're leaving so the live camera doesn't immediately
    // re-capture it while it's still in frame.
    if (lastScannedUidRef.current) dismissedUidRef.current = lastScannedUidRef.current;
    hideCard(() => {
      successScale.setValue(0);
      setMatchedSpecies(null);
      setQuantity(1);
      setResultMsg('');
      setErrorMsg('');
      setScanState('idle');
      scannedRef.current = false;
    });
  }, [hideCard]);

  const handleRetry = useCallback(() => {
    // Force a clean slate — full re-arm, so even the last QR can be re-scanned.
    dismissedUidRef.current = null;
    lastScannedUidRef.current = null;
    hideCard(() => {
      setMatchedSpecies(null);
      setQuantity(1);
      setResultMsg('');
      setErrorMsg('');
      setScanState('idle');
      scannedRef.current = false;
    });
  }, [hideCard]);

  const handleSubmit = async () => {
    if (!matchedSpecies) return;
    setScanState('submitting');

    const session = await getWorkerSession();
    if (!session) {
      setScanState('not_found');
      setErrorTitle('SIGN IN REQUIRED');
      setErrorMsg('Please log in as a worker to record stock.');
      showCard();
      return;
    }

    try {
      const { error } = await supabase.from('stock_requests').insert({
        species_name: matchedSpecies.display,
        short_link: matchedSpecies.prefix,
        quantity: quantity,
        worker_id: session.id,
        worker_name: workerLabel(session),
        status: 'pending',
      });

      if (error) {
        setScanState('not_found');
        setErrorTitle('CONNECTION ISSUE');
        setErrorMsg("Couldn't reach the server. Please try again.");
        showCard();
        return;
      }

      if (batchId) {
        const countKey = `stage_scan_count_${batchId}_${stageId}`;
        const logKey   = `stage_scan_log_${batchId}_${stageId}`;
        const prev = await AsyncStorage.getItem(countKey).catch(() => null);
        await AsyncStorage.setItem(countKey, String((parseInt(prev || '0', 10) + 1))).catch(() => {});
        const logRaw  = await AsyncStorage.getItem(logKey).catch(() => null);
        const existing = logRaw ? JSON.parse(logRaw) : [];
        await AsyncStorage.setItem(logKey, JSON.stringify([
          { timestamp: new Date().toISOString(), species: matchedSpecies.display, type: 'stock', quantity },
          ...existing,
        ].slice(0, 50))).catch(() => {});
      }

      setResultMsg(`${quantity} unit(s) submitted — pending manager approval`);
      successScale.setValue(0);
      setScanState('submitted');
      Animated.spring(successScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }).start();
    } catch (e) {
      setScanState('not_found');
      setErrorTitle('CONNECTION ISSUE');
      setErrorMsg("Couldn't reach the server. Please try again.");
      showCard();
    }
  };

  if (!permission) return (
    <View style={s.center}><ActivityIndicator color={B.accent} /></View>
  );

  if (!permission.granted) return (
    <View style={[s.container, s.center]}>
      <Text style={s.permText}>Camera access is required to scan species QR codes.</Text>
      <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.8}>
        <Text style={s.permBtnText}>GRANT PERMISSION</Text>
      </TouchableOpacity>
    </View>
  );

  const isIdle       = scanState === 'idle';
  const isFound      = scanState === 'found';
  const isSubmitting = scanState === 'submitting';
  const isSubmitted  = scanState === 'submitted';
  const isNotFound   = scanState === 'not_found';

  return (
    <View style={s.container}>

      {/* Camera — always live, autofocus required for barcode detection */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        autofocus="on"
        onBarcodeScanned={handleBarcodeScanned}
        barcodeScannerSettings={BARCODE_SETTINGS}
      />

      {/* Dark overlays around the scan window */}
      <View style={[s.overlay, { top: 0,          left: 0, right: 0, height: WIN_T }]} />
      <View style={[s.overlay, { top: WIN_T + WIN, left: 0, right: 0, bottom: 0 }]} />
      <View style={[s.overlay, { top: WIN_T, left: 0,            width: WIN_L, height: WIN }]} />
      <View style={[s.overlay, { top: WIN_T, right: 0,           width: WIN_L, height: WIN }]} />

      {/* Corner brackets */}
      <View style={[s.corner, { top: WIN_T,            left: WIN_L,            borderTopWidth: 3,    borderLeftWidth: 3  }]} />
      <View style={[s.corner, { top: WIN_T,            left: WIN_L + WIN - 28, borderTopWidth: 3,    borderRightWidth: 3 }]} />
      <View style={[s.corner, { top: WIN_T + WIN - 28, left: WIN_L,            borderBottomWidth: 3, borderLeftWidth: 3  }]} />
      <View style={[s.corner, { top: WIN_T + WIN - 28, left: WIN_L + WIN - 28, borderBottomWidth: 3, borderRightWidth: 3 }]} />

      {/* Laser sweep — only while idle */}
      {isIdle && (
        <Animated.View style={[
          s.laser,
          { top: WIN_T + 2, left: WIN_L + 2, width: WIN - 4, transform: [{ translateY: laserAnim }] },
        ]} />
      )}

      {/* Result overlays inside scan window */}
      {(isFound || isSubmitting || isSubmitted) && (
        <View style={[s.winOverlay, { top: WIN_T, left: WIN_L, width: WIN, height: WIN }]}>
          <CheckCircle2 size={52} color={B.success} />
          <Text style={[s.winLabel, { color: B.success }]}>CAPTURED</Text>
        </View>
      )}
      {isNotFound && (
        <View style={[s.winOverlay, { top: WIN_T, left: WIN_L, width: WIN, height: WIN }]}>
          <XCircle size={52} color={B.error} />
          <Text style={[s.winLabel, { color: B.error }]}>NOT FOUND</Text>
        </View>
      )}

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={B.textPri} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>SCAN STOCK</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Hint below scan window */}
      {isIdle && (
        <View style={{ position: 'absolute', top: WIN_T + WIN + 16, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={s.hint}>Hold the species QR code steady inside the frame</Text>
        </View>
      )}

      {/* Bottom panel */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 24 }]}>

        {/* Result card */}
        <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ translateY: cardAnim }] }]}>
          {isNotFound && (
            <>
              <Text style={s.cardTitle}>[ {errorTitle} ]</Text>
              <Text style={s.cardSub}>{errorMsg}</Text>
            </>
          )}
          {(isFound || isSubmitting) && matchedSpecies && (
            <>
              <View style={s.cardRow}>
                <Package size={15} color={B.accent} style={{ marginRight: 8 }} />
                <Text style={s.cardTitle}>[ SPECIES IDENTIFIED ]</Text>
              </View>
              <Text style={s.cardSpecies}>{matchedSpecies.display}</Text>

              {/* Quantity stepper — cashier-style: identify once, then enter how many */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 14, gap: 14 }}>
                <TouchableOpacity
                  onPress={() => adjustQuantity(-1)}
                  disabled={scanState === 'submitting'}
                  style={{ width: 44, height: 44, borderWidth: 1, borderColor: B.border, alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 22, fontWeight: '700', color: B.accent }}>−</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 28, fontWeight: '800', color: B.textPri, minWidth: 56, textAlign: 'center' }}>{quantity}</Text>
                <TouchableOpacity
                  onPress={() => adjustQuantity(1)}
                  disabled={scanState === 'submitting'}
                  style={{ width: 44, height: 44, borderWidth: 1, borderColor: B.border, alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 22, fontWeight: '700', color: B.accent }}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.cardSub}>A manager will review before the stock count is updated.</Text>
            </>
          )}
        </Animated.View>

        {/* Success box */}
        {isSubmitted && matchedSpecies && (
          <Animated.View style={[s.successBox, { transform: [{ scale: successScale }] }]}>
            <CheckCircle2 size={36} color={B.success} style={{ marginBottom: 10 }} />
            <Text style={s.successTitle}>STOCK SUBMITTED</Text>
            <Text style={s.successSpecies}>{matchedSpecies.display}</Text>
            <Text style={s.successSub}>{resultMsg}</Text>
          </Animated.View>
        )}

        {/* Idle: retry button */}
        {isIdle && (
          <TouchableOpacity style={s.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
            <Text style={s.retryBtnText}>Having trouble? Tap here to reset the scanner</Text>
          </TouchableOpacity>
        )}

        {/* Found: submit */}
        {isFound && (
          <TouchableOpacity style={s.actionBtn} onPress={handleSubmit} activeOpacity={0.85}>
            <Text style={s.actionBtnText}>SUBMIT STOCK</Text>
          </TouchableOpacity>
        )}

        {/* Submitting: loading */}
        {isSubmitting && (
          <View style={[s.actionBtn, { opacity: 0.6 }]}>
            <ActivityIndicator color={B.bg} />
          </View>
        )}

        {/* Submitted or not found: next action */}
        {(isSubmitted || isNotFound) && (
          <TouchableOpacity style={s.actionBtn} onPress={handleReset} activeOpacity={0.85}>
            <Text style={s.actionBtnText}>{isSubmitted ? 'SCAN ANOTHER' : 'TRY AGAIN'}</Text>
          </TouchableOpacity>
        )}

        {isSubmitted && (
          <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={s.cancelBtnText}>BACK TO STAGES</Text>
          </TouchableOpacity>
        )}

        {isFound && (
          <TouchableOpacity style={s.cancelBtn} onPress={handleReset} activeOpacity={0.7}>
            <Text style={s.cancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
        )}

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: B.bg },

  overlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.52)' },

  corner: {
    position: 'absolute',
    width: 28, height: 28,
    borderColor: B.accent,
    zIndex: 10,
  },

  laser: {
    position: 'absolute',
    height: 2,
    backgroundColor: B.accent,
    shadowColor: B.accent,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },

  winOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  winLabel: { fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 },

  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: B.bgEl,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    zIndex: 30,
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 14, fontWeight: '800', color: B.textPri, letterSpacing: 2, textTransform: 'uppercase' },

  hint: { fontSize: 12, color: '#FFFFFF', textAlign: 'center', paddingHorizontal: 32, letterSpacing: 0.4 },

  bottom: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    zIndex: 30,
    alignItems: 'center',
    backgroundColor: B.bgEl,
    borderTopWidth: 1,
    borderTopColor: B.border,
  },

  card: {
    width: '100%',
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    padding: 16,
    marginBottom: 14,
  },
  cardRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardTitle:   { fontSize: 9, fontWeight: '700', color: B.accent, letterSpacing: 2.5, textTransform: 'uppercase' },
  cardSpecies: { fontSize: 17, fontWeight: '800', color: B.textPri, marginBottom: 4, fontStyle: 'italic' },
  cardUid:     { fontSize: 12, fontWeight: '700', color: B.accent, marginBottom: 6, letterSpacing: 1 },
  cardSub:     { fontSize: 12, color: B.textMuted, lineHeight: 18 },

  successBox: {
    width: '100%',
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.success,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  successTitle:   { fontSize: 16, fontWeight: '800', color: B.success, marginBottom: 4, letterSpacing: 2, textTransform: 'uppercase' },
  successSpecies: { fontSize: 14, fontWeight: '700', color: B.textPri, marginBottom: 2, fontStyle: 'italic' },
  successUid:     { fontSize: 12, fontWeight: '700', color: B.textMuted, marginBottom: 6, letterSpacing: 1 },
  successSub:     { fontSize: 12, color: B.textMuted, textAlign: 'center', lineHeight: 18 },

  retryBtn: {
    width: '100%',
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: B.border,
    marginBottom: 4,
  },
  retryBtnText: { color: B.textMuted, fontSize: 12, fontWeight: '500' },

  actionBtn: {
    width: '100%',
    backgroundColor: B.accent,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionBtnText: { color: B.bg, fontSize: 13, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase' },

  cancelBtn: {
    width: '100%',
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: B.accent,
    backgroundColor: 'transparent',
  },
  cancelBtnText: { color: B.accent, fontSize: 13, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase' },

  permText:    { color: B.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  permBtn:     { backgroundColor: B.accent, paddingVertical: 15, paddingHorizontal: 24 },
  permBtnText: { color: B.bg, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', fontSize: 13 },
});
