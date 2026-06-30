import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Keyboard, Platform, TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import {
  Plus, ChevronRight, ChevronLeft, ChevronDown, CheckCircle2,
  Circle, ScanLine, ClipboardList, AlertTriangle, Trash2, X, Clock,
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
import { getWorkerSession, workerLabel } from '../src/services/workerSession';

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
  // Final Quality Control is manager-only -- workers can't act on it here.
  // It's shown grayed out so the pipeline still reads as 12 stages, with a
  // note that only the manager controls it (on the web dashboard).
  { id: 11, name: 'Final Quality Control',    type: 'scan', disabled: true },
  { id: 12, name: 'Packaging & Barcoding',    type: 'scan'   },
];

const formatBatchDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// Optional note character cap -- long enough for a real remark, short enough
// that it can't become a wall of text in a one-line log entry.
const NOTE_MAX = 200;

// Existing batches were named with the short month ("Jun 24, 2026").
// Expand the short month token to its full name for display ("June 24,
// 2026"). Done as a plain string swap -- NOT via new Date(name), because
// React Native's Hermes engine doesn't parse localized date strings, so
// that silently failed and left "Jun" untouched.
const _SHORT_TO_LONG_MONTH = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April',
  May: 'May', Jun: 'June', Jul: 'July', Aug: 'August',
  Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};
const displayBatchName = (name) => {
  if (!name) return name;
  return name.replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/,
    (m) => _SHORT_TO_LONG_MONTH[m] || m
  );
};

// RN's built-in Modal animationType="fade" runs a native transition with a
// fixed, non-configurable duration that felt slow/clunky to use here.
// This drives a much quicker (120ms) custom fade-in instead, used with
// animationType="none" on the Modal itself. Close stays instant -- an
// abrupt close doesn't feel slow, so it's not worth the complexity of also
// animating the exit (which would require delaying the actual unmount).
function useFadeIn(visible, duration = 120) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
    }
  }, [visible]);
  return opacity;
}

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
  // FAB press feedback -- a quick scale-down on press-in, springs back out.
  const fabScale = useRef(new Animated.Value(1)).current;
  const fabPressIn  = () => Animated.spring(fabScale, { toValue: 0.85, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const fabPressOut = () => Animated.spring(fabScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();

  const [batches,         setBatches]         = useState([]);
  const [selectedBatch,   setSelectedBatch]   = useState(null);
  const [stageLogs,       setStageLogs]       = useState([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [isRefreshing,    setIsRefreshing]     = useState(false);
  const [worker, setWorker] = useState(null);
  const [stageScanCounts, setStageScanCounts] = useState({});
  const [stageScanLogs,   setStageScanLogs]   = useState({});
  const [scanLogModal,    setScanLogModal]     = useState(null); // stageId of open modal
  const [expandedStageId, setExpandedStageId]  = useState(null); // accordion: which stage card is open

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

  // Fast custom fade-in for each modal -- see useFadeIn above. The species
  // picker no longer has its own Modal/fade (see renderSpeciesPickerBody).
  const logModalFade      = useFadeIn(showLogModal);
  const editModalFade     = useFadeIn(editStage !== null);
  const scanLogModalFade  = useFadeIn(scanLogModal !== null);

  const loadBatches = useCallback(async () => {
    const data = await getProductionBatches(workerLabel(worker));
    setBatches(data);
    setIsLoading(false);
  }, [worker]);

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
    getWorkerSession().then(s => setWorker(s));
  }, []);

  useEffect(() => {
    if (!isFocused || !worker?.name) return;
    loadBatches();
  }, [isFocused, worker, loadBatches]);

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
      .then(data => {
        // Some inventory rows have stray leading/trailing whitespace in
        // their name (seen directly in Supabase: "  Fork-horned Stag
        // Beetle"), which misaligns the rendered text AND sorts before
        // every letter since whitespace < any character -- trim
        // defensively so a future dirty row can't cause the same thing.
        const cleaned = (data || []).map(s => ({ ...s, commonName: s.commonName.trim(), species: s.species.trim() }));
        // Sort by common name (what the picker actually displays as the
        // bold/primary line) -- the backend orders by genus instead,
        // which isn't the alphabetical order a worker sees on screen.
        const sorted = cleaned.sort((a, b) => a.commonName.localeCompare(b.commonName));
        setAllSpecies(sorted);
      })
      .catch(() => {})
      .finally(() => setSpeciesLoading(false));
  }, []);

  // ── Create batch — instant, date-named, no species, straight to stages ──
  const handleQuickCreateBatch = async () => {
    if (isCreating) return;
    setIsCreating(true);
    const session = await getWorkerSession();
    const created = await createProductionBatch(formatBatchDate(new Date()), 'Unspecified', null, 0, session?.id, workerLabel(session));
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
    setSpeciesPickerTarget(null); // always start on the log form, never the picker
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
    const session = await getWorkerSession();
    const label = workerLabel(session);
    setIsLoggingStage(true);
    for (const row of filledRows) {
      await addStageLog(selectedBatch.id, logStage.id, logStage.name, `${row.quantity} × ${row.speciesDisplay}`, label, note || null);
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
    setSpeciesPickerTarget(null); // never leave the picker armed for the next open
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

  // Maps a stage_log status to display label + color tokens.
  // null/undefined status means a legacy row that was backfilled to approved.
  const getEntryStatusMeta = (status) => {
    switch (status) {
      case 'pending_approval':
        return { label: 'PENDING',  color: B.warning, bg: B.warningBg };
      case 'rejected':
        return { label: 'REJECTED', color: B.error,   bg: B.errorBg };
      case 'approved':
      default:
        return { label: 'APPROVED', color: B.success,  bg: B.successBg };
    }
  };

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
            <Text style={{ fontSize: 11, color: B.accent, fontWeight: '700', letterSpacing: 2.5 }}>[ PRODUCTION BATCHES ]</Text>
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
              <TouchableOpacity
                key={batch.id}
                style={[styles.batchCard, { borderLeftWidth: 3, borderLeftColor: batch.status === 'completed' ? B.success : B.accent }]}
                onPress={() => setSelectedBatch(batch)}
                activeOpacity={0.75}
              >
                <View style={styles.batchCardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.batchCardName}>{displayBatchName(batch.batch_name)}</Text>
                    {batch.created_at && (
                      <View style={styles.batchCardMetaRow}>
                        <Clock size={12} color={B.textMuted} />
                        <Text style={styles.batchCardMeta}>
                          Created {new Date(batch.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    )}
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
        <Animated.View style={[styles.fab, { bottom: insets.bottom + 16, transform: [{ scale: fabScale }] }]}>
          <TouchableOpacity
            style={styles.fabTouch}
            onPress={handleQuickCreateBatch}
            onPressIn={fabPressIn}
            onPressOut={fabPressOut}
            activeOpacity={0.9}
            disabled={isCreating}
          >
            {isCreating ? <ActivityIndicator color={B.bg} size="small" /> : <Plus size={26} color={B.bg} />}
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // Species picker body -- rendered INSIDE whichever modal (Add Log or
  // Edit Entries) opened it, rather than as its own separate Modal. Two
  // native Modal windows toggling visible at the same render (one tearing
  // down as the other mounts) caused a visible flash on transition;
  // swapping content within a single already-open Modal has none.
  const renderSpeciesPickerBody = () => (
    <>
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
      <ScrollView style={{ maxHeight: 165 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {(() => {
          const q = speciesPickerSearch.trim().toLowerCase();
          // The fixed-height ScrollView (maxHeight 165) shows ~3 rows at a
          // time and scrolls through the rest, so the keyboard never has to
          // fight a long list for space. Cap kept generous to avoid rendering
          // the entire catalog at once -- narrow with search for the rest.
          const filtered = allSpecies.filter(s =>
            !q || s.species.toLowerCase().includes(q) || s.commonName.toLowerCase().includes(q)
          ).slice(0, 50);

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
              <Text style={{ padding: 16, color: B.textMuted, fontSize: 14 }}>
                {speciesLoading ? 'Loading species…' : 'No species available.'}
              </Text>
            );
          }

          // No exact/substring match -- offer the closest catalog entry
          // instead of just showing an empty list.
          const closest = findClosestSpecies(speciesPickerSearch, allSpecies);
          return (
            <View style={{ padding: 16, gap: 10 }}>
              <Text style={{ color: B.textMuted, fontSize: 14 }}>
                No matches for "{speciesPickerSearch.trim()}".
              </Text>
              {closest && (
                <TouchableOpacity onPress={() => selectSpeciesForPicker(closest)} activeOpacity={0.7}>
                  <Text style={{ fontSize: 15, color: B.textMuted }}>
                    Did you mean <Text style={styles.didYouMeanLink}>{closest.commonName} ({closest.species})</Text>?
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: B.border, alignItems: 'center' }}>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 0, width: '50%' }]} onPress={() => { Keyboard.dismiss(); setSpeciesPickerTarget(null); }}>
          <Text style={styles.btnSecondaryText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </>
  );

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
          <Text style={styles.detailTitle} numberOfLines={1}>{displayBatchName(selectedBatch.batch_name)}</Text>
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
          const isExpanded   = expandedStageId === stage.id;

          // Manager-only stage (Final Quality Control): shown so the pipeline
          // still reads as 12 stages, but grayed out and inert -- only the
          // manager can act on it (on the web dashboard), not workers.
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
                      <Text style={styles.disabledStageNote}>Manager-only · controlled on the dashboard</Text>
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

              {/* Stage card — accordion: collapsed shows just the header;
                  tap to expand the logs + action buttons, so all 12 stages
                  aren't showing redundant buttons at once. */}
              <View style={[styles.stageCard, hasActivity && styles.stageCardDone]}>
                <TouchableOpacity
                  style={styles.stageCardHeader}
                  activeOpacity={0.6}
                  onPress={() => setExpandedStageId(isExpanded ? null : stage.id)}
                >
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
                  {/* expand/collapse chevron */}
                  <ChevronDown
                    size={18}
                    color={B.textMuted}
                    style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                  />
                </TouchableOpacity>

                {isExpanded && (<>
                {/* Existing logs for this stage */}
                {logs.length > 0 && (
                  <View style={styles.logsContainer}>
                    {logs.map(log => {
                      const statusMeta = getEntryStatusMeta(log.status);
                      const isRejected = log.status === 'rejected';
                      return (
                        <View key={log.id} style={[styles.logEntry, isRejected && { borderLeftColor: B.error }]}>
                          <View style={styles.entryStatusRow}>
                            <Text style={styles.logText}>{log.log_text}</Text>
                            <View style={[styles.entryStatusPill, { backgroundColor: statusMeta.bg, borderColor: statusMeta.color }]}>
                              <Text style={[styles.entryStatusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                            </View>
                          </View>
                          {!!log.note && <Text style={styles.logNoteText}>"{log.note}"</Text>}
                          {isRejected && !!log.reject_reason && (
                            <Text style={styles.rejectReasonText}>Reason: {log.reject_reason} — Edit to resubmit.</Text>
                          )}
                          {isRejected && !log.reject_reason && (
                            <Text style={styles.rejectReasonText}>Edit to resubmit.</Text>
                          )}
                          <Text style={styles.logTime}>{new Date(log.logged_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Action buttons — EDIT only renders once the stage has at
                    least one logged entry. When entries exist, EDIT stays
                    available even on a completed batch so a mistake (wrong
                    count, wrong species) can still be fixed. */}
                <View style={styles.stageActions}>
                  {!isCompleted && isScan && (
                    <TouchableOpacity style={styles.btnScanFull} onPress={() => handleLaunchScanner(stage)}>
                      <ScanLine size={14} color={B.bg} />
                      <Text style={styles.btnScanText}>LAUNCH SCANNER</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.btnSecondaryRow}>
                    {!isCompleted && (
                      <TouchableOpacity style={[styles.btnLog, logs.length === 0 && styles.btnLogAlone]} onPress={() => openLogModal(stage)}>
                        <ClipboardList size={13} color={B.accent} />
                        <Text style={styles.btnLogText} numberOfLines={1}>ADD LOG</Text>
                      </TouchableOpacity>
                    )}
                    {logs.length > 0 && (
                      <TouchableOpacity style={styles.btnEdit} onPress={() => openEditModal(stage)}>
                        <Text style={styles.btnEditText} numberOfLines={1}>EDIT</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                </>)}
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
        ) : loggedStageNames.length === 0 ? (
          // Can't complete a batch that has had no work at all -- nothing
          // logged and nothing scanned. Show why, instead of an active button.
          <View style={[styles.btnMarkComplete, styles.btnMarkCompleteDisabled]}>
            <CheckCircle2 size={16} color={B.textMuted} />
            <Text style={[styles.btnMarkCompleteText, { color: B.textMuted }]}>LOG A STAGE TO COMPLETE</Text>
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
      <Modal visible={showLogModal} transparent animationType="none">
        <Animated.View style={{ flex: 1, opacity: logModalFade }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => {
            Keyboard.dismiss();
            // If the species picker is open, an outside tap should step back
            // to the log form -- not tear down the whole modal while leaving
            // speciesPickerTarget set (which made the next ADD LOG reopen
            // straight into the picker).
            if (speciesPickerTarget?.mode === 'row') setSpeciesPickerTarget(null);
            else setShowLogModal(false);
          }}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            {speciesPickerTarget?.mode === 'row' ? renderSpeciesPickerBody() : (
            <>
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
                <View key={row.key} style={styles.logRowCard}>
                  {/* Species choice on top */}
                  <TouchableOpacity
                    style={[styles.speciesPickerBtn, styles.speciesPickerBtnTop, row.species && styles.speciesPickerBtnFilled]}
                    onPress={() => openSpeciesPickerForRow(row.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.speciesPickerBtnText, row.species && styles.speciesPickerBtnTextFilled]} numberOfLines={1}>
                      {row.speciesDisplay || 'Choose species…'}
                    </Text>
                    <ChevronDown size={16} color={row.species ? B.accent : B.textMuted} />
                  </TouchableOpacity>

                  {/* Quantity counter, centered in the middle */}
                  <View style={styles.stepperGroupBig}>
                    <TouchableOpacity style={styles.stepperBtnBig} onPress={() => adjustLogRowQty(row.key, -1)} activeOpacity={0.7}>
                      <Text style={styles.stepperBtnTextBig}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.stepperInputBig}
                      value={String(row.quantity)}
                      onChangeText={(t) => setLogRowQtyDirect(row.key, t)}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity style={styles.stepperBtnBig} onPress={() => adjustLogRowQty(row.key, 1)} activeOpacity={0.7}>
                      <Text style={styles.stepperBtnTextBig}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {logRows.length > 1 && (
                    <TouchableOpacity style={styles.logRowRemoveLink} onPress={() => removeLogRow(row.key)} activeOpacity={0.7}>
                      <Text style={styles.logRowRemoveLinkText}>✕ REMOVE</Text>
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
                placeholder="Anything else to note..."
                placeholderTextColor={B.textMuted}
                value={logNote}
                onChangeText={setLogNote}
                multiline
                textAlignVertical="top"
                maxLength={NOTE_MAX}
              />
              <Text style={styles.noteCounter}>{logNote.length}/{NOTE_MAX}</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => { Keyboard.dismiss(); setShowLogModal(false); }}>
                  <Text style={styles.btnSecondaryText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmitLog} disabled={isLoggingStage}>
                  {isLoggingStage ? <ActivityIndicator color={B.bg} size="small" /> : <Text style={styles.btnPrimaryText}>SAVE LOG</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
            </>
            )}
          </View>
        </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* Edit/remove entries for a stage. The species picker (when editing a
          structured entry) renders INSIDE this same Modal/Animated.View
          rather than as a separate Modal -- two native Modal windows
          toggling visible at the same instant (one tearing down as the
          other mounts) caused a visible flash/flicker on transition. */}
      <Modal visible={editStage !== null} transparent animationType="none">
        <Animated.View style={{ flex: 1, opacity: editModalFade }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => {
            // Mirror the log modal: when the species picker is open, an outside
            // tap returns to the edit form instead of closing the whole modal.
            if (speciesPickerTarget?.mode === 'editing') { Keyboard.dismiss(); setSpeciesPickerTarget(null); }
            else closeEditModal();
          }}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            {speciesPickerTarget?.mode === 'editing' ? renderSpeciesPickerBody() : (
            <>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>[ EDIT STAGE {editStage?.id}: {editStage?.name?.toUpperCase()} ]</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={closeEditModal} activeOpacity={0.7}>
                <X size={18} color={B.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {editStage && logsForStage(editStage.id).length === 0 ? (
                <Text style={{ color: B.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
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
                      <View style={styles.entryStatusRow}>
                        <Text style={[styles.logText, { flex: 1 }]}>{entry.log_text}</Text>
                        {(() => {
                          const sm = getEntryStatusMeta(entry.status);
                          return (
                            <View style={[styles.entryStatusPill, { backgroundColor: sm.bg, borderColor: sm.color }]}>
                              <Text style={[styles.entryStatusText, { color: sm.color }]}>{sm.label}</Text>
                            </View>
                          );
                        })()}
                      </View>
                      {!!entry.note && <Text style={styles.logNoteText}>"{entry.note}"</Text>}
                      {entry.status === 'rejected' && !!entry.reject_reason && (
                        <Text style={styles.rejectReasonText}>Reason: {entry.reject_reason}</Text>
                      )}
                      <Text style={styles.logTime}>
                        {new Date(entry.logged_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                        <TouchableOpacity onPress={() => startEditEntry(entry)} activeOpacity={0.7}>
                          <Text style={styles.editLink}>{entry.status === 'rejected' ? 'EDIT & RESUBMIT' : 'EDIT'}</Text>
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
            </>
            )}
          </View>
        </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* Scan log modal */}
      <Modal visible={scanLogModal !== null} transparent animationType="none">
        <Animated.View style={[styles.modalOverlay, { opacity: scanLogModalFade }]}>
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
                  <Text style={{ color: B.textMuted, fontSize: 15, textAlign: 'center', fontWeight: '500' }}>
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
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },

  // Batch list
  listContent:    { padding: 16, paddingBottom: 100 },
  pageSubtitle:   { fontSize: 14, color: B.textMuted, marginBottom: 20, marginTop: 4 },

  emptyState:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle:     { fontSize: 17, fontWeight: '700', color: B.textPri, letterSpacing: 1 },
  emptyBody:      { fontSize: 15, color: B.textMuted, textAlign: 'center', maxWidth: 260 },

  batchCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    padding: 14,
    marginBottom: 10,
  },
  batchCardRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  batchCardName:  { fontSize: 16, fontWeight: '700', color: B.textPri },
  batchCardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  batchCardMeta:  { fontSize: 13, color: B.textMuted, fontWeight: '500' },

  statusBadge:    { borderRadius: 0, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeActive:    { backgroundColor: 'rgba(143,164,184,0.12)', borderColor: B.accent },
  badgeDone:      { backgroundColor: B.successBg, borderColor: B.success },
  statusBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
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
  fabTouch: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },

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
  detailTitle:    { fontSize: 16, fontWeight: '800', color: B.textPri, letterSpacing: 1, textTransform: 'uppercase' },
  detailSubtitle: { fontSize: 14, color: B.textMuted, fontStyle: 'italic', marginTop: 2 },
  completedBadge: {
    backgroundColor: B.successBg,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  completedBadgeText: { fontSize: 11, fontWeight: '700', color: B.success, letterSpacing: 1.5, textTransform: 'uppercase' },
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
  stageDotNum:    { fontSize: 13, fontWeight: '800', color: B.bg },
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
  stageName:      { fontSize: 15, fontWeight: '700', color: B.textPri },
  stageNameDisabled: { color: B.textMuted },
  disabledStageNote: { fontSize: 12, color: B.textMuted, fontStyle: 'italic', marginTop: 2 },

  scanTag:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  scanTagText:    { fontSize: 11, color: B.accent, fontWeight: '700', letterSpacing: 1.5 },

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
  logText:  { fontSize: 14, color: B.textPri, lineHeight: 18 },
  logNoteText: { fontSize: 13, color: B.textMuted, fontStyle: 'italic', marginTop: 2 },
  logTime:  { fontSize: 12, color: B.textMuted, marginTop: 4 },

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
    fontSize: 12,
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
    justifyContent: 'center',
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
  scanLogSpecies: { fontSize: 15, fontWeight: '700', color: B.textPri, flex: 1, fontStyle: 'italic' },
  scanLogTime:    { fontSize: 12, color: B.textMuted, fontWeight: '500', flexShrink: 0 },
  scanLogMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  scanLogBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  scanLogBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  scanLogTotal:     { fontSize: 13, color: B.textMuted, fontWeight: '500' },
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
    fontSize: 13,
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
  btnLogText: { fontSize: 13, fontWeight: '800', color: B.accent, letterSpacing: 1.5, flexShrink: 1, textAlign: 'center' },
  // When ADD LOG is the only action (stage has no entries yet, so no EDIT),
  // it shouldn't stretch edge-to-edge -- size to content and center it.
  btnLogAlone: { flex: 0, paddingHorizontal: 36 },
  btnScan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 0,
    backgroundColor: B.accent,
  },
  btnScanText: { fontSize: 13, fontWeight: '800', color: B.bg, letterSpacing: 2 },
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
  btnEditText: { fontSize: 13, fontWeight: '800', color: B.textMuted, letterSpacing: 1.5, flexShrink: 1, textAlign: 'center' },

  completedBanner: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, gap: 8 },
  completedBannerText: { fontSize: 16, fontWeight: '800', color: B.success, letterSpacing: 2, textTransform: 'uppercase' },
  completedBannerSub:  { fontSize: 15, color: B.textMuted, textAlign: 'center' },
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
  btnMarkCompleteDisabled: { backgroundColor: B.bgEl, borderWidth: 1, borderColor: B.border },
  btnMarkCompleteText: { fontSize: 14, fontWeight: '800', color: B.bg, letterSpacing: 2, textTransform: 'uppercase' },

  // Edit/remove stage log entries
  editEntryRow: {
    borderWidth: 1,
    borderColor: B.border,
    backgroundColor: B.bg,
    padding: 10,
  },
  editLink:   { fontSize: 13, fontWeight: '800', color: B.accent, letterSpacing: 1 },
  deleteLink: { fontSize: 13, fontWeight: '800', color: B.error, letterSpacing: 1 },

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
  modalTitle:    { fontSize: 14, fontWeight: '800', color: B.textPri, letterSpacing: 2, textTransform: 'uppercase' },
  modalSubtitle: { fontSize: 14, color: B.textMuted, marginTop: 4 },
  inputLabel:    { fontSize: 11, color: B.accentDim, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase' },

  input: {
    backgroundColor: B.bg,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
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
  stepperBtnText: { fontSize: 20, fontWeight: '700', color: B.accent },
  stepperInput: {
    width: 44,
    height: 38,
    textAlign: 'center',
    fontSize: 16,
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
  speciesPickerBtnText: { flex: 1, fontSize: 15, fontWeight: '500', color: B.textMuted },
  speciesPickerBtnTextFilled: { color: B.textPri, fontWeight: '700' },

  // ── New stacked log-row layout: species on top, big centered counter ──
  logRowCard: {
    borderWidth: 1,
    borderColor: B.border,
    backgroundColor: B.bgEl,
    padding: 14,
    gap: 14,
    alignItems: 'center',
  },
  speciesPickerBtnTop: {
    flex: 0,
    width: '100%',
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperGroupBig: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: B.border,
    alignSelf: 'center',
  },
  stepperBtnBig: {
    width: 56,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: B.bg,
  },
  stepperBtnTextBig: { fontSize: 30, fontWeight: '700', color: B.accent },
  stepperInputBig: {
    width: 72,
    height: 52,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: B.textPri,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: B.border,
  },
  logRowRemoveLink: { paddingVertical: 2 },
  logRowRemoveLinkText: { fontSize: 13, fontWeight: '800', color: B.error, letterSpacing: 1.5 },
  noteCounter: { fontSize: 12, color: B.textMuted, textAlign: 'right', marginTop: -6 },
  addRowLink: {
    fontSize: 13,
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
  // paddingLeft compensates for letterSpacing -- it adds a trailing gap
  // after the last character but nothing before the first, which shifts
  // the visible text left of true-center inside a centered button.
  btnSecondaryText: { fontSize: 15, fontWeight: '800', color: B.accent, letterSpacing: 3, paddingLeft: 3, textTransform: 'uppercase' },
  btnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 0,
    backgroundColor: B.accent,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: B.bg, letterSpacing: 3, paddingLeft: 3, textTransform: 'uppercase' },

  // Species picker list (log-entry species picker)
  suggestionItem:       { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: B.border },
  suggestionCommon:     { fontSize: 15, fontWeight: '700', color: B.textPri },
  suggestionScientific: { fontSize: 13, color: B.textMuted, fontStyle: 'italic', marginTop: 1 },
  didYouMeanLink:       { color: B.accent, fontWeight: '700' },

  // Manager-approval status badges — per log entry in stage card and edit modal
  entryStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  entryStatusPill: {
    borderRadius: 0,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  entryStatusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  rejectReasonText: {
    fontSize: 12,
    color: B.error,
    fontStyle: 'italic',
    marginTop: 3,
  },
});
