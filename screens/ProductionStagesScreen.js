import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Keyboard, Platform, TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import {
  Plus, ChevronRight, ChevronLeft, CheckCircle2,
  Circle, ScanLine, ClipboardList, AlertTriangle, Trash2, X,
} from 'lucide-react-native';
import {
  createProductionBatch,
  getProductionBatches,
  deleteProductionBatch,
  advanceBatchStage,
  addStageLog,
  updateStageLog,
  deleteStageLog,
  getStageLogsForBatch,
  fetchProductsCatalog,
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
  // Final Quality Control moved to the manager dashboard -- the manager
  // reviews the annotated images (with part bounding boxes) from Initial
  // Quality Control there instead of a second physical scan, which is
  // faster for checking specimen completeness. Shown here grayed out so
  // workers know it still exists in the pipeline, just not in this app.
  { id: 11, name: 'Final Quality Control',    type: 'scan', disabled: true },
  { id: 12, name: 'Packaging & Barcoding',    type: 'scan'   },
];

const formatBatchDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "{quantity} x {species}" -> { quantity, speciesDisplay }, or null if the
// entry is a free-text note rather than a structured specimen-count log.
const parseLogText = (text) => {
  const match = /^(\d+)\s*×\s*(.+)$/.exec(text || '');
  if (!match) return null;
  return { quantity: parseInt(match[1], 10), speciesDisplay: match[2].trim() };
};

// Small edit-distance helper for "did you mean" suggestions when a species
// search comes up empty (e.g. a typo like "papilioo ulysses").
function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findClosestSpecies(query, species) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let best = null;
  let bestDist = Infinity;
  for (const s of species) {
    for (const candidate of [s.species, s.commonName]) {
      if (!candidate) continue;
      const c = candidate.toLowerCase();
      const dist = levenshteinDistance(q, c);
      const threshold = Math.max(2, Math.floor(c.length * 0.35));
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
  }
  return best;
}

export default function ProductionStagesScreen({ navigation }) {
  const insets   = useSafeAreaInsets();
  const isFocused = useIsFocused();
  // Date.now() can collide if two rows are added within the same
  // millisecond (a fast double-tap on "+ ADD SPECIMEN TYPE"), which gave
  // React two list items with the same key and broke updates to whichever
  // row got the duplicate. A monotonic counter can't collide.
  const nextRowKeyRef = useRef(1);
  const nextRowKey = () => nextRowKeyRef.current++;

  const [batches,         setBatches]         = useState([]);
  const [selectedBatch,   setSelectedBatch]   = useState(null);
  const [stageLogs,       setStageLogs]       = useState([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [isRefreshing,    setIsRefreshing]     = useState(false);
  const [stageScanCounts, setStageScanCounts] = useState({});
  const [stageScanLogs,   setStageScanLogs]   = useState({});
  const [scanLogModal,    setScanLogModal]     = useState(null); // stageId of open modal

  // Quick batch creation -- no modal, no species: tapping the FAB creates a
  // date-named batch immediately and opens its (always-open) 12 stages.
  const [isCreating, setIsCreating] = useState(false);

  // Species catalog for the stage-log species picker
  const [allSpecies,     setAllSpecies]     = useState([]);
  const [speciesLoading, setSpeciesLoading] = useState(false);

  // Log entry modal -- one row per specimen type (count + species), plus an
  // optional free-text note for the whole entry.
  const [showLogModal,   setShowLogModal]   = useState(false);
  const [logStage,       setLogStage]       = useState(null);
  const [logRows,        setLogRows]        = useState([{ key: 1, quantity: 0, species: null, speciesDisplay: null }]);
  const [logNote,        setLogNote]        = useState('');
  const [isLoggingStage, setIsLoggingStage] = useState(false);

  // Species picker sub-modal -- shared by the ADD LOG rows and by editing an
  // existing entry, so neither path can ever save a species that isn't
  // actually in the catalog. speciesPickerTarget is either
  // { mode: 'row', key } (a logRows row) or { mode: 'editing' } (the entry
  // currently being edited).
  const [speciesPickerTarget, setSpeciesPickerTarget] = useState(null);
  const [speciesPickerSearch, setSpeciesPickerSearch] = useState('');

  // Edit/remove entries for a stage -- replaces the old sequential
  // "STAGE DONE" advance button now that all stages are always open.
  // Structured entries (quantity + species) edit with the same stepper +
  // species-picker as ADD LOG, parsed back out of the saved "{qty} x
  // {species}" text; free-text notes still edit as plain text.
  const [editStage,        setEditStage]        = useState(null);
  const [editingEntryId,   setEditingEntryId]   = useState(null);
  const [editingIsStructured, setEditingIsStructured] = useState(false);
  const [editingQuantity,  setEditingQuantity]  = useState(0);
  const [editingSpecies,   setEditingSpecies]   = useState(null);
  const [editingSpeciesDisplay, setEditingSpeciesDisplay] = useState(null);
  const [editingText,      setEditingText]      = useState('');

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

  // Load the species catalog once on mount -- shared by both the create-batch
  // autocomplete and the stage-log species picker, not just the create modal.
  useEffect(() => {
    setSpeciesLoading(true);
    fetchProductsCatalog()
      .then(data => { setAllSpecies(data || []); })
      .catch(() => {})
      .finally(() => setSpeciesLoading(false));
  }, []);

  // ── Create batch — instant, date-named, no species, straight to stages ──
  const handleQuickCreateBatch = async () => {
    if (isCreating) return;
    setIsCreating(true);
    const created = await createProductionBatch(formatBatchDate(new Date()), 'Unspecified');
    setIsCreating(false);
    if (!created) {
      Alert.alert('Error', 'Could not create batch. Check your connection.');
      return;
    }
    await loadBatches();
    setSelectedBatch(created);
  };

  // ── Add stage log ──
  const openLogModal = (stage) => {
    setLogStage(stage);
    setLogRows([{ key: nextRowKey(), quantity: 0, species: null, speciesDisplay: null }]);
    setLogNote('');
    setShowLogModal(true);
  };

  const addLogRow = () => {
    setLogRows(prev => [...prev, { key: nextRowKey(), quantity: 0, species: null, speciesDisplay: null }]);
  };

  const removeLogRow = (key) => {
    setLogRows(prev => prev.length > 1 ? prev.filter(r => r.key !== key) : prev);
  };

  const adjustLogRowQty = (key, delta) => {
    setLogRows(prev => prev.map(r => r.key === key ? { ...r, quantity: Math.max(0, r.quantity + delta) } : r));
  };

  const setLogRowQtyDirect = (key, text) => {
    const n = parseInt(text, 10);
    setLogRows(prev => prev.map(r => r.key === key ? { ...r, quantity: Number.isNaN(n) ? 0 : Math.max(0, n) } : r));
  };

  const openSpeciesPickerForRow = (key) => {
    setSpeciesPickerTarget({ mode: 'row', key });
    setSpeciesPickerSearch('');
  };

  const openSpeciesPickerForEditing = () => {
    setSpeciesPickerTarget({ mode: 'editing' });
    setSpeciesPickerSearch('');
  };

  // Single handler for both contexts -- the only way species ever gets set
  // is by picking an actual catalog entry here, never by typing free text.
  const selectSpeciesForPicker = (sp) => {
    if (speciesPickerTarget?.mode === 'row') {
      const key = speciesPickerTarget.key;
      setLogRows(prev => prev.map(r =>
        r.key === key ? { ...r, species: sp.species, speciesDisplay: sp.commonName || sp.species } : r
      ));
    } else if (speciesPickerTarget?.mode === 'editing') {
      setEditingSpecies(sp.species);
      setEditingSpeciesDisplay(sp.commonName || sp.species);
    }
    Keyboard.dismiss();
    setSpeciesPickerTarget(null);
    setSpeciesPickerSearch('');
  };

  const handleSubmitLog = async () => {
    // Quantity + species are mandatory together -- a row with one but not
    // the other was previously silently dropped instead of telling the
    // user, which looked like "my entry didn't save."
    const incompleteRow = logRows.find(r => (r.quantity > 0 && !r.species) || (r.quantity === 0 && r.species));
    if (incompleteRow) {
      Alert.alert('Incomplete Row', "Each specimen row needs both a quantity and a species. Remove the row with the − button if you don't need it.");
      return;
    }
    const filledRows = logRows.filter(r => r.quantity > 0 && r.species);
    if (filledRows.length === 0) {
      // The note is optional ON TOP OF a specimen count -- it can never
      // substitute for one.
      Alert.alert('Required', 'Log at least one specimen count with its species. A note alone isn\'t enough.');
      return;
    }
    const note = logNote.trim();
    setIsLoggingStage(true);
    for (const row of filledRows) {
      await addStageLog(selectedBatch.id, logStage.id, logStage.name, `${row.quantity} × ${row.speciesDisplay}`);
    }
    if (note) {
      await addStageLog(selectedBatch.id, logStage.id, logStage.name, note);
    }
    setIsLoggingStage(false);
    Keyboard.dismiss();
    setShowLogModal(false);
    await loadLogsForBatch(selectedBatch);
  };

  // ── Mark whole batch complete — stages are always open, no per-stage
  // advancement anymore, so completion is one manual action for the batch. ──
  const handleMarkComplete = () => {
    Alert.alert(
      'Mark Batch Complete',
      'Are you sure you want to mark this batch as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            const ok = await advanceBatchStage(selectedBatch.id, 13); // any value > 12 = completed
            if (!ok) { Alert.alert('Error', 'Could not mark batch complete. Check your connection.'); return; }
            const updated = { ...selectedBatch, current_stage: 13, status: 'completed' };
            setSelectedBatch(updated);
            setBatches(prev => prev.map(b => b.id === updated.id ? updated : b));
          },
        },
      ]
    );
  };

  // ── Delete the whole batch -- e.g. it was created by mistake ──
  const handleDeleteBatch = () => {
    Alert.alert(
      'Delete Batch',
      `Delete "${selectedBatch.batch_name}" and everything logged in it? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteProductionBatch(selectedBatch.id);
            if (!ok) { Alert.alert('Error', 'Could not delete batch. Check your connection.'); return; }
            setBatches(prev => prev.filter(b => b.id !== selectedBatch.id));
            setSelectedBatch(null);
          },
        },
      ]
    );
  };

  // ── Edit/remove a stage's logged entries ──
  const openEditModal = (stage) => setEditStage(stage);
  const closeEditModal = () => {
    Keyboard.dismiss();
    setEditStage(null);
    setEditingEntryId(null);
    setEditingText('');
    setEditingSpecies(null);
    setEditingSpeciesDisplay(null);
  };

  // Structured "{qty} x {species}" entries edit with the same stepper +
  // species-picker as ADD LOG (parsed back out of the saved text); a plain
  // free-text note still edits as free text, since that's what it is.
  const startEditEntry = (entry) => {
    setEditingEntryId(entry.id);
    const parsed = parseLogText(entry.log_text);
    if (parsed) {
      setEditingIsStructured(true);
      setEditingQuantity(parsed.quantity);
      setEditingSpecies(null);
      setEditingSpeciesDisplay(parsed.speciesDisplay);
    } else {
      setEditingIsStructured(false);
      setEditingText(entry.log_text);
    }
  };

  const cancelEditEntry = () => {
    Keyboard.dismiss();
    setEditingEntryId(null);
    setEditingText('');
    setEditingSpecies(null);
    setEditingSpeciesDisplay(null);
  };

  const adjustEditingQty = (delta) => setEditingQuantity(q => Math.max(0, q + delta));
  const setEditingQtyDirect = (text) => {
    const n = parseInt(text, 10);
    setEditingQuantity(Number.isNaN(n) ? 0 : Math.max(0, n));
  };

  const saveEditEntry = async () => {
    let newText;
    if (editingIsStructured) {
      if (editingQuantity <= 0 || !editingSpeciesDisplay) {
        Alert.alert('Required', 'Enter a quantity and choose a species.');
        return;
      }
      newText = `${editingQuantity} × ${editingSpeciesDisplay}`;
    } else {
      newText = editingText.trim();
      if (!newText) return;
    }
    const ok = await updateStageLog(editingEntryId, newText);
    if (!ok) { Alert.alert('Error', 'Could not save changes. Check your connection.'); return; }
    Keyboard.dismiss();
    setEditingEntryId(null);
    setEditingText('');
    setEditingSpecies(null);
    setEditingSpeciesDisplay(null);
    await loadLogsForBatch(selectedBatch);
  };

  const handleDeleteEntry = (entry) => {
    Alert.alert('Delete Entry', 'Remove this log entry? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteStageLog(entry.id);
          if (!ok) { Alert.alert('Error', 'Could not delete entry. Check your connection.'); return; }
          await loadLogsForBatch(selectedBatch);
        },
      },
    ]);
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

  const logsForStage = (stageId) => stageLogs.filter(l => l.stage_number === stageId);

  const stageHasActivity = (stage) =>
    logsForStage(stage.id).length > 0 || (stage.type === 'scan' && (stageScanCounts[stage.id] || 0) > 0);

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
          <Text style={styles.pageSubtitle}>Track insect batches through the production lifecycle</Text>

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
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.statusBadge, batch.status === 'completed' ? styles.badgeDone : styles.badgeActive]}>
                      <Text style={[styles.statusBadgeText, batch.status === 'completed' ? styles.badgeDoneText : styles.badgeActiveText]}>
                        {batch.status === 'completed' ? 'COMPLETED' : 'ACTIVE'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={B.accentDim} />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* FAB — creates a batch immediately, no modal */}
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 16 }]}
          onPress={handleQuickCreateBatch}
          activeOpacity={0.85}
          disabled={isCreating}
        >
          {isCreating ? <ActivityIndicator color={B.bg} size="small" /> : <Plus size={26} color={B.bg} />}
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Batch detail — stage timeline ───────────────────────────

  const isCompleted = selectedBatch.status === 'completed';
  const loggedStageNames = STAGES.filter(stageHasActivity).map(s => s.name);
  const summaryText = loggedStageNames.length > 0
    ? `Logged: ${loggedStageNames.join(', ')}`
    : 'No stages logged yet';

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* Back header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedBatch(null)}>
          <ChevronLeft size={22} color={B.textPri} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTitle} numberOfLines={1}>{selectedBatch.batch_name}</Text>
          <Text style={styles.detailSubtitle} numberOfLines={1}>{summaryText}</Text>
        </View>
        {isCompleted && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>COMPLETED</Text>
          </View>
        )}
        <TouchableOpacity style={styles.deleteBatchBtn} onPress={handleDeleteBatch} activeOpacity={0.7}>
          <Trash2 size={18} color={B.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.timelineContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={B.accent} />}
      >
        {STAGES.map((stage, idx) => {
          const logs        = logsForStage(stage.id);
          const hasActivity = stageHasActivity(stage);
          const isScan       = stage.type === 'scan';
          const isLast       = idx === STAGES.length - 1;

          // Final Quality Control: shown so the pipeline still reads as 12
          // stages, but greyed out and inert -- it's handled in the
          // manager dashboard now, not tappable here at all.
          if (stage.disabled) {
            return (
              <View key={stage.id} style={styles.stageRow}>
                <View style={styles.timelineSide}>
                  <View style={[styles.stageDot, styles.stageDotDisabled]}>
                    <Text style={[styles.stageDotNum, styles.stageDotNumDisabled]}>{stage.id}</Text>
                  </View>
                  {!isLast && <View style={styles.timelineLine} />}
                </View>
                <View style={[styles.stageCard, styles.stageCardDisabled]}>
                  <View style={styles.stageCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stageName, styles.stageNameDisabled]}>{stage.name}</Text>
                      <Text style={styles.disabledStageNote}>Handled in the Manager Dashboard</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          }

          return (
            <View key={stage.id} style={styles.stageRow}>
              {/* Timeline line + dot — every stage is always open, the dot
                  just reflects whether anything's been logged yet */}
              <View style={styles.timelineSide}>
                <View style={[styles.stageDot, hasActivity && styles.stageDotDone]}>
                  {hasActivity
                    ? <CheckCircle2 size={14} color={B.bg} />
                    : <Text style={styles.stageDotNum}>{stage.id}</Text>
                  }
                </View>
                {!isLast && <View style={[styles.timelineLine, hasActivity && styles.timelineLineDone]} />}
              </View>

              {/* Stage card */}
              <View style={[styles.stageCard, hasActivity && styles.stageCardDone]}>
                <View style={styles.stageCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stageName}>{stage.name}</Text>
                    {isScan && stage.id !== 12 && (
                      <View style={styles.scanTag}>
                        <ScanLine size={11} color={B.accent} />
                        <Text style={styles.scanTagText}>YOLOV8 SCAN</Text>
                      </View>
                    )}
                  </View>
                  {/* Scan log button — shows for every scan stage */}
                  {isScan && (
                    <TouchableOpacity
                      style={[
                        styles.scanCountPill,
                        (stageScanCounts[stage.id] || 0) > 0 && styles.scanCountPillFilled,
                      ]}
                      onPress={() => (stageScanCounts[stage.id] || 0) > 0 && setScanLogModal(stage.id)}
                      activeOpacity={(stageScanCounts[stage.id] || 0) > 0 ? 0.75 : 1}
                    >
                      <ScanLine size={11} color={(stageScanCounts[stage.id] || 0) > 0 ? B.bg : B.textMuted} />
                      <Text style={[
                        styles.scanCountPillText,
                        (stageScanCounts[stage.id] || 0) > 0 && styles.scanCountPillTextFilled,
                      ]}>
                        {(stageScanCounts[stage.id] || 0) > 0
                          ? `${stageScanCounts[stage.id]} SCAN LOG`
                          : '0 SCANS'}
                      </Text>
                      {(stageScanCounts[stage.id] || 0) > 0 && (
                        <ChevronRight size={11} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  )}
                  {hasActivity && <CheckCircle2 size={18} color={B.success} />}
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

                {/* Action buttons — every stage is open; skip/edit/add in any
                    order. EDIT replaces the old sequential "STAGE DONE", and
                    stays available even on a completed batch so a mistake
                    (wrong count, wrong species) can still be fixed or
                    removed -- completing a batch shouldn't lock in errors. */}
                <View style={styles.stageActions}>
                  {!isCompleted && isScan && (
                    <TouchableOpacity style={styles.btnScanFull} onPress={() => handleLaunchScanner(stage)}>
                      <ScanLine size={14} color={B.bg} />
                      <Text style={styles.btnScanText}>LAUNCH SCANNER</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.btnSecondaryRow}>
                    {!isCompleted && (
                      <TouchableOpacity style={styles.btnLog} onPress={() => openLogModal(stage)}>
                        <ClipboardList size={13} color={B.accent} />
                        <Text style={styles.btnLogText} numberOfLines={1}>ADD LOG</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.btnEdit} onPress={() => openEditModal(stage)}>
                      <Text style={styles.btnEditText} numberOfLines={1}>EDIT</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {isCompleted ? (
          <View style={styles.completedBanner}>
            <CheckCircle2 size={28} color={B.success} />
            <Text style={styles.completedBannerText}>BATCH COMPLETE</Text>
            <Text style={styles.completedBannerSub}>
              This batch has been marked as completed. You can still EDIT a stage's entries if something needs fixing.
            </Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.btnMarkComplete} onPress={handleMarkComplete} activeOpacity={0.85}>
            <CheckCircle2 size={16} color={B.bg} />
            <Text style={styles.btnMarkCompleteText}>MARK BATCH COMPLETE</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Log entry modal -- hidden (not unmounted) while the species picker
          is open. Two native Modals visible at once is unreliable on
          Android: the second can fail to actually render while still
          eating all touch input, which looked like "no list opens, then
          every button is dead." Only one Modal is ever visible now. */}
      <Modal visible={showLogModal && speciesPickerTarget === null} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowLogModal(false); }}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>[ STAGE {logStage?.id}: {logStage?.name?.toUpperCase()} ]</Text>
                <Text style={styles.modalSubtitle}>Log today's progress</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => { Keyboard.dismiss(); setShowLogModal(false); }}
                activeOpacity={0.7}
              >
                <X size={18} color={B.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <Text style={styles.inputLabel}>[ SPECIMENS LOGGED ]</Text>
              {logRows.map((row) => (
                <View key={row.key} style={styles.logRow}>
                  <View style={styles.stepperGroup}>
                    <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustLogRowQty(row.key, -1)} activeOpacity={0.7}>
                      <Text style={styles.stepperBtnText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.stepperInput}
                      value={String(row.quantity)}
                      onChangeText={(t) => setLogRowQtyDirect(row.key, t)}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustLogRowQty(row.key, 1)} activeOpacity={0.7}>
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.speciesPickerBtn, row.species && styles.speciesPickerBtnFilled]}
                    onPress={() => openSpeciesPickerForRow(row.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.speciesPickerBtnText, row.species && styles.speciesPickerBtnTextFilled]} numberOfLines={1}>
                      {row.speciesDisplay || 'Choose species…'}
                    </Text>
                  </TouchableOpacity>
                  {logRows.length > 1 && (
                    <TouchableOpacity style={styles.logRowRemove} onPress={() => removeLogRow(row.key)} activeOpacity={0.7}>
                      <Text style={styles.logRowRemoveText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity onPress={addLogRow} activeOpacity={0.7}>
                <Text style={styles.addRowLink}>+ ADD SPECIMEN TYPE</Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>[ NOTE — OPTIONAL ]</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Anything else to note... (optional)"
                placeholderTextColor={B.textMuted}
                value={logNote}
                onChangeText={setLogNote}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => { Keyboard.dismiss(); setShowLogModal(false); }}>
                  <Text style={styles.btnSecondaryText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmitLog} disabled={isLoggingStage}>
                  {isLoggingStage ? <ActivityIndicator color={B.bg} size="small" /> : <Text style={styles.btnPrimaryText}>SAVE LOG</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Species picker sub-modal — shared by ADD LOG rows and entry editing.
          Selecting from this list is the ONLY way a row's species gets set,
          so a typed species can never be saved unless it's an actual catalog
          match. */}
      <Modal visible={speciesPickerTarget !== null} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setSpeciesPickerTarget(null); }}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>[ CHOOSE SPECIES ]</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => { Keyboard.dismiss(); setSpeciesPickerTarget(null); }}
                activeOpacity={0.7}
              >
                <X size={18} color={B.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <TextInput
                style={styles.input}
                placeholder="Search species…"
                placeholderTextColor={B.textMuted}
                value={speciesPickerSearch}
                onChangeText={setSpeciesPickerSearch}
                autoCorrect={false}
              />
            </View>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {(() => {
                const q = speciesPickerSearch.trim().toLowerCase();
                const filtered = allSpecies.filter(s =>
                  !q || s.species.toLowerCase().includes(q) || s.commonName.toLowerCase().includes(q)
                );

                if (filtered.length > 0) {
                  return filtered.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.suggestionItem}
                      onPress={() => selectSpeciesForPicker(s)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.suggestionCommon}>{s.commonName}</Text>
                      <Text style={styles.suggestionScientific}>{s.species}</Text>
                    </TouchableOpacity>
                  ));
                }

                if (allSpecies.length === 0) {
                  return (
                    <Text style={{ padding: 16, color: B.textMuted, fontSize: 12 }}>
                      {speciesLoading ? 'Loading species…' : 'No species available.'}
                    </Text>
                  );
                }

                // No exact/substring match -- offer the closest catalog
                // entry instead of just showing an empty list.
                const closest = findClosestSpecies(speciesPickerSearch, allSpecies);
                return (
                  <View style={{ padding: 16, gap: 10 }}>
                    <Text style={{ color: B.textMuted, fontSize: 12 }}>
                      No matches for "{speciesPickerSearch.trim()}".
                    </Text>
                    {closest && (
                      <TouchableOpacity onPress={() => selectSpeciesForPicker(closest)} activeOpacity={0.7}>
                        <Text style={{ fontSize: 13, color: B.textMuted }}>
                          Did you mean <Text style={styles.didYouMeanLink}>{closest.commonName} ({closest.species})</Text>?
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
            </ScrollView>
            <View style={{ padding: 16 }}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { Keyboard.dismiss(); setSpeciesPickerTarget(null); }}>
                <Text style={styles.btnSecondaryText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit/remove entries for a stage -- same reasoning as the Log modal
          above: hidden while the species picker is open so only one
          native Modal is ever visible at a time. */}
      <Modal visible={editStage !== null && speciesPickerTarget === null} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={closeEditModal}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>[ EDIT STAGE {editStage?.id}: {editStage?.name?.toUpperCase()} ]</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={closeEditModal} activeOpacity={0.7}>
                <X size={18} color={B.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {editStage && logsForStage(editStage.id).length === 0 ? (
                <Text style={{ color: B.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
                  No entries logged yet for this stage.
                </Text>
              ) : editStage && logsForStage(editStage.id).map(entry => (
                <View key={entry.id} style={styles.editEntryRow}>
                  {editingEntryId === entry.id ? (
                    <>
                      {editingIsStructured ? (
                        <View style={styles.logRow}>
                          <View style={styles.stepperGroup}>
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustEditingQty(-1)} activeOpacity={0.7}>
                              <Text style={styles.stepperBtnText}>−</Text>
                            </TouchableOpacity>
                            <TextInput
                              style={styles.stepperInput}
                              value={String(editingQuantity)}
                              onChangeText={setEditingQtyDirect}
                              keyboardType="number-pad"
                            />
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustEditingQty(1)} activeOpacity={0.7}>
                              <Text style={styles.stepperBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            style={[styles.speciesPickerBtn, editingSpeciesDisplay && styles.speciesPickerBtnFilled]}
                            onPress={openSpeciesPickerForEditing}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.speciesPickerBtnText, editingSpeciesDisplay && styles.speciesPickerBtnTextFilled]} numberOfLines={1}>
                              {editingSpeciesDisplay || 'Choose species…'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TextInput
                          style={[styles.input, styles.inputMultiline]}
                          value={editingText}
                          onChangeText={setEditingText}
                          multiline
                          autoFocus
                        />
                      )}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity style={styles.btnSecondary} onPress={cancelEditEntry}>
                          <Text style={styles.btnSecondaryText}>CANCEL</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnPrimary} onPress={saveEditEntry}>
                          <Text style={styles.btnPrimaryText}>SAVE</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.logText}>{entry.log_text}</Text>
                      <Text style={styles.logTime}>
                        {new Date(entry.logged_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                        <TouchableOpacity onPress={() => startEditEntry(entry)} activeOpacity={0.7}>
                          <Text style={styles.editLink}>EDIT</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteEntry(entry)} activeOpacity={0.7}>
                          <Text style={styles.deleteLink}>DELETE</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: B.border }}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 0 }]} onPress={closeEditModal} activeOpacity={0.7}>
                <Text style={styles.btnSecondaryText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Scan log modal */}
      <Modal visible={scanLogModal !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setScanLogModal(null)}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  [ STAGE {scanLogModal}: {STAGES.find(s => s.id === scanLogModal)?.name?.toUpperCase()} ]
                </Text>
                <Text style={styles.modalSubtitle}>
                  {stageScanCounts[scanLogModal] || 0} scan{(stageScanCounts[scanLogModal] || 0) !== 1 ? 's' : ''} this session
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setScanLogModal(null)} activeOpacity={0.7}>
                <X size={18} color={B.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ padding: 16, rowGap: 8 }} nestedScrollEnabled>
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

  statusBadge:    { borderRadius: 0, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeActive:    { backgroundColor: 'rgba(143,164,184,0.12)', borderColor: B.accent },
  badgeDone:      { backgroundColor: B.successBg, borderColor: B.success },
  statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  badgeActiveText: { color: B.accent },
  badgeDoneText:  { color: B.success },

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
  deleteBatchBtn: {
    padding: 6,
    borderWidth: 1,
    borderColor: B.border,
  },

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
  stageDotDisabled: { backgroundColor: B.border },
  stageDotNum:    { fontSize: 11, fontWeight: '800', color: B.bg },
  stageDotNumDisabled: { color: B.textMuted },
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
  stageCardDone:  { borderColor: B.success, opacity: 0.85 },
  stageCardDisabled: { opacity: 0.45 },

  stageCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, padding: 12, paddingLeft: 16, gap: 10 },
  stageName:      { fontSize: 13, fontWeight: '700', color: B.textPri },
  stageNameDisabled: { color: B.textMuted },
  disabledStageNote: { fontSize: 10, color: B.textMuted, fontStyle: 'italic', marginTop: 2 },

  scanTag:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  scanTagText:    { fontSize: 9, color: B.accent, fontWeight: '700', letterSpacing: 1.5 },

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
    borderColor: B.border,
    backgroundColor: B.bg,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 6,
  },
  scanCountPillFilled: {
    borderColor: '#0891B2',
    backgroundColor: '#0891B2',
  },
  scanCountPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: B.textMuted,
    letterSpacing: 0.8,
  },
  scanCountPillTextFilled: {
    color: '#FFFFFF',
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
  btnEdit: {
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
    borderColor: B.textMuted,
    backgroundColor: 'transparent',
  },
  btnEditText: { fontSize: 11, fontWeight: '800', color: B.textMuted, letterSpacing: 1.5, flexShrink: 1, textAlign: 'center' },

  completedBanner: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, gap: 8 },
  completedBannerText: { fontSize: 14, fontWeight: '800', color: B.success, letterSpacing: 2, textTransform: 'uppercase' },
  completedBannerSub:  { fontSize: 13, color: B.textMuted, textAlign: 'center' },
  btnMarkComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 0,
    backgroundColor: B.success,
  },
  btnMarkCompleteText: { fontSize: 12, fontWeight: '800', color: B.bg, letterSpacing: 2, textTransform: 'uppercase' },

  // Edit/remove stage log entries
  editEntryRow: {
    borderWidth: 1,
    borderColor: B.border,
    backgroundColor: B.bg,
    padding: 10,
  },
  editLink:   { fontSize: 11, fontWeight: '800', color: B.accent, letterSpacing: 1 },
  deleteLink: { fontSize: 11, fontWeight: '800', color: B.error, letterSpacing: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: {
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: B.bgEl,
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
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

  // Stage log rows — quantity stepper + species picker per specimen type
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: B.border,
  },
  stepperBtn: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: B.bg,
  },
  stepperBtnText: { fontSize: 18, fontWeight: '700', color: B.accent },
  stepperInput: {
    width: 44,
    height: 38,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: B.textPri,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: B.border,
  },
  speciesPickerBtn: {
    flex: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: B.border,
    backgroundColor: B.bg,
  },
  speciesPickerBtnFilled: {
    borderColor: B.accent,
    backgroundColor: 'rgba(91,33,217,0.06)',
  },
  speciesPickerBtnText: { fontSize: 13, fontWeight: '500', color: B.textMuted },
  speciesPickerBtnTextFilled: { color: B.textPri, fontWeight: '700' },
  logRowRemove: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logRowRemoveText: { fontSize: 15, fontWeight: '700', color: B.error },
  addRowLink: {
    fontSize: 11,
    fontWeight: '800',
    color: B.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    minHeight: 46,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: B.accent,
    backgroundColor: '#F3EEFC',
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

  // Species picker list (log-entry species picker)
  suggestionItem:       { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: B.border },
  suggestionCommon:     { fontSize: 13, fontWeight: '700', color: B.textPri },
  suggestionScientific: { fontSize: 11, color: B.textMuted, fontStyle: 'italic', marginTop: 1 },
  didYouMeanLink:       { color: B.accent, fontWeight: '700' },
});
