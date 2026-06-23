import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Bell, Plus, ChevronRight, RotateCcw, Trash2 } from 'lucide-react-native';
import { fmtTime, fmtDate } from '../src/utils/format';
import useBatch, { MAX_RESCANS } from '../src/hooks/useBatch';
import { fetchStaffAlerts } from '../src/services/supabaseService';

const B = {
  bg:           '#F5F5F7',
  bgEl:         '#FFFFFF',
  bgCard:       '#FFFFFF',
  border:       '#E5E7EB',
  borderActive: '#5B21D9',
  accent:       '#5B21D9',
  accentDim:    '#7C3AED',
  accentText:   '#FFFFFF',
  textPri:      '#111827',
  textMuted:    '#6B7280',
  error:        '#EF4444',
  errorBg:      'rgba(239,68,68,0.08)',
  success:      '#10B981',
  successBg:    'rgba(16,185,129,0.10)',
  warning:      '#F59E0B',
  warningBg:    'rgba(245,158,11,0.10)',
  white:        '#FFFFFF',
};


const STATUS_CONFIG = {
  pass:            { label: 'PASS',      bg: 'rgba(16,185,129,0.12)',  border: '#10B981', text: '#10B981' },
  flagged:         { label: 'FLAGGED',   bg: 'rgba(239,68,68,0.12)',   border: '#EF4444', text: '#EF4444' },
  discarded:       { label: 'DISCARDED', bg: 'rgba(156,163,175,0.12)', border: '#9CA3AF', text: '#9CA3AF' },
  escalated:       { label: 'ESCALATED', bg: 'rgba(245,158,11,0.12)',  border: '#F59E0B', text: '#F59E0B' },
  pending_manager: { label: 'PENDING',   bg: 'rgba(245,158,11,0.12)',  border: '#F59E0B', text: '#F59E0B' },
};

const BATCH_STATUS = {
  pending_approval: { label: 'PENDING',   border: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  text: '#F59E0B' },
  approved:         { label: 'APPROVED',  border: '#10B981', bg: 'rgba(16,185,129,0.12)',  text: '#10B981' },
  rejected:         { label: 'REJECTED',  border: '#EF4444', bg: 'rgba(239,68,68,0.12)',   text: '#EF4444' },
  needs_rescan:     { label: 'RE-SCAN',   border: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  text: '#F59E0B' },
};

export default function WorkflowModule({ navigation, route }) {
  const isFocused = useIsFocused();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [alertsPreview, setAlertsPreview] = useState([]);

  const {
    activeBatch,
    recentBatches,
    currentSpecies,
    stats,
    startNewBatch,
    startBatchForSpecies,
    applyDiscard,
    submitBatch,
    clearActiveBatch,
  } = useBatch();

  // Fade in on focus
  useEffect(() => {
    if (!isFocused) { fadeAnim.setValue(0); return; }
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [isFocused]);

  // Load real alerts preview on focus
  useEffect(() => {
    if (!isFocused) return;
    (async () => {
      try {
        const data = await fetchStaffAlerts();
        setAlertsPreview(data.slice(0, 3));
      } catch {}
    })();
  }, [isFocused]);

  // ── Start a new batch ──
  const handleNewBatch = () => {
    if (activeBatch) {
      Alert.alert('Active Batch', 'Finish the current batch before starting a new one.');
      return;
    }
    if (currentSpecies.species === 'Awaiting scan…') {
      // No species detected yet and there's no active batch, so the
      // "SCAN SPECIMEN" button (which requires a batch) isn't reachable
      // either -- this was a dead end. Open the scanner directly in
      // standalone mode so a scan can populate currentSpecies; tapping
      // "Start New Batch" again afterward will then succeed.
      navigation.navigate('YoloScan', {
        mode:      'standalone',
        stepId:    1,
        stepTitle: 'Identify Species',
      });
      return;
    }
    startNewBatch();
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

  // ── Navigate to scanner in re-scan mode (from active batch specimen) ──
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

  // ── Re-scan from a completed recent batch ──
  const handleRescanBatch = (b) => {
    if (activeBatch?.specimens?.length > 0) {
      Alert.alert('Active Batch', 'Finish the current batch before starting a re-scan.');
      return;
    }
    const newBatchId = startBatchForSpecies(b.species, b.commonName);
    navigation.navigate('YoloScan', {
      batchId:      newBatchId,
      batchSpecies: b.species,
      mode:         'rescan',
      stepId:       1,
      stepTitle:    'Re-Scan',
    });
  };

  // ── Discard a specimen — Alert stays in component (UI concern) ──
  const handleDiscard = (specimen) => {
    Alert.alert('Discard Specimen', 'Select a reason:', [
      { text: 'Physically Damaged', onPress: () => applyDiscard(specimen, 'Physically Damaged') },
      { text: 'Missing Parts',      onPress: () => applyDiscard(specimen, 'Missing Parts')      },
      { text: 'Other',              onPress: () => applyDiscard(specimen, 'Other')              },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Clear active batch with confirmation ──
  const handleClearBatch = () => {
    Alert.alert(
      'Clear Batch',
      'This will discard the current batch and all scanned specimens. This cannot be undone.',
      [
        { text: 'Keep Batch', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearActiveBatch },
      ]
    );
  };

  // ── Finish batch → go to summary screen ──
  const handleFinishBatch = () => {
    if (!activeBatch || activeBatch.specimens.length === 0) {
      Alert.alert('No Specimens', 'Scan at least one specimen before finishing the batch.');
      return;
    }
    navigation.navigate('BatchSummary', { batch: activeBatch });
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
            style={[styles.alertsBanner, alertsPreview.length === 0 && styles.alertsBannerNeutral]}
            onPress={() => navigation?.getParent()?.navigate('StaffAlertsNotifications')}
            activeOpacity={0.8}
          >
            <View style={styles.alertsBannerLeft}>
              <View style={styles.alertsBell}>
                <Bell size={18} color={alertsPreview.length > 0 ? B.accent : B.textMuted} />
                {alertsPreview.length > 0 && <View style={styles.alertsBadgeDot} />}
              </View>
              <View>
                <Text style={[styles.alertsBannerTitle, alertsPreview.length === 0 && { color: B.textMuted }]}>ALERTS</Text>
                <Text style={styles.alertsBannerSub}>
                  {alertsPreview.length > 0
                    ? `${alertsPreview.length} notification${alertsPreview.length !== 1 ? 's' : ''} pending`
                    : 'No new notifications'}
                </Text>
              </View>
            </View>
            <View style={styles.alertsTagRow}>
              {alertsPreview.slice(0, 2).map(a => (
                <View key={a.id} style={[
                  styles.alertsTypeTag,
                  a.severity === 'critical' && styles.alertsTagCritical,
                  a.severity === 'warning'  && styles.alertsTagWarning,
                  a.severity === 'info'     && styles.alertsTagSuccess,
                ]}>
                  <Text style={[
                    styles.alertsTagText,
                    a.severity === 'critical' && { color: B.error },
                    a.severity === 'warning'  && { color: B.warning },
                    a.severity === 'info'     && { color: B.accent },
                  ]} numberOfLines={1}>{a.title}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>

          {/* ── Active Batch or Start Prompt ── */}
          {activeBatch ? (
            <>
              {/* Section header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <Text style={styles.sectionLabel}>[ ACTIVE BATCH ]</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
              </View>

              {/* Batch info card */}
              <View style={styles.batchCard}>
                <Text style={styles.batchCardSpecies}>{activeBatch.species}</Text>
                {activeBatch.commonName ? (
                  <Text style={styles.batchCardCommon}>{activeBatch.commonName}</Text>
                ) : null}
                <Text style={styles.batchCardTime}>Started {fmtTime(activeBatch.createdAt)}</Text>

                <View style={styles.statsRow}>
                  <View style={[styles.statChip, { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981' }]}>
                    <Text style={[styles.statChipNum, { color: B.success }]}>{stats.pass}</Text>
                    <Text style={[styles.statChipLabel, { color: B.success }]}>PASS</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: '#EF4444' }]}>
                    <Text style={[styles.statChipNum, { color: B.error }]}>{stats.flagged}</Text>
                    <Text style={[styles.statChipLabel, { color: B.error }]}>FLAGGED</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: '#F59E0B' }]}>
                    <Text style={[styles.statChipNum, { color: B.warning }]}>{stats.escalated}</Text>
                    <Text style={[styles.statChipLabel, { color: B.warning }]}>ESCALATED</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: 'rgba(143,164,184,0.12)', borderColor: '#5B21D9' }]}>
                    <Text style={[styles.statChipNum, { color: B.accent }]}>{stats.discarded}</Text>
                    <Text style={[styles.statChipLabel, { color: B.accent }]}>DISCARD</Text>
                  </View>
                </View>
              </View>

              {/* Scan specimen button */}
              <TouchableOpacity style={styles.scanBtn} onPress={handleScanSpecimen} activeOpacity={0.85}>
                <Plus size={16} color={B.bg} />
                <Text style={styles.scanBtnText}>SCAN SPECIMEN</Text>
              </TouchableOpacity>

              {/* Specimen list */}
              {activeBatch.specimens.length > 0 && (
                <View style={styles.specimensSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                    <Text style={styles.sectionLabel}>[ SPECIMENS · {activeBatch.specimens.length} ]</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
                  </View>

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

                          <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
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
                                <RotateCcw size={12} color={B.accent} />
                                <Text style={styles.actionRescanText}>RE-SCAN</Text>
                              </TouchableOpacity>
                            )}
                            {canDiscard && (
                              <TouchableOpacity
                                style={styles.actionDiscard}
                                onPress={() => handleDiscard(s)}
                                activeOpacity={0.8}
                              >
                                <Trash2 size={12} color={B.error} />
                                <Text style={styles.actionDiscardText}>DISCARD</Text>
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
                <Text style={styles.finishBtnText}>FINISH BATCH</Text>
                <ChevronRight size={16} color={B.bg} />
              </TouchableOpacity>

              {/* Clear batch */}
              <TouchableOpacity style={styles.clearBatchBtn} onPress={handleClearBatch} activeOpacity={0.8}>
                <Trash2 size={13} color={B.error} />
                <Text style={styles.clearBatchText}>CLEAR BATCH</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* No active batch — start prompt */
            <TouchableOpacity style={styles.newBatchCard} onPress={handleNewBatch} activeOpacity={0.85}>
              <View style={styles.newBatchIconWrap}>
                <Plus size={28} color={B.accent} />
              </View>
              <Text style={styles.newBatchTitle}>START NEW BATCH</Text>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <Text style={styles.sectionLabel}>[ RECENT BATCHES ]</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
              </View>

              {recentBatches.slice(0, 5).map(b => {
                const cfg       = BATCH_STATUS[b.status] || BATCH_STATUS.pending_approval;
                const passCount = b.specimens?.filter(s => s.status === 'pass').length || 0;
                const total     = b.specimens?.length || 0;

                return (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.historyCard}
                    onPress={() => handleRescanBatch(b)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historySpecies} numberOfLines={1}>{b.species}</Text>
                      <Text style={styles.historyMeta}>
                        {fmtDate(b.submittedAt)} · {passCount}/{total} passed · Tap to re-scan
                      </Text>
                    </View>
                    <View style={[styles.historyBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                      <Text style={[styles.historyBadgeText, { color: cfg.text }]}>
                        {cfg.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
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
  container:     { flex: 1, backgroundColor: B.bg },
  scrollContent: { padding: 16, paddingBottom: 48 },

  sectionLabel: {
    fontSize: 9,
    color: B.accent,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  // ── Alerts Banner ──
  alertsBanner: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: B.border,
    borderLeftWidth: 4,
    borderLeftColor: B.accent,
  },
  alertsBannerNeutral: {
    borderLeftColor: B.border,
    opacity: 0.7,
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
    borderRadius: 0,
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertsBadgeDot: {
    position: 'absolute',
    top: 6, right: 6,
    width: 7, height: 7,
    borderRadius: 0,
    backgroundColor: B.error,
    borderWidth: 1,
    borderColor: B.bgCard,
  },
  alertsBannerTitle: { fontSize: 13, fontWeight: '800', color: B.textPri, letterSpacing: 1.5 },
  alertsBannerSub:   { fontSize: 11, color: B.textMuted, marginTop: 1 },
  alertsTagRow:      { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  alertsTypeTag:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 0, borderWidth: 1, borderColor: B.border, backgroundColor: B.bgEl },
  alertsTagCritical: { backgroundColor: B.errorBg, borderColor: B.error },
  alertsTagWarning:  { backgroundColor: B.warningBg, borderColor: B.warning },
  alertsTagSuccess:  { backgroundColor: B.successBg, borderColor: B.success },
  alertsTagText:     { fontSize: 10, fontWeight: '600', color: B.textMuted },

  // ── Active Batch Card ──
  batchCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: B.accent,
  },
  batchCardSpecies: { fontSize: 22, fontWeight: '800', color: B.textPri, fontStyle: 'italic', marginBottom: 4 },
  batchCardCommon:  { fontSize: 13, color: B.textMuted, fontWeight: '500', marginBottom: 6 },
  batchCardTime:    { fontSize: 11, color: B.accentDim, marginBottom: 16 },

  statsRow:      { flexDirection: 'row', gap: 6 },
  statChip:      { flex: 1, borderRadius: 0, borderWidth: 1, paddingVertical: 8, alignItems: 'center' },
  statChipNum:   { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statChipLabel: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },

  // ── Scan Button ──
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: B.accent,
    borderRadius: 0,
    paddingVertical: 15,
    marginBottom: 16,
    gap: 8,
  },
  scanBtnText: { color: B.bg, fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },

  // ── Specimen List ──
  specimensSection: { marginBottom: 16 },
  specimenCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: B.border,
  },
  specimenRow:    { flexDirection: 'row', alignItems: 'center' },
  specimenNum: {
    width: 26, height: 26,
    borderRadius: 0,
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  specimenNumText:  { fontSize: 11, fontWeight: '700', color: B.accent },
  specimenMeta:     { flex: 1 },
  specimenSpecies:  { fontSize: 13, fontWeight: '700', color: B.textPri, fontStyle: 'italic', marginBottom: 3 },
  specimenDetail:   { fontSize: 11, color: B.textMuted, fontWeight: '500' },
  mismatchNote:     { fontSize: 10, color: B.warning, fontWeight: '600', marginTop: 4 },
  escalationNote:   { fontSize: 10, color: B.warning, fontWeight: '600', marginTop: 4 },
  discardNote:      { fontSize: 10, color: B.textMuted, fontWeight: '500', marginTop: 4 },

  statusBadge:     { borderRadius: 0, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4, marginLeft: 8, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },

  specimenActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: B.border,
  },
  actionRescan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.accent,
    backgroundColor: 'rgba(143,164,184,0.08)',
  },
  actionRescanText:  { fontSize: 11, fontWeight: '800', color: B.accent, letterSpacing: 1.5, textTransform: 'uppercase' },
  actionDiscard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.error,
    backgroundColor: B.errorBg,
  },
  actionDiscardText: { fontSize: 11, fontWeight: '800', color: B.error, letterSpacing: 1.5, textTransform: 'uppercase' },

  // ── Finish Batch ──
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: B.success,
    borderRadius: 0,
    paddingVertical: 15,
    marginBottom: 24,
    gap: 8,
  },
  finishBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },
  clearBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: B.error,
    paddingVertical: 11,
    marginBottom: 24,
    gap: 6,
  },
  clearBatchText: { color: B.error, fontWeight: '700', fontSize: 11, letterSpacing: 2.5, textTransform: 'uppercase' },

  // ── No Active Batch ──
  newBatchCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: B.borderActive,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  newBatchIconWrap: {
    width: 56, height: 56,
    borderRadius: 0,
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  newBatchTitle: { fontSize: 15, fontWeight: '800', color: B.textPri, marginBottom: 6, letterSpacing: 2, textTransform: 'uppercase' },
  newBatchSub:   { fontSize: 12, color: B.textMuted, textAlign: 'center', fontStyle: 'italic' },

  // ── Recent Batches History ──
  historySection: { marginBottom: 8 },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: B.border,
  },
  historySpecies:   { fontSize: 13, fontWeight: '700', color: B.textPri, fontStyle: 'italic', marginBottom: 3 },
  historyMeta:      { fontSize: 11, color: B.textMuted },
  historyBadge:     { borderRadius: 0, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, marginLeft: 10 },
  historyBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
});
