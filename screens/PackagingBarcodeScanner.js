import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, CheckCircle2, XCircle, Package } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/services/supabaseService';
import { getWorkerSession } from '../src/services/workerSession';

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

function normalizeLink(raw) {
  return raw.replace(/^https?:\/\//, '').trim();
}

// All types — let the camera be maximally sensitive
const BARCODE_SETTINGS = {
  barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'datamatrix', 'pdf417', 'aztec'],
};

export default function PackagingBarcodeScanner({ navigation, route }) {
  const batchId = route?.params?.batchId ?? null;
  const stageId = route?.params?.stageId ?? 12;
  const insets  = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanState,   setScanState]   = useState('idle'); // idle|found|not_found|submitting|submitted
  const [speciesData, setSpeciesData] = useState(null);
  const [errorMsg,    setErrorMsg]    = useState('');

  const scannedRef = useRef(false);

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

  const processBarcode = useCallback(async (data) => {
    const shortLink = normalizeLink(data);
    console.log('[Barcode] processing:', shortLink);

    if (!supabase) {
      setScanState('not_found');
      setErrorMsg('Database not connected.');
      showCard();
      return;
    }

    try {
      const { data: rows, error } = await supabase
        .from('barcode_mappings')
        .select('id, short_link, species_name')
        .eq('short_link', shortLink)
        .limit(1);

      if (error || !rows?.length) {
        setScanState('not_found');
        setErrorMsg(`No species matched.\nScanned: ${shortLink}`);
        showCard();
        return;
      }

      setSpeciesData(rows[0]);
      setScanState('found');
      showCard();
    } catch {
      setScanState('not_found');
      setErrorMsg('Network error. Please try again.');
      showCard();
    }
  }, [showCard]);

  const handleBarcodeScanned = useCallback(async ({ data }) => {
    if (scannedRef.current) return;
    // QR short links always contain letters; pure-numeric codes (EAN, GS1) do not
    if (!/[a-zA-Z]/.test(data)) return;
    scannedRef.current = true;
    await processBarcode(data);
  }, [processBarcode]);

  const handleReset = useCallback(() => {
    hideCard(() => {
      successScale.setValue(0);
      setSpeciesData(null);
      setErrorMsg('');
      setScanState('idle');
      scannedRef.current = false;
    });
  }, [hideCard]);

  const handleRetry = useCallback(() => {
    // Force a clean slate — dismiss any visible card first, then unlock scanner
    hideCard(() => {
      setSpeciesData(null);
      setErrorMsg('');
      setScanState('idle');
      scannedRef.current = false;
    });
  }, [hideCard]);

  const handleSubmit = async () => {
    if (!speciesData) return;
    setScanState('submitting');

    const session = await getWorkerSession();
    const { error } = await supabase.from('stock_requests').insert({
      species_name: speciesData.species_name,
      short_link:   speciesData.short_link,
      quantity:     1,
      status:       'pending',
      worker_id:    session?.id   || null,
      worker_name:  session?.name || 'Worker',
    });

    if (error) {
      Alert.alert('Error', 'Could not submit the stock request. Try again.');
      setScanState('found');
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
        { timestamp: new Date().toISOString(), species: speciesData.species_name, type: 'barcode' },
        ...existing,
      ].slice(0, 50))).catch(() => {});
    }

    successScale.setValue(0);
    setScanState('submitted');
    Animated.spring(successScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }).start();
  };

  if (!permission) return (
    <View style={s.center}><ActivityIndicator color={B.accent} /></View>
  );

  if (!permission.granted) return (
    <View style={[s.container, s.center]}>
      <Text style={s.permText}>Camera access is required to scan barcodes.</Text>
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
        <Text style={s.headerTitle}>SCAN BARCODE</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Hint below scan window */}
      {isIdle && (
        <View style={{ position: 'absolute', top: WIN_T + WIN + 16, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={s.hint}>Hold the QR code steady inside the frame</Text>
        </View>
      )}

      {/* Bottom panel */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 24 }]}>

        {/* Result card */}
        <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ translateY: cardAnim }] }]}>
          {isNotFound && (
            <>
              <Text style={s.cardTitle}>[ NOT RECOGNISED ]</Text>
              <Text style={s.cardSub}>{errorMsg}</Text>
            </>
          )}
          {(isFound || isSubmitting) && speciesData && (
            <>
              <View style={s.cardRow}>
                <Package size={15} color={B.accent} style={{ marginRight: 8 }} />
                <Text style={s.cardTitle}>[ SPECIES IDENTIFIED ]</Text>
              </View>
              <Text style={s.cardSpecies}>{speciesData.species_name}</Text>
              <Text style={s.cardSub}>A manager will review before the stock count is updated.</Text>
            </>
          )}
        </Animated.View>

        {/* Success box */}
        {isSubmitted && speciesData && (
          <Animated.View style={[s.successBox, { transform: [{ scale: successScale }] }]}>
            <CheckCircle2 size={36} color={B.success} style={{ marginBottom: 10 }} />
            <Text style={s.successTitle}>REQUEST SENT</Text>
            <Text style={s.successSpecies}>{speciesData.species_name}</Text>
            <Text style={s.successSub}>+1 stock request submitted — pending manager approval</Text>
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
            <Text style={s.actionBtnText}>SUBMIT STOCK REQUEST</Text>
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
  successSpecies: { fontSize: 14, fontWeight: '700', color: B.textPri, marginBottom: 6, fontStyle: 'italic' },
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
