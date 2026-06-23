import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import {
  Plus, ChevronRight, ChevronLeft, CheckCircle2,
  Circle, ScanLine, ClipboardList, AlertTriangle,
} from 'lucide-react-native';
import {
  createProductionBatch,
  getProductionBatches,
  advanceBatchStage,
  addStageLog,
  getStageLogsForBatch,
} from '../src/services/supabaseService';

// ── Design tokens ──────────────────────────────────────────────
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

const STAGES = [
  { id: 1,  name: 'Deep Freezing',           type: 'manual' },
  { id: 2,  name: 'Initial Drying',           type: 'manual' },
  { id: 3,  name: 'Pinning & Setting',        type: 'manual' },
  { id: 4,  name: 'Secondary Drying',         type: 'manual' },
  { id: 5,  name: 'Unpinning',                type: 'manual' },
  { id: 6,  name: 'Board Mounting',           type: 'manual' },
  { id: 7,  name: 'Curing',                   type: 'manual' },
  { id: 8,  name: 'Framing',                  type: 'manual' },
  { id: 9,  name: 'Initial Quality Control',  type: 'scan'   },
  { id: 10, name: 'Finishing',                type: 'manual' },
  { id: 11, name: 'Final Quality Control',    type: 'scan'   },
  { id: 12, name: 'Packaging & Barcoding',    type: 'scan'   },
];

export default function ProductionStagesScreen({ navigation }) {
  const insets   = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [batches,         setBatches]         = useState([]);
  const [selectedBatch,   setSelectedBatch]   = useState(null);
  const [stageLogs,       setStageLogs]       = useState([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [isRefreshing,    setIsRefreshing]     = useState(false);
  const [stageScanCounts, setStageScanCounts] = useState({});
  const [stageScanLogs,   setStageScanLogs]   = useState({});
  const [scanLogModal,    setScanLogModal]     = useState(null); // stageId of open modal

  // Create batch modal
  const [showCreateModal,  setShowCreateModal]  = useState(false);
  const [newBatchName,     setNewBatchName]     = useState('');
  const [newBatchSpecies,  setNewBatchSpecies]  = useState('');
  const [isCreating,       setIsCreating]       = useState(false);

  // Log entry modal
  const [showLogModal,   setShowLogModal]   = useState(false);
  const [logStage,       setLogStage]       = useState(null);
  const [logText,        setLogText]        = useState('');
  const [isLoggingStage, setIsLoggingStage] = useState(false);

  const loadBatches = useCallback(async () => {
    const data = await getProductionBatches();
    setBatches(data);
    setIsLoading(false);
  }, []);

  const loadLogsForBatch = useCallback(async (batch) => {
    const logs = await getStageLogsForBatch(batch.id);
    setStageLogs(logs);
  }, []);

  const loadScanCounts = useCallback(async (batch) => {
    if (!batch) return;
    const scanStages = STAGES.filter(s => s.type === 'scan');
    const countKeys = scanStages.map(s => `stage_scan_count_${batch.id}_${s.id}`);
    const logKeys   = scanStages.map(s => `stage_scan_log_${batch.id}_${s.id}`);
    try {
      const [countPairs, logPairs] = await Promise.all([
        AsyncStorage.multiGet(countKeys),
        AsyncStorage.multiGet(logKeys),
      ]);
      const counts = {};
      countPairs.forEach(([, val], i) => {
        counts[scanStages[i].id] = val ? parseInt(val, 10) : 0;
      });
      const logs = {};
      logPairs.forEach(([, val], i) => {
        logs[scanStages[i].id] = val ? JSON.parse(val) : [];
      });
      setStageScanCounts(counts);
      setStageScanLogs(logs);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    loadBatches();
  }, [isFocused, loadBatches]);

  useEffect(() => {
    if (selectedBatch) {
      loadLogsForBatch(selectedBatch);
      loadScanCounts(selectedBatch);
    }
  }, [selectedBatch, isFocused, loadLogsForBatch, loadScanCounts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadBatches();
    if (selectedBatch) await loadLogsForBatch(selectedBatch);
    setIsRefreshing(false);
  };

  // ── Create batch ──
  const handleCreateBatch = async () => {
    const name = newBatchName.trim();
    const species = newBatchSpecies.trim();
    if (!name) { Alert.alert('Required', 'Enter a batch name.'); return; }
    setIsCreating(true);
    const created = await createProductionBatch(name, species || 'Unspecified');
    setIsCreating(false);
    if (!created) {
      Alert.alert('Error', 'Could not create batch. Check your connection.');
      return;
    }
    setShowCreateModal(false);
    setNewBatchName('');
    setNewBatchSpecies('');
    await loadBatches();
    setSelectedBatch(created);
  };

  // ── Add stage log ──
  const openLogModal = (stage) => {
    setLogStage(stage);
    setLogText('');
    setShowLogModal(true);
  };

  const handleSubmitLog = async () => {
    if (!logText.trim()) { Alert.alert('Required', 'Enter a log entry.'); return; }
    setIsLoggingStage(true);
    await addStageLog(selectedBatch.id, logStage.id, logStage.name, logText.trim());
    setIsLoggingStage(false);
    setShowLogModal(false);
    await loadLogsForBatch(selectedBatch);
  };

  // ── Advance stage ──
  const handleAdvanceStage = (stage) => {
    const currentStage = selectedBatch.current_stage;
    if (stage.id !== currentStage) return;

    if (stage.type === 'scan' && (stageScanCounts[stage.id] || 0) === 0) {
      Alert.alert(
        'Scan Required',
        stage.id === 12
          ? 'Scan at least one package barcode before marking this stage complete.'
          : 'Launch the scanner and complete at least one scan before marking this stage done.',
      );
      return;
    }

    const nextStage = currentStage + 1;
    const label = nextStage > 12 ? 'mark this batch as completed' : `advance to Stage ${nextStage}: ${STAGES[nextStage - 1]?.name}`;
    Alert.alert(
      'Confirm',
      `Are you sure you want to ${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextStage > 12 ? 'Complete' : 'Advance',
          onPress: async () => {
            const ok = await advanceBatchStage(selectedBatch.id, nextStage);
            if (!ok) { Alert.alert('Error', 'Could not advance stage. Check your connection.'); return; }
            // Clear this stage's scan count + log now that it's done
            await AsyncStorage.multiRemove([
              `stage_scan_count_${selectedBatch.id}_${stage.id}`,
              `stage_scan_log_${selectedBatch.id}_${stage.id}`,
            ]).catch(() => {});
            setStageScanCounts(prev => ({ ...prev, [stage.id]: 0 }));
            setStageScanLogs(prev => ({ ...prev, [stage.id]: [] }));
            const updated = { ...selectedBatch, current_stage: nextStage, status: nextStage > 12 ? 'completed' : 'in_progress' };
            setSelectedBatch(updated);
            setBatches(prev => prev.map(b => b.id === updated.id ? updated : b));
          },
        },
      ]
    );
  };

  // ── Launch scanner — stage 12 uses barcode scanner, others use YOLO ──
  const handleLaunchScanner = (stage) => {
    if (stage.id === 12) {
      navigation.navigate('PackagingBarcodeScanner', {
        batchId: selectedBatch?.id,
        stageId: stage.id,
      });
      return;
    }
    navigation.navigate('YoloScan', {
      stepId:    stage.id,
      stepTitle: stage.name,
      mode:      'standalone',
      batchId:   selectedBatch?.id,
    });
  };

  // ─── Render helpers ──────────────────────────────────────────

  const getStageStatus = (stageId) => {
    if (!selectedBatch) return 'future';
    if (selectedBatch.status === 'completed' || stageId < selectedBatch.current_stage) return 'done';
    if (stageId === selectedBatch.current_stage) return 'active';
    return 'future';
  };

  const logsForStage = (stageId) => stageLogs.filter(l => l.stage_number === stageId);

  // ─── Batch list ──────────────────────────────────────────────

  if (!selectedBatch) {
    return (
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={B.accent} />}
        >
          {/* Section header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
            <Text style={{ fontSize: 9, color: B.accent, fontWeight: '700', letterSpacing: 2.5 }}>[ PRODUCTION BATCHES ]</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
          </View>
          <Text style={styles.pageSubtitle}>Track insect batches through the 12-stage lifecycle</Text>

          {isLoading ? (
            <ActivityIndicator color={B.accent} style={{ marginTop: 48 }} />
          ) : batches.length === 0 ? (
            <View style={styles.emptyState}>
              <ClipboardList size={48} color={B.accentDim} />
              <Text style={styles.emptyTitle}>No batches yet</Text>
              <Text style={styles.emptyBody}>Create a batch to start tracking specimens through production.</Text>
            </View>
          ) : (
            batches.map(batch => (
              <TouchableOpacity key={batch.id} style={styles.batchCard} onPress={() => setSelectedBatch(batch)} activeOpacity={0.75}>
                <View style={styles.batchCardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.batchCardName}>{batch.batch_name}</Text>
                    <Text style={styles.batchCardSpecies}>{batch.species}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[
                      styles.statusBadge,
                      batch.status === 'completed' ? styles.badgeDone : styles.badgeActive,
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        batch.status === 'completed' ? styles.badgeDoneText : styles.badgeActiveText,
                      ]}>
                        {batch.status === 'completed' ? 'COMPLETED' : `STAGE ${batch.current_stage} / 12`}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={B.accentDim} />
                  </View>
                </View>
                {/* Mini progress bar */}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min((batch.current_stage - 1) / 12 * 100, 100)}%` }]} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 16 }]}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.85}
        >
          <Plus size={26} color={B.bg} />
        </TouchableOpacity>

        {/* Create batch modal */}
        <Modal visible={showCreateModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>[ NEW PRODUCTION BATCH ]</Text>
              </View>
              <View style={{ padding: 20, gap: 12 }}>
                <Text style={styles.inputLabel}>[ BATCH NAME ]</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Batch name (e.g. Batch #001)"
                  placeholderTextColor={B.textMuted}
                  value={newBatchName}
                  onChangeText={setNewBatchName}
                />
                <Text style={styles.inputLabel}>[ SPECIES ]</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Species (e.g. Papilio ulysses)"
                  placeholderTextColor={B.textMuted}
                  value={newBatchSpecies}
                  onChangeText={setNewBatchSpecies}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowCreateModal(false)}>
                    <Text style={styles.btnSecondaryText}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnPrimary} onPress={handleCreateBatch} disabled={isCreating}>
                    {isCreating ? <ActivityIndicator color={B.bg} size="small" /> : <Text style={styles.btnPrimaryText}>CREATE</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─── Batch detail — 12-stage timeline ────────────────────────

  const isCompleted = selectedBatch.status === 'completed';

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* Back header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedBatch(null)}>
          <ChevronLeft size={22} color={B.textPri} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTitle} numberOfLines={1}>{selectedBatch.batch_name}</Text>
          <Text style={styles.detailSubtitle}>{selectedBatch.species}</Text>
        </View>
        {isCompleted && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>COMPLETED</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.timelineContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={B.accent} />}
      >
        {STAGES.map((stage, idx) => {
          const status  = getStageStatus(stage.id);
          const logs    = logsForStage(stage.id);
          const isActive = status === 'active';
          const isDone   = status === 'done';
          const isFuture = status === 'future';
          const isScan   = stage.type === 'scan';
          const isLast   = idx === STAGES.length - 1;

          return (
            <View key={stage.id} style={styles.stageRow}>
              {/* Timeline line + dot */}
              <View style={styles.timelineSide}>
                <View style={[
                  styles.stageDot,
                  isDone   && styles.stageDotDone,
                  isActive && styles.stageDotActive,
                  isFuture && styles.stageDotFuture,
                ]}>
                  {isDone
                    ? <CheckCircle2 size={14} color={B.bg} />
                    : <Text style={[styles.stageDotNum, isFuture && styles.stageDotNumFuture]}>{stage.id}</Text>
                  }
                </View>
                {!isLast && <View style={[styles.timelineLine, isDone && styles.timelineLineDone]} />}
              </View>

              {/* Stage card */}
              <View style={[
                styles.stageCard,
                isActive && styles.stageCardActive,
                isDone   && styles.stageCardDone,
                isFuture && styles.stageCardFuture,
              ]}>
                {/* Left accent bar for active stage */}
                {isActive && <View style={styles.stageActiveAccent} />}

                <View style={styles.stageCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stageName, isFuture && styles.stageNameFuture]}>{stage.name}</Text>
                    {isScan && stage.id !== 12 && (
                      <View style={styles.scanTag}>
                        <ScanLine size={11} color={B.accent} />
                        <Text style={styles.scanTagText}>YOLOV8 SCAN</Text>
                      </View>
                    )}
                  </View>
                  {/* Inline scan count pill — replaces the full-width count row */}
                  {isScan && isActive && (stageScanCounts[stage.id] || 0) > 0 && (
                    <TouchableOpacity
                      style={styles.scanCountPill}
                      onPress={() => setScanLogModal(stage.id)}
                      activeOpacity={0.7}
                    >
                      <ScanLine size={10} color={B.accent} />
                      <Text style={styles.scanCountPillText}>{stageScanCounts[stage.id]}</Text>
                    </TouchableOpacity>
                  )}
                  {isDone && <CheckCircle2 size={18} color={B.success} />}
                  {isActive && !isCompleted && (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>ACTIVE</Text>
                    </View>
                  )}
                </View>

                {/* Existing logs for this stage */}
                {logs.length > 0 && (
                  <View style={styles.logsContainer}>
                    {logs.map(log => (
                      <View key={log.id} style={styles.logEntry}>
                        <Text style={styles.logText}>{log.log_text}</Text>
                        <Text style={styles.logTime}>{new Date(log.logged_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Action buttons — only for active stage */}
                {isActive && !isCompleted && (
                  <View style={styles.stageActions}>
                    {isScan ? (
                      <>
                        {/* Full-width primary action */}
                        <TouchableOpacity style={styles.btnScanFull} onPress={() => handleLaunchScanner(stage)}>
                          <ScanLine size={14} color={B.bg} />
                          <Text style={styles.btnScanText}>LAUNCH SCANNER</Text>
                        </TouchableOpacity>
                        {/* Secondary row */}
                        <View style={styles.btnSecondaryRow}>
                          <TouchableOpacity style={styles.btnLog} onPress={() => openLogModal(stage)}>
                            <ClipboardList size={13} color={B.accent} />
                            <Text style={styles.btnLogText} numberOfLines={1}>ADD LOG</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.btnAdvance} onPress={() => handleAdvanceStage(stage)}>
                            <Text style={styles.btnAdvanceText} numberOfLines={1}>
                              {stage.id === 12 ? 'MARK COMPLETE' : 'STAGE DONE'}
                            </Text>
                            <ChevronRight size={13} color={B.bg} />
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity style={styles.btnLog} onPress={() => openLogModal(stage)}>
                          <ClipboardList size={14} color={B.accent} />
                          <Text style={styles.btnLogText} numberOfLines={1}>ADD LOG</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnAdvance} onPress={() => handleAdvanceStage(stage)}>
                          <Text style={styles.btnAdvanceText} numberOfLines={1}>STAGE DONE</Text>
                          <ChevronRight size={14} color={B.bg} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {isCompleted && (
          <View style={styles.completedBanner}>
            <CheckCircle2 size={28} color={B.success} />
            <Text style={styles.completedBannerText}>ALL 12 STAGES COMPLETE</Text>
            <Text style={styles.completedBannerSub}>This batch has been fully processed.</Text>
          </View>
        )}
      </ScrollView>

      {/* Log entry modal */}
      <Modal visible={showLogModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>[ STAGE {logStage?.id}: {logStage?.name?.toUpperCase()} ]</Text>
              <Text style={styles.modalSubtitle}>Log today's progress</Text>
            </View>
            <View style={{ padding: 20, gap: 12 }}>
              <Text style={styles.inputLabel}>[ LOG ENTRY ]</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Describe what was done today..."
                placeholderTextColor={B.textMuted}
                value={logText}
                onChangeText={setLogText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowLogModal(false)}>
                  <Text style={styles.btnSecondaryText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmitLog} disabled={isLoggingStage}>
                  {isLoggingStage ? <ActivityIndicator color={B.bg} size="small" /> : <Text style={styles.btnPrimaryText}>SAVE LOG</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Scan log modal */}
      <Modal visible={scanLogModal !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                [ STAGE {scanLogModal}: {STAGES.find(s => s.id === scanLogModal)?.name?.toUpperCase()} ]
              </Text>
              <Text style={styles.modalSubtitle}>
                {stageScanCounts[scanLogModal] || 0} scan{(stageScanCounts[scanLogModal] || 0) !== 1 ? 's' : ''} this session
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ padding: 16, rowGap: 8 }}>
              {(stageScanLogs[scanLogModal] || []).length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                  <ScanLine size={28} color={B.textMuted} />
                  <Text style={{ color: B.textMuted, fontSize: 13, textAlign: 'center', fontWeight: '500' }}>
                    Detailed scan logs will appear here for scans made during this session.
                  </Text>
                </View>
              ) : (stageScanLogs[scanLogModal] || []).map((entry, i) => {
                const time = new Date(entry.timestamp);
                const timeStr = time.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const dateStr = time.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
                return (
                  <View key={i} style={styles.scanLogEntry}>
                    <View style={styles.scanLogEntryTop}>
                      <Text style={styles.scanLogSpecies} numberOfLines={1}>{entry.species}</Text>
                      <Text style={styles.scanLogTime}>{dateStr} · {timeStr}</Text>
                    </View>
                    {entry.type === 'yolo' ? (
                      <View style={styles.scanLogMeta}>
                        <View style={[styles.scanLogBadge, { borderColor: '#10B981' }]}>
                          <Text style={[styles.scanLogBadgeText, { color: '#10B981' }]}>{entry.passCount} PASS</Text>
                        </View>
                        {entry.flaggedCount > 0 && (
                          <View style={[styles.scanLogBadge, { borderColor: '#EF4444' }]}>
                            <Text style={[styles.scanLogBadgeText, { color: '#EF4444' }]}>{entry.flaggedCount} FLAGGED</Text>
                          </View>
                        )}
                        <Text style={styles.scanLogTotal}>{entry.total} specimen{entry.total !== 1 ? 's' : ''} detected</Text>
                      </View>
                    ) : (
                      <View style={styles.scanLogMeta}>
                        <View style={[styles.scanLogBadge, { borderColor: B.accent }]}>
                          <Text style={[styles.scanLogBadgeText, { color: B.accent }]}>STOCK REQUESTED</Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: B.border }}>
              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 0 }]}
                onPress={() => setScanLogModal(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.btnSecondaryText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },

  // Batch list
  listContent:    { padding: 16, paddingBottom: 100 },
  pageSubtitle:   { fontSize: 12, color: B.textMuted, marginBottom: 20, marginTop: 4 },

  emptyState:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle:     { fontSize: 15, fontWeight: '700', color: B.textPri, letterSpacing: 1 },
  emptyBody:      { fontSize: 13, color: B.textMuted, textAlign: 'center', maxWidth: 260 },

  batchCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    padding: 14,
    marginBottom: 10,
  },
  batchCardRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  batchCardName:  { fontSize: 14, fontWeight: '700', color: B.textPri },
  batchCardSpecies: { fontSize: 12, color: B.textMuted, marginTop: 2, fontStyle: 'italic' },

  statusBadge:    { borderRadius: 0, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeActive:    { backgroundColor: 'rgba(143,164,184,0.12)', borderColor: B.accent },
  badgeDone:      { backgroundColor: B.successBg, borderColor: B.success },
  statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  badgeActiveText: { color: B.accent },
  badgeDoneText:  { color: B.success },

  progressTrack:  { height: 3, backgroundColor: B.border, borderRadius: 0 },
  progressFill:   { height: 3, backgroundColor: B.accent, borderRadius: 0 },

  fab: {
    position: 'absolute',
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 0,
    backgroundColor: B.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: B.accentText,
  },

  // Detail header
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: B.bgEl,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
  },
  backBtn: {
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 0,
    padding: 6,
  },
  detailTitle:    { fontSize: 14, fontWeight: '800', color: B.textPri, letterSpacing: 1, textTransform: 'uppercase' },
  detailSubtitle: { fontSize: 12, color: B.textMuted, fontStyle: 'italic', marginTop: 2 },
  completedBadge: {
    backgroundColor: B.successBg,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  completedBadgeText: { fontSize: 9, fontWeight: '700', color: B.success, letterSpacing: 1.5, textTransform: 'uppercase' },

  // Timeline
  timelineContent: { padding: 16, paddingBottom: 40 },
  stageRow:       { flexDirection: 'row', marginBottom: 4 },

  timelineSide:   { width: 36, alignItems: 'center' },
  stageDot: {
    width: 28,
    height: 28,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: B.accent,
  },
  stageDotDone:   { backgroundColor: B.success },
  stageDotActive: { backgroundColor: B.accent },
  stageDotFuture: { backgroundColor: B.border },
  stageDotNum:    { fontSize: 11, fontWeight: '800', color: B.bg },
  stageDotNumFuture: { color: B.textMuted },
  timelineLine:   { width: 2, flex: 1, minHeight: 16, backgroundColor: B.border, marginTop: 2 },
  timelineLineDone: { backgroundColor: B.success },

  stageCard: {
    flex: 1,
    marginLeft: 10,
    marginBottom: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    backgroundColor: B.bgCard,
    overflow: 'hidden',
  },
  stageActiveAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: B.accent,
  },
  stageCardActive: { borderColor: B.borderActive },
  stageCardDone:  { borderColor: B.success, opacity: 0.85 },
  stageCardFuture: { opacity: 0.45 },

  stageCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, padding: 12, paddingLeft: 16, gap: 10 },
  stageName:      { fontSize: 13, fontWeight: '700', color: B.textPri },
  stageNameFuture: { color: B.textMuted },

  scanTag:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  scanTagText:    { fontSize: 9, color: B.accent, fontWeight: '700', letterSpacing: 1.5 },

  activePill: {
    backgroundColor: 'rgba(143,164,184,0.12)',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activePillText: { fontSize: 9, fontWeight: '700', color: B.accent, letterSpacing: 1.5 },

  logsContainer: {
    borderTopWidth: 1,
    borderTopColor: B.border,
    paddingTop: 8,
    marginTop: 0,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 6,
  },
  logEntry: {
    backgroundColor: B.bg,
    borderRadius: 0,
    borderLeftWidth: 2,
    borderLeftColor: B.border,
    padding: 8,
    paddingLeft: 10,
  },
  logText:  { fontSize: 12, color: B.textPri, lineHeight: 18 },
  logTime:  { fontSize: 10, color: B.textMuted, marginTop: 4 },

  stageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingLeft: 16,
  },
  scanCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: B.accent,
    backgroundColor: 'rgba(91,33,217,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
  scanCountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: B.accent,
    letterSpacing: 0.5,
  },
  btnScanFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: B.accent,
    paddingVertical: 12,
    gap: 8,
    width: '100%',
  },
  btnSecondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  scanLogEntry: {
    backgroundColor: B.bg,
    borderWidth: 1,
    borderColor: B.border,
    padding: 10,
    gap: 6,
  },
  scanLogEntryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  scanLogSpecies: { fontSize: 13, fontWeight: '700', color: B.textPri, flex: 1, fontStyle: 'italic' },
  scanLogTime:    { fontSize: 10, color: B.textMuted, fontWeight: '500', flexShrink: 0 },
  scanLogMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  scanLogBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  scanLogBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  scanLogTotal:     { fontSize: 11, color: B.textMuted, fontWeight: '500' },
  scanCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: B.border,
    backgroundColor: B.bg,
  },
  scanCountRowFilled: {
    borderColor: B.accent,
    backgroundColor: 'rgba(91,33,217,0.06)',
  },
  scanCountText: {
    fontSize: 11,
    color: B.textMuted,
    fontWeight: '500',
  },
  scanCountTextFilled: {
    color: B.accent,
    fontWeight: '700',
  },
  btnLog: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.accent,
    backgroundColor: 'transparent',
  },
  btnLogText: { fontSize: 11, fontWeight: '800', color: B.accent, letterSpacing: 1.5, flexShrink: 1, textAlign: 'center' },
  btnScan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 0,
    backgroundColor: B.accent,
  },
  btnScanText: { fontSize: 11, fontWeight: '800', color: B.bg, letterSpacing: 2 },
  btnAdvance: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 0,
    backgroundColor: B.success,
  },
  btnAdvanceText: { fontSize: 11, fontWeight: '800', color: B.bg, letterSpacing: 1, flexShrink: 1, textAlign: 'center' },

  completedBanner: { alignItems: 'center', paddingTop: 24, gap: 8 },
  completedBannerText: { fontSize: 14, fontWeight: '800', color: B.success, letterSpacing: 2, textTransform: 'uppercase' },
  completedBannerSub:  { fontSize: 13, color: B.textMuted },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: {
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 0,
  },
  modalHeader: {
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: B.bgEl,
  },
  modalTitle:    { fontSize: 12, fontWeight: '800', color: B.textPri, letterSpacing: 2, textTransform: 'uppercase' },
  modalSubtitle: { fontSize: 12, color: B.textMuted, marginTop: 4 },
  inputLabel:    { fontSize: 9, color: B.accentDim, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase' },

  input: {
    backgroundColor: B.bg,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: B.textPri,
  },
  inputMultiline: { minHeight: 100 },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.accent,
    backgroundColor: 'transparent',
  },
  btnSecondaryText: { fontSize: 13, fontWeight: '800', color: B.accent, letterSpacing: 3, textTransform: 'uppercase' },
  btnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 0,
    backgroundColor: B.accent,
  },
  btnPrimaryText: { fontSize: 13, fontWeight: '800', color: B.bg, letterSpacing: 3, textTransform: 'uppercase' },
});
