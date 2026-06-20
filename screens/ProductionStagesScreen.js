import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import {
  Plus, ChevronRight, ChevronLeft, CheckCircle2,
  Circle, ScanLine, ClipboardList, AlertTriangle,
} from 'lucide-react-native';
import { COLORS, SHADOW_SM } from '../theme';
import {
  createProductionBatch,
  getProductionBatches,
  advanceBatchStage,
  addStageLog,
  getStageLogsForBatch,
} from '../src/services/supabaseService';

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

  const [batches,        setBatches]        = useState([]);
  const [selectedBatch,  setSelectedBatch]  = useState(null);
  const [stageLogs,      setStageLogs]      = useState([]);
  const [isLoading,      setIsLoading]      = useState(true);
  const [isRefreshing,   setIsRefreshing]   = useState(false);

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

  useEffect(() => {
    if (!isFocused) return;
    loadBatches();
  }, [isFocused, loadBatches]);

  useEffect(() => {
    if (selectedBatch) loadLogsForBatch(selectedBatch);
  }, [selectedBatch, loadLogsForBatch]);

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
            const updated = { ...selectedBatch, current_stage: nextStage, status: nextStage > 12 ? 'completed' : 'in_progress' };
            setSelectedBatch(updated);
            setBatches(prev => prev.map(b => b.id === updated.id ? updated : b));
          },
        },
      ]
    );
  };

  // ── Launch scanner for QC stage ──
  const handleLaunchScanner = (stage) => {
    navigation.navigate('YoloScan', {
      stepId:    stage.id,
      stepTitle: stage.name,
      mode:      'standalone',
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
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <Text style={styles.pageTitle}>Production Batches</Text>
          <Text style={styles.pageSubtitle}>Track insect batches through the 12-stage lifecycle</Text>

          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
          ) : batches.length === 0 ? (
            <View style={styles.emptyState}>
              <ClipboardList size={48} color={COLORS.borderMid} />
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
                    <View style={[styles.statusBadge, batch.status === 'completed' ? styles.badgeDone : styles.badgeActive]}>
                      <Text style={[styles.statusBadgeText, batch.status === 'completed' ? styles.badgeDoneText : styles.badgeActiveText]}>
                        {batch.status === 'completed' ? 'Completed' : `Stage ${batch.current_stage} / 12`}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={COLORS.textLight} />
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
        <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={() => setShowCreateModal(true)} activeOpacity={0.85}>
          <Plus size={26} color="#fff" />
        </TouchableOpacity>

        {/* Create batch modal */}
        <Modal visible={showCreateModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Production Batch</Text>
              <TextInput
                style={styles.input}
                placeholder="Batch name (e.g. Batch #001)"
                placeholderTextColor={COLORS.textLight}
                value={newBatchName}
                onChangeText={setNewBatchName}
              />
              <TextInput
                style={styles.input}
                placeholder="Species (e.g. Papilio ulysses)"
                placeholderTextColor={COLORS.textLight}
                value={newBatchSpecies}
                onChangeText={setNewBatchSpecies}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowCreateModal(false)}>
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleCreateBatch} disabled={isCreating}>
                  {isCreating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Create</Text>}
                </TouchableOpacity>
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
          <ChevronLeft size={22} color={COLORS.textOnDark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTitle} numberOfLines={1}>{selectedBatch.batch_name}</Text>
          <Text style={styles.detailSubtitle}>{selectedBatch.species}</Text>
        </View>
        {isCompleted && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Completed</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.timelineContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
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
                    ? <CheckCircle2 size={16} color="#fff" />
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
                <View style={styles.stageCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stageName, isFuture && styles.stageNameFuture]}>{stage.name}</Text>
                    {isScan && (
                      <View style={styles.scanTag}>
                        <ScanLine size={11} color={COLORS.primary} />
                        <Text style={styles.scanTagText}>YOLOv8 Scan</Text>
                      </View>
                    )}
                  </View>
                  {isDone && <CheckCircle2 size={18} color={COLORS.successGreen} />}
                  {isActive && !isCompleted && (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Active</Text>
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
                    {/* Log entry button — always available */}
                    <TouchableOpacity style={styles.btnLog} onPress={() => openLogModal(stage)}>
                      <ClipboardList size={14} color={COLORS.primary} />
                      <Text style={styles.btnLogText}>Add Log</Text>
                    </TouchableOpacity>

                    {/* Launch scanner — only for scan stages */}
                    {isScan && (
                      <TouchableOpacity style={styles.btnScan} onPress={() => handleLaunchScanner(stage)}>
                        <ScanLine size={14} color="#fff" />
                        <Text style={styles.btnScanText}>Launch Scanner</Text>
                      </TouchableOpacity>
                    )}

                    {/* Advance / complete stage */}
                    <TouchableOpacity style={styles.btnAdvance} onPress={() => handleAdvanceStage(stage)}>
                      <Text style={styles.btnAdvanceText}>
                        {stage.id === 12 ? 'Mark Complete' : 'Stage Done'}
                      </Text>
                      <ChevronRight size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {isCompleted && (
          <View style={styles.completedBanner}>
            <CheckCircle2 size={28} color={COLORS.successGreen} />
            <Text style={styles.completedBannerText}>All 12 stages complete</Text>
            <Text style={styles.completedBannerSub}>This batch has been fully processed.</Text>
          </View>
        )}
      </ScrollView>

      {/* Log entry modal */}
      <Modal visible={showLogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Stage {logStage?.id}: {logStage?.name}</Text>
            <Text style={styles.modalSubtitle}>Log today's progress</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Describe what was done today..."
              placeholderTextColor={COLORS.textLight}
              value={logText}
              onChangeText={setLogText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowLogModal(false)}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmitLog} disabled={isLoggingStage}>
                {isLoggingStage ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Save Log</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: COLORS.pageBg },

  // Batch list
  listContent:    { padding: 16, paddingBottom: 100 },
  pageTitle:      { fontSize: 22, fontWeight: '700', color: COLORS.textDark, marginBottom: 4 },
  pageSubtitle:   { fontSize: 13, color: COLORS.textMuted, marginBottom: 20 },

  emptyState:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle:     { fontSize: 17, fontWeight: '600', color: COLORS.textMid },
  emptyBody:      { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', maxWidth: 260 },

  batchCard:      { backgroundColor: COLORS.cardBg, borderRadius: 12, padding: 14, marginBottom: 12, ...SHADOW_SM },
  batchCardRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  batchCardName:  { fontSize: 15, fontWeight: '700', color: COLORS.textDark },
  batchCardSpecies: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontStyle: 'italic' },

  statusBadge:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeActive:    { backgroundColor: COLORS.primaryLight },
  badgeDone:      { backgroundColor: COLORS.successBg },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  badgeActiveText: { color: COLORS.primary },
  badgeDoneText:  { color: COLORS.successGreen },

  progressTrack:  { height: 4, backgroundColor: COLORS.borderLight, borderRadius: 2 },
  progressFill:   { height: 4, backgroundColor: COLORS.primary, borderRadius: 2 },

  fab:            { position: 'absolute', right: 20, width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6 },

  // Detail header
  detailHeader:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.headerBg, paddingHorizontal: 12, paddingVertical: 14, gap: 10 },
  backBtn:        { padding: 4 },
  detailTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.textOnDark },
  detailSubtitle: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },
  completedBadge: { backgroundColor: COLORS.successBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  completedBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.successGreen },

  // Timeline
  timelineContent: { padding: 16, paddingBottom: 40 },
  stageRow:       { flexDirection: 'row', marginBottom: 4 },

  timelineSide:   { width: 36, alignItems: 'center' },
  stageDot:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  stageDotDone:   { backgroundColor: COLORS.successGreen },
  stageDotActive: { backgroundColor: COLORS.primary },
  stageDotFuture: { backgroundColor: COLORS.borderMid },
  stageDotNum:    { fontSize: 12, fontWeight: '700', color: '#fff' },
  stageDotNumFuture: { color: COLORS.textMuted },
  timelineLine:   { width: 2, flex: 1, minHeight: 16, backgroundColor: COLORS.borderLight, marginTop: 2 },
  timelineLineDone: { backgroundColor: COLORS.successGreen },

  stageCard:      { flex: 1, marginLeft: 10, marginBottom: 12, borderRadius: 10, padding: 12, backgroundColor: COLORS.cardBg, ...SHADOW_SM },
  stageCardActive: { borderWidth: 1.5, borderColor: COLORS.primary },
  stageCardDone:  { opacity: 0.85 },
  stageCardFuture: { opacity: 0.5 },

  stageCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  stageName:      { fontSize: 13, fontWeight: '700', color: COLORS.textDark },
  stageNameFuture: { color: COLORS.textMuted },

  scanTag:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  scanTagText:    { fontSize: 11, color: COLORS.primary, fontWeight: '600' },

  activePill:     { backgroundColor: COLORS.primaryLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  activePillText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  logsContainer:  { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 8, marginTop: 4, gap: 6 },
  logEntry:       { backgroundColor: COLORS.inputBg, borderRadius: 6, padding: 8 },
  logText:        { fontSize: 12, color: COLORS.textMid, lineHeight: 18 },
  logTime:        { fontSize: 10, color: COLORS.textLight, marginTop: 4 },

  stageActions:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btnLog:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
  btnLogText:     { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  btnScan:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: '#7c3aed' },
  btnScanText:    { fontSize: 12, fontWeight: '600', color: '#fff' },
  btnAdvance:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: COLORS.successGreen },
  btnAdvanceText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  completedBanner: { alignItems: 'center', paddingTop: 24, gap: 8 },
  completedBannerText: { fontSize: 17, fontWeight: '700', color: COLORS.successGreen },
  completedBannerSub:  { fontSize: 13, color: COLORS.textMuted },

  // Modals
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:      { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalTitle:     { fontSize: 17, fontWeight: '700', color: COLORS.textDark },
  modalSubtitle:  { fontSize: 13, color: COLORS.textMuted, marginTop: -8 },

  input:          { backgroundColor: COLORS.inputBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.textDark, borderWidth: 1, borderColor: COLORS.borderLight },
  inputMultiline: { minHeight: 100 },

  modalActions:   { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary:   { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderMid },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: COLORS.textMid },
  btnPrimary:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary },
  btnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
