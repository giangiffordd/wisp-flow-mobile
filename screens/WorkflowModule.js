import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { Bell, Plus, ChevronRight, RotateCcw, Trash2 } from 'lucide-react-native';
import { COLORS, SHADOW_SM } from '../theme';

const generateId = () =>
  Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

// After 2 rescans (3 total attempts) → escalate
const MAX_RESCANS = 2;

const ALERTS_PREVIEW = [
  { id: '1', title: 'Specimen Flagged in QC', type: 'critical' },
  { id: '2', title: 'Log Rejected by Manager', type: 'warning' },
  { id: '3', title: 'Inventory Synced',        type: 'success'  },
];

const STATUS_CONFIG = {
  pass:            { label: 'PASS',      bg: '#d1fae5', text: '#065f46' },
  flagged:         { label: 'FLAGGED',   bg: '#fee2e2', text: '#991b1b' },
  discarded:       { label: 'DISCARDED', bg: '#f1f5f9', text: '#64748b' },
  escalated:       { label: 'ESCALATED', bg: '#fff7ed', text: '#c2410c' },
  pending_manager: { label: 'PENDING',   bg: '#ede9fe', text: '#6d28d9' },
};

const BATCH_STATUS = {
  pending_approval: { label: 'Pending Approval', color: '#6d28d9', bg: '#ede9fe' },
  approved:         { label: 'Approved',          color: '#065f46', bg: '#d1fae5' },
  rejected:         { label: 'Rejected',          color: '#991b1b', bg: '#fee2e2' },
};

export default function WorkflowModule({ navigation, route }) {
  const isFocused = useIsFocused();
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const [currentSpecies, setCurrentSpecies] = useState({ species: 'Awaiting scan…', commonName: '' });
  const [activeBatch,    setActiveBatch]    = useState(null);
  const [recentBatches,  setRecentBatches]  = useState([]);

  // ── Fade in + load all persisted data on focus ──
  useEffect(() => {
    if (!isFocused) { fadeAnim.setValue(0); return; }
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();

    const load = async () => {
      try {
        const pairs = await AsyncStorage.multiGet([
          'last_detected_species',
          'active_batch',
          'recent_batches',
          'pending_specimen_result',
        ]);
        const [speciesRaw, batchRaw, historyRaw, pendingRaw] = pairs.map(p => p[1]);

        if (speciesRaw) { try { setCurrentSpecies(JSON.parse(speciesRaw)); } catch {} }
        if (historyRaw) { try { setRecentBatches(JSON.parse(historyRaw)); }  catch {} }

        let batch = null;
        try { batch = batchRaw ? JSON.parse(batchRaw) : null; } catch {}

        if (pendingRaw) {
          await AsyncStorage.removeItem('pending_specimen_result');
          try {
            const result = JSON.parse(pendingRaw);
            if (batch && result.batchId === batch.id) {
              batch = applyResultToBatch(batch, result);
              await AsyncStorage.setItem('active_batch', JSON.stringify(batch));
            }
          } catch {}
        }

        setActiveBatch(batch);
      } catch {}
    };

    load();
  }, [isFocused]);

  // ── Apply a scan result to a batch (pure — returns new batch object) ──
  const applyResultToBatch = (batch, result) => {
    if (result.isRescan && result.specimenId) {
      const updatedSpecimens = batch.specimens.map(s => {
        if (s.id !== result.specimenId) return s;
        const newRescanCount = s.rescan_count + 1;
        const shouldEscalate = result.status === 'flagged' && newRescanCount >= MAX_RESCANS;
        return {
          ...s,
          status:          shouldEscalate ? 'escalated' : result.status,
          rescan_count:    newRescanCount,
          last_scanned_at: new Date().toISOString(),
        };
      });
      return { ...batch, specimens: updatedSpecimens };
    }

    const newSpecimen = {
      id:               generateId(),
      status:           result.status,
      species:          result.speciesDisplay || result.species,
      confidence:       result.confidence || 0,
      parts_found:      result.partsFound   || {},
      parts_required:   result.partsRequired || {},
      species_mismatch: result.species_mismatch || false,
      rescan_count:     0,
      discard_reason:   null,
      discard_notes:    null,
      scanned_at:       result.timestamp || new Date().toISOString(),
      last_scanned_at:  result.timestamp || new Date().toISOString(),
    };
    return { ...batch, specimens: [...batch.specimens, newSpecimen] };
  };

  // ── Persist active batch whenever it changes ──
  useEffect(() => {
    if (activeBatch === null) {
      AsyncStorage.removeItem('active_batch').catch(() => {});
    } else {
      AsyncStorage.setItem('active_batch', JSON.stringify(activeBatch)).catch(() => {});
    }
  }, [activeBatch]);

  // ── Start a new batch ──
  const handleNewBatch = () => {
    if (activeBatch?.specimens?.length > 0) {
      Alert.alert('Active Batch', 'Finish the current batch before starting a new one.');
      return;
    }
    setActiveBatch({
      id:          generateId(),
      createdAt:   new Date().toISOString(),
      species:     currentSpecies.species,
      commonName:  currentSpecies.commonName,
      specimens:   [],
    });
  };

  // ── Navigate to scanner for a new specimen ──
  const handleScanSpecimen = () => {
    if (!activeBatch) return;
    navigation.navigate('YoloScan', {
      batchId:      activeBatch.id,
      batchSpecies: activeBatch.species,
      mode:         'new',
      stepId:       1,
      stepTitle:    'Initial Quality Control',
    });
  };

  // ── Navigate to scanner in re-scan mode ──
  const handleRescan = (specimen) => {
    if (!activeBatch) return;
    navigation.navigate('YoloScan', {
      batchId:        activeBatch.id,
      mode:           'rescan',
      specimenId:     specimen.id,
      stepId:         1,
      stepTitle:      'Re-Scan',
      originalDefects: specimen.parts_required,
      rescansCount:   specimen.rescan_count,
    });
  };

  // ── Discard a specimen with reason ──
  const handleDiscard = (specimen) => {
    Alert.alert('Discard Specimen', 'Select a reason:', [
      { text: 'Physically Damaged', onPress: () => applyDiscard(specimen, 'Physically Damaged') },
      { text: 'Missing Parts',      onPress: () => applyDiscard(specimen, 'Missing Parts')      },
      { text: 'Other',              onPress: () => applyDiscard(specimen, 'Other')              },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const applyDiscard = (specimen, reason) => {
    setActiveBatch(prev => ({
      ...prev,
      specimens: prev.specimens.map(s =>
        s.id === specimen.id ? { ...s, status: 'discarded', discard_reason: reason } : s
      ),
    }));
  };

  // ── Finish batch → go to summary screen ──
  const handleFinishBatch = () => {
    if (!activeBatch || activeBatch.specimens.length === 0) {
      Alert.alert('No Specimens', 'Scan at least one specimen before finishing the batch.');
      return;
    }
    navigation.navigate('BatchSummary', { batch: activeBatch });
  };

  // ── Called by BatchSummary after manager submission ──
  const submitBatch = async (submittedBatch) => {
    const finalized = {
      ...submittedBatch,
      status:      'pending_approval',
      submittedAt: new Date().toISOString(),
    };
    const updated = [finalized, ...recentBatches].slice(0, 10);
    setRecentBatches(updated);
    setActiveBatch(null);
    await AsyncStorage.setItem('recent_batches', JSON.stringify(updated)).catch(() => {});
  };

  // ── Computed batch stats ──
  const stats = activeBatch ? {
    pass:      activeBatch.specimens.filter(s => s.status === 'pass').length,
    flagged:   activeBatch.specimens.filter(s => s.status === 'flagged').length,
    escalated: activeBatch.specimens.filter(s => s.status === 'escalated').length,
    discarded: activeBatch.specimens.filter(s => s.status === 'discarded').length,
  } : null;

  const fmtTime = iso =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const fmtDate = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + fmtTime(iso);
  };

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Alerts Banner ── */}
          <TouchableOpacity
            style={styles.alertsBanner}
            onPress={() => navigation?.navigate('StaffAlertsNotifications')}
            activeOpacity={0.8}
          >
            <View style={styles.alertsBannerLeft}>
              <View style={styles.alertsBell}>
                <Bell size={18} color="#2B3441" />
                <View style={styles.alertsBadgeDot} />
              </View>
              <View>
                <Text style={styles.alertsBannerTitle}>Alerts</Text>
                <Text style={styles.alertsBannerSub}>{ALERTS_PREVIEW.length} notifications pending</Text>
              </View>
            </View>
            <View style={styles.alertsTagRow}>
              {ALERTS_PREVIEW.slice(0, 2).map(a => (
                <View key={a.id} style={[
                  styles.alertsTypeTag,
                  a.type === 'critical' && styles.alertsTagCritical,
                  a.type === 'warning'  && styles.alertsTagWarning,
                  a.type === 'success'  && styles.alertsTagSuccess,
                ]}>
                  <Text style={[
                    styles.alertsTagText,
                    a.type === 'critical' && { color: '#D94F4F' },
                    a.type === 'warning'  && { color: '#B45309' },
                    a.type === 'success'  && { color: '#065f46' },
                  ]} numberOfLines={1}>{a.title}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>

          {/* ── Active Batch or Start Prompt ── */}
          {activeBatch ? (
            <>
              {/* Batch info card */}
              <View style={styles.batchCard}>
                <Text style={styles.batchCardLabel}>ACTIVE BATCH</Text>
                <Text style={styles.batchCardSpecies}>{activeBatch.species}</Text>
                {activeBatch.commonName ? (
                  <Text style={styles.batchCardCommon}>{activeBatch.commonName}</Text>
                ) : null}
                <Text style={styles.batchCardTime}>Started {fmtTime(activeBatch.createdAt)}</Text>

                <View style={styles.statsRow}>
                  <View style={[styles.statChip, { backgroundColor: '#d1fae5' }]}>
                    <Text style={[styles.statChipNum,   { color: '#065f46' }]}>{stats.pass}</Text>
                    <Text style={[styles.statChipLabel, { color: '#065f46' }]}>PASS</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: '#fee2e2' }]}>
                    <Text style={[styles.statChipNum,   { color: '#991b1b' }]}>{stats.flagged}</Text>
                    <Text style={[styles.statChipLabel, { color: '#991b1b' }]}>FLAGGED</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: '#fff7ed' }]}>
                    <Text style={[styles.statChipNum,   { color: '#c2410c' }]}>{stats.escalated}</Text>
                    <Text style={[styles.statChipLabel, { color: '#c2410c' }]}>ESCALATED</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: '#f1f5f9' }]}>
                    <Text style={[styles.statChipNum,   { color: '#64748b' }]}>{stats.discarded}</Text>
                    <Text style={[styles.statChipLabel, { color: '#64748b' }]}>DISCARD</Text>
                  </View>
                </View>
              </View>

              {/* Scan specimen button */}
              <TouchableOpacity style={styles.scanBtn} onPress={handleScanSpecimen} activeOpacity={0.85}>
                <Plus size={16} color="#fff" />
                <Text style={styles.scanBtnText}>Scan Specimen</Text>
              </TouchableOpacity>

              {/* Specimen list */}
              {activeBatch.specimens.length > 0 && (
                <View style={styles.specimensSection}>
                  <Text style={styles.specimensLabel}>
                    SPECIMENS · {activeBatch.specimens.length}
                  </Text>

                  {activeBatch.specimens.map((s, i) => {
                    const cfg       = STATUS_CONFIG[s.status] || STATUS_CONFIG.flagged;
                    const canRescan = s.status === 'flagged' && s.rescan_count < MAX_RESCANS;
                    const canDiscard = s.status === 'flagged' || s.status === 'escalated';

                    return (
                      <View key={s.id} style={styles.specimenCard}>
                        <View style={styles.specimenRow}>
                          <View style={styles.specimenNum}>
                            <Text style={styles.specimenNumText}>{i + 1}</Text>
                          </View>

                          <View style={styles.specimenMeta}>
                            <Text style={styles.specimenSpecies} numberOfLines={1}>{s.species}</Text>
                            <Text style={styles.specimenDetail}>
                              {Math.round(s.confidence * 100)}% conf
                              {' · '}
                              {fmtTime(s.last_scanned_at || s.scanned_at)}
                              {s.rescan_count > 0
                                ? `  ·  Rescan ${s.rescan_count}/${MAX_RESCANS}`
                                : ''}
                            </Text>
                            {s.species_mismatch && (
                              <Text style={styles.mismatchNote}>
                                ⚠ Species mismatch — batch is for {activeBatch.species}
                              </Text>
                            )}
                            {s.status === 'escalated' && (
                              <Text style={styles.escalationNote}>
                                Manager has been notified · Pending decision
                              </Text>
                            )}
                            {s.status === 'discarded' && s.discard_reason && (
                              <Text style={styles.discardNote}>Reason: {s.discard_reason}</Text>
                            )}
                          </View>

                          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: cfg.text }]}>
                              {cfg.label}
                            </Text>
                          </View>
                        </View>

                        {(canRescan || canDiscard) && (
                          <View style={styles.specimenActions}>
                            {canRescan && (
                              <TouchableOpacity
                                style={styles.actionRescan}
                                onPress={() => handleRescan(s)}
                                activeOpacity={0.8}
                              >
                                <RotateCcw size={12} color={COLORS.primary} />
                                <Text style={styles.actionRescanText}>Re-Scan</Text>
                              </TouchableOpacity>
                            )}
                            {canDiscard && (
                              <TouchableOpacity
                                style={styles.actionDiscard}
                                onPress={() => handleDiscard(s)}
                                activeOpacity={0.8}
                              >
                                <Trash2 size={12} color="#dc2626" />
                                <Text style={styles.actionDiscardText}>Discard</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Finish batch */}
              <TouchableOpacity style={styles.finishBtn} onPress={handleFinishBatch} activeOpacity={0.85}>
                <Text style={styles.finishBtnText}>Finish Batch</Text>
                <ChevronRight size={16} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            /* No active batch — start prompt */
            <TouchableOpacity style={styles.newBatchCard} onPress={handleNewBatch} activeOpacity={0.85}>
              <View style={styles.newBatchIconWrap}>
                <Plus size={28} color={COLORS.primary} />
              </View>
              <Text style={styles.newBatchTitle}>Start New Batch</Text>
              <Text style={styles.newBatchSub}>
                {currentSpecies.species !== 'Awaiting scan…'
                  ? currentSpecies.species +
                    (currentSpecies.commonName ? ` · ${currentSpecies.commonName}` : '')
                  : 'Open the scanner first to detect a species'}
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Recent Batches ── */}
          {recentBatches.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyLabel}>RECENT BATCHES</Text>

              {recentBatches.slice(0, 5).map(b => {
                const cfg       = BATCH_STATUS[b.status] || BATCH_STATUS.pending_approval;
                const passCount = b.specimens?.filter(s => s.status === 'pass').length || 0;
                const total     = b.specimens?.length || 0;

                return (
                  <View key={b.id} style={styles.historyCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historySpecies} numberOfLines={1}>{b.species}</Text>
                      <Text style={styles.historyMeta}>
                        {fmtDate(b.submittedAt)} · {passCount}/{total} passed
                      </Text>
                    </View>
                    <View style={[styles.historyBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.historyBadgeText, { color: cfg.color }]}>
                        {cfg.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 48 },

  // ── Alerts Banner ──
  alertsBanner: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  alertsBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  alertsBell: {
    position: 'relative',
    width: 34, height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertsBadgeDot: {
    position: 'absolute',
    top: 6, right: 6,
    width: 7, height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.errorRed,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  alertsBannerTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textDark },
  alertsBannerSub:   { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  alertsTagRow:      { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  alertsTypeTag:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: COLORS.inputBg },
  alertsTagCritical: { backgroundColor: COLORS.errorBg },
  alertsTagWarning:  { backgroundColor: COLORS.warningBg },
  alertsTagSuccess:  { backgroundColor: COLORS.successBg },
  alertsTagText:     { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },

  // ── Active Batch Card ──
  batchCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  batchCardLabel:   { fontSize: 10, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  batchCardSpecies: { fontSize: 24, fontWeight: '800', color: COLORS.textDark, fontStyle: 'italic', marginBottom: 4 },
  batchCardCommon:  { fontSize: 14, color: COLORS.textMuted, fontWeight: '500', marginBottom: 6 },
  batchCardTime:    { fontSize: 11, color: COLORS.textLight, marginBottom: 16 },

  statsRow:       { flexDirection: 'row', gap: 8 },
  statChip:       { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statChipNum:    { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statChipLabel:  { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // ── Scan Button ──
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 13,
    marginBottom: 16,
    gap: 8,
  },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Specimen List ──
  specimensSection: { marginBottom: 16 },
  specimensLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  specimenCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  specimenRow:    { flexDirection: 'row', alignItems: 'center' },
  specimenNum: {
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  specimenNumText:  { fontSize: 11, fontWeight: '700', color: COLORS.textMid },
  specimenMeta:     { flex: 1 },
  specimenSpecies:  { fontSize: 13, fontWeight: '700', color: COLORS.textDark, fontStyle: 'italic', marginBottom: 3 },
  specimenDetail:   { fontSize: 11, color: COLORS.textLight, fontWeight: '500' },
  mismatchNote:     { fontSize: 10, color: '#b45309', fontWeight: '600', marginTop: 4 },
  escalationNote:   { fontSize: 10, color: '#c2410c', fontWeight: '600', marginTop: 4 },
  discardNote:      { fontSize: 10, color: '#64748b', fontWeight: '500', marginTop: 4 },

  statusBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  specimenActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  actionRescan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    backgroundColor: COLORS.primaryMuted,
  },
  actionRescanText:  { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  actionDiscard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  actionDiscardText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },

  // ── Finish Batch ──
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.headerBg,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 24,
    gap: 8,
  },
  finishBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── No Active Batch ──
  newBatchCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
    marginBottom: 24,
    ...SHADOW_SM,
  },
  newBatchIconWrap: {
    width: 60, height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  newBatchTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textDark, marginBottom: 6 },
  newBatchSub:   { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', fontStyle: 'italic' },

  // ── Recent Batches History ──
  historySection: { marginBottom: 8 },
  historyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  historySpecies:   { fontSize: 13, fontWeight: '700', color: COLORS.textDark, fontStyle: 'italic', marginBottom: 3 },
  historyMeta:      { fontSize: 11, color: COLORS.textLight },
  historyBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginLeft: 10 },
  historyBadgeText: { fontSize: 10, fontWeight: '700' },
});
