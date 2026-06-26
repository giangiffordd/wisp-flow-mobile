import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { getWorkerSession } from '../src/services/workerSession';
import { fetchWorkerScanBatches, getStageLogsForBatch } from '../src/services/supabaseService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  FileSpreadsheet,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Calendar,
  Layers
} from 'lucide-react-native';

// Group a batch's ISO date into a per-day folder, bucketed by LOCAL calendar
// day -- so a new folder begins at 12:00 AM. Returns a stable key (so a
// worker's expand/collapse choice sticks across reloads), an uppercase
// "MONTH DAY, YEAR" label, and a sort value (start-of-day ms, newest-first).
// Batches with no usable date fall into a single "UNDATED" folder.
function getDayFolder(iso) {
  if (!iso) return { key: 'undated', label: 'UNDATED', sortVal: -Infinity };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { key: 'undated', label: 'UNDATED', sortVal: -Infinity };

  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const label = startOfDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();

  return { key: String(startOfDay.getTime()), label, sortVal: startOfDay.getTime() };
}

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


export default function TaskHistoryPendingLogs({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const screenFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFocused) {
      screenFadeAnim.setValue(0);
      Animated.timing(screenFadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      screenFadeAnim.setValue(0);
    }
  }, [isFocused, screenFadeAnim]);

  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState(null);
  // Per-day folder open/closed overrides, keyed by day. A day not in here uses
  // the default rule (newest day open, the rest collapsed); a tap records an
  // explicit choice that then sticks even when switching status tabs.
  const [groupOverrides, setGroupOverrides] = useState({});
  // Manual stage-log entries (the ADD LOG notes from the Stages screen), fetched
  // lazily per production batch the first time one of its scans is expanded.
  const [stageLogsByBatch, setStageLogsByBatch] = useState({});

  useEffect(() => {
    async function loadScanHistory() {
      try {
        const session    = await getWorkerSession();
        const prefix     = session?.employee_id || 'default';
        const workerName = session?.name || null;
        const statusMap  = { pending_approval: 'pending', approved: 'approved', rejected: 'rejected' };

        // Primary: fetch live statuses from Supabase
        if (workerName) {
          const liveBatches = await fetchWorkerScanBatches(workerName);
          if (liveBatches.length > 0) {
            const mapped = liveBatches.map(b => {
              // The table's timestamp column name isn't guaranteed, so accept
              // any of the common creation fields; null falls into "UNDATED".
              const createdAt = b.created_at || b.inserted_at || b.submitted_at || b.created || b.scanned_at || null;
              return {
                id:        b.id,
                batchId:   b.id.slice(-6).toUpperCase(),
                stage:     b.stage_name || 'Quality Control',
                species:   b.species_display || b.species || 'Unknown',
                scanned:   b.total_scanned || 0,
                passCount: b.pass_count || 0,
                flaggedCount: b.flagged_count || 0,
                specimens: Array.isArray(b.specimens) ? b.specimens : [],
                productionBatchId: b.production_batch_id || null,
                createdAt,
                timestamp: createdAt
                  ? new Date(createdAt).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : '--',
                status:    statusMap[b.status] || 'pending',
                operator:  b.worker_name || 'Worker',
              };
            });
            // Server didn't order (no known timestamp column), so sort newest-first here.
            mapped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            setLogs(mapped);
            return;
          }
        }

        // Fallback: local AsyncStorage cache
        const raw = await AsyncStorage.getItem(`${prefix}_recent_batches`);
        if (!raw) return;
        const batches = JSON.parse(raw);
        const mapped = batches.map(b => {
          const passCount    = (b.specimens || []).filter(s => s.status === 'pass').length;
          const flaggedCount = (b.specimens || []).filter(s => s.status === 'flagged' || s.status === 'escalated').length;
          return {
            id:        b.id,
            batchId:   b.id.slice(-6).toUpperCase(),
            stage:     b.stageName || 'Quality Control',
            species:   b.species || 'Unknown',
            scanned:   b.specimens?.length || 0,
            passCount,
            flaggedCount,
            specimens: Array.isArray(b.specimens) ? b.specimens : [],
            productionBatchId: b.productionBatchId || b.production_batch_id || null,
            createdAt: b.submittedAt || null,
            timestamp: b.submittedAt ? new Date(b.submittedAt).toLocaleString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '--',
            status:    statusMap[b.status] || 'pending',
            operator:  b.workerName || 'Worker',
          };
        });
        mapped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        setLogs(mapped);
      } catch (err) {
        console.warn('loadScanHistory failed:', err);
      }
    }
    loadScanHistory();
  }, [isFocused]);

  const filteredLogs = useMemo(() => {
    if (activeTab === 'ALL') return logs;
    return logs.filter(log => log.status === activeTab.toLowerCase());
  }, [logs, activeTab]);

  // Fold the (already newest-first) list into per-day folders, newest day first,
  // tallying the day's pass/flag rollup so the header reads at a glance.
  const dayGroups = useMemo(() => {
    const byKey = new Map();
    for (const log of filteredLogs) {
      const folder = getDayFolder(log.createdAt);
      if (!byKey.has(folder.key)) byKey.set(folder.key, { ...folder, logs: [], passed: 0, flagged: 0 });
      const g = byKey.get(folder.key);
      g.logs.push(log);
      g.passed  += log.passCount || 0;
      g.flagged += log.flaggedCount || 0;
    }
    return Array.from(byKey.values()).sort((a, b) => b.sortVal - a.sortVal);
  }, [filteredLogs]);

  const newestGroupKey = dayGroups[0]?.key;
  const isGroupOpen = (key) => (key in groupOverrides ? groupOverrides[key] : key === newestGroupKey);
  const toggleGroup = (key) => {
    setGroupOverrides(prev => {
      const open = key in prev ? prev[key] : key === newestGroupKey;
      return { ...prev, [key]: !open };
    });
  };

  const toggleExpand = (log) => {
    const willOpen = expandedLogId !== log.id;
    setExpandedLogId(willOpen ? log.id : null);
    // Lazy-load the production batch's manual stage logs the first time we open
    // one of its scans -- avoids 50+ requests on mount when most stay collapsed.
    if (willOpen && log.productionBatchId && !(log.productionBatchId in stageLogsByBatch)) {
      getStageLogsForBatch(log.productionBatchId)
        .then(sl => setStageLogsByBatch(prev => ({ ...prev, [log.productionBatchId]: sl })))
        .catch(() => {});
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <View style={[styles.statusPill, { backgroundColor: B.warningBg, borderColor: B.warning }]}>
            <Clock size={11} color={B.warning} style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: B.warning }]}>PENDING</Text>
          </View>
        );
      case 'approved':
        return (
          <View style={[styles.statusPill, { backgroundColor: B.successBg, borderColor: B.success }]}>
            <CheckCircle size={11} color={B.success} style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: B.success }]}>APPROVED</Text>
          </View>
        );
      case 'rejected':
        return (
          <View style={[styles.statusPill, { backgroundColor: B.errorBg, borderColor: B.error }]}>
            <XCircle size={11} color={B.error} style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: B.error }]}>REJECTED</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Animated.View style={{ flex: 1, opacity: screenFadeAnim }}>
      <View style={styles.container}>

        {/* ── Header ── */}
        {route?.name !== 'History' && (
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <ArrowLeft size={20} color={B.textPri} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>TASK LOGS & HISTORY</Text>
            </View>
            <FileSpreadsheet size={19} color={B.accentDim} />
          </View>
        )}

        <View style={styles.contentWrapper}>
          {/* ── Tab bar ── */}
          <View style={styles.tabContainer}>
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.activeTab]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                  {tab.charAt(0) + tab.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {dayGroups.length > 0 ? (
              dayGroups.map((group) => {
                const open = isGroupOpen(group.key);
                return (
                  <View key={group.key} style={styles.dayGroup}>
                    {/* Day folder header — date + at-a-glance rollup for the day */}
                    <TouchableOpacity
                      style={[styles.dayHeader, open && styles.dayHeaderOpen]}
                      onPress={() => toggleGroup(group.key)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.dayHeaderTop}>
                        {open
                          ? <ChevronDown size={16} color={B.accent} style={{ marginRight: 8 }} />
                          : <ChevronRight size={16} color={B.textMuted} style={{ marginRight: 8 }} />}
                        <Calendar size={13} color={open ? B.accent : B.textMuted} style={{ marginRight: 6 }} />
                        <Text style={[styles.dayHeaderLabel, open && styles.dayHeaderLabelOpen]}>{group.label}</Text>
                      </View>
                      <View style={styles.dayRollupRow}>
                        <Text style={styles.dayRollupText}>{group.logs.length} {group.logs.length === 1 ? 'batch' : 'batches'}</Text>
                        <Text style={styles.dayRollupDot}>  ·  </Text>
                        <Text style={[styles.dayRollupText, { color: B.success }]}>{group.passed} passed</Text>
                        <Text style={styles.dayRollupDot}>  ·  </Text>
                        <Text style={[styles.dayRollupText, { color: group.flagged > 0 ? B.error : B.textMuted }]}>{group.flagged} flagged</Text>
                      </View>
                    </TouchableOpacity>

                    {open && group.logs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      const stageLogs  = log.productionBatchId ? stageLogsByBatch[log.productionBatchId] : null;
                      return (
                        <View key={log.id} style={styles.logCard}>
                          {/* Top row: batch ID + status badge */}
                          <View style={styles.cardTopRow}>
                            <View>
                              <Text style={styles.batchLabel}>[ BATCH ID ]</Text>
                              <Text style={styles.batchIdText}>#{log.batchId}</Text>
                            </View>
                            {getStatusBadge(log.status)}
                          </View>

                          <View style={styles.divider} />

                          {/* Species headline + one-look scan summary + expand toggle */}
                          <TouchableOpacity
                            style={styles.cardDetailsButton}
                            onPress={() => toggleExpand(log)}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.speciesName} numberOfLines={1}>{log.species}</Text>
                            <View style={styles.summaryRow}>
                              <Text style={styles.summaryStrong}>{log.scanned}</Text>
                              <Text style={styles.summaryMuted}> scanned</Text>
                              <Text style={styles.summaryDot}>  ·  </Text>
                              <Text style={[styles.summaryStrong, { color: B.success }]}>{log.passCount}</Text>
                              <Text style={styles.summaryMuted}> passed</Text>
                              <Text style={styles.summaryDot}>  ·  </Text>
                              <Text style={[styles.summaryStrong, { color: log.flaggedCount > 0 ? B.error : B.textMuted }]}>{log.flaggedCount}</Text>
                              <Text style={styles.summaryMuted}> flagged</Text>
                            </View>

                            <View style={styles.expandRow}>
                              <Clock size={11} color={B.textMuted} style={{ marginRight: 4 }} />
                              <Text style={styles.timestampText}>{log.timestamp}</Text>
                              <View style={styles.flexSpacer} />
                              <Text style={styles.expandText}>{isExpanded ? 'HIDE' : 'DETAILS'}</Text>
                              {isExpanded
                                ? <ChevronUp size={13} color={B.accent} />
                                : <ChevronDown size={13} color={B.accent} />}
                            </View>
                          </TouchableOpacity>

                          {/* Expanded: per-specimen result + any manual stage logs */}
                          {isExpanded && (
                            <View style={styles.notesContainer}>
                              <View style={styles.sectionHeaderRow}>
                                <Text style={styles.notesSectionTitle}>[ SPECIMENS ]</Text>
                                <View style={styles.sectionRule} />
                              </View>
                              {log.specimens.length > 0 ? (
                                log.specimens.map((s, i) => {
                                  const passed  = String(s.status || '').toLowerCase() === 'pass';
                                  const missing = Array.isArray(s.missing_parts) ? s.missing_parts : [];
                                  return (
                                    <View key={i} style={styles.specimenRow}>
                                      <View style={[styles.specimenDot, { backgroundColor: passed ? B.success : B.error }]} />
                                      <Text style={styles.specimenName} numberOfLines={1}>{s.species || 'Unknown'}</Text>
                                      <View style={styles.flexSpacer} />
                                      <Text style={[styles.specimenStatus, { color: passed ? B.success : B.error }]} numberOfLines={1}>
                                        {passed ? 'PASS' : `FLAG${missing.length > 0 ? ` · missing ${missing.join(', ')}` : ''}`}
                                      </Text>
                                    </View>
                                  );
                                })
                              ) : (
                                <Text style={styles.noteText}>{log.scanned} scanned · {log.passCount} passed · {log.flaggedCount} flagged.</Text>
                              )}

                              {stageLogs && stageLogs.length > 0 && (
                                <>
                                  <View style={[styles.sectionHeaderRow, { marginTop: 12 }]}>
                                    <Text style={styles.notesSectionTitle}>[ STAGE LOG ]</Text>
                                    <View style={styles.sectionRule} />
                                  </View>
                                  {stageLogs.map((e, i) => (
                                    <View key={e.id || i} style={styles.stageLogRow}>
                                      <Text style={styles.stageLogStage}>{e.stage_name || `Stage ${e.stage_number}`}</Text>
                                      <Text style={styles.stageLogText}>{e.log_text}</Text>
                                    </View>
                                  ))}
                                </>
                              )}

                              <View style={styles.auditFooter}>
                                <Text style={styles.auditFooterText}>
                                  By {log.operator}{log.timestamp !== '--' ? ` · ${log.timestamp}` : ''}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyContainer}>
                <FileSpreadsheet size={32} color={B.accentDim} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>NO FORMS FOUND</Text>
                <Text style={styles.emptySubtitle}>There are no logs matching this status tab currently registered.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: B.bg,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    backgroundColor: B.bgEl,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 0,
    padding: 8,
  },
  headerTitle: {
    color: B.textPri,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 16,
    textTransform: 'uppercase',
  },

  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  // ── Tabs ────────────────────────────────────────────────────
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: B.bgEl,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 0,
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
  },
  activeTab: {
    backgroundColor: B.accent,
    borderColor: B.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: B.textMuted,
  },
  activeTabText: {
    color: B.bg,
    fontWeight: '800',
  },

  scrollView: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },

  // ── Day folder ──────────────────────────────────────────────
  dayGroup: {
    marginBottom: 10,
  },
  dayHeader: {
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dayHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayHeaderOpen: {
    borderColor: B.accent,
    borderLeftWidth: 3,
  },
  dayHeaderLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: B.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dayHeaderLabelOpen: {
    color: B.textPri,
  },
  dayRollupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    marginLeft: 30,
  },
  dayRollupText: {
    fontSize: 12,
    fontWeight: '700',
    color: B.textMuted,
    letterSpacing: 0.3,
  },
  dayRollupDot: {
    fontSize: 12,
    color: B.border,
    fontWeight: '700',
  },

  // ── Species headline + scan summary ─────────────────────────
  speciesName: {
    fontSize: 18,
    fontWeight: '800',
    fontStyle: 'italic',
    color: B.textPri,
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  summaryStrong: {
    fontSize: 14,
    fontWeight: '800',
    color: B.textPri,
  },
  summaryMuted: {
    fontSize: 13,
    color: B.textMuted,
    fontWeight: '500',
  },
  summaryDot: {
    fontSize: 13,
    color: B.border,
    fontWeight: '700',
  },

  // ── Expanded: specimens + stage log ─────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: B.border,
  },
  specimenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  specimenDot: {
    width: 8,
    height: 8,
  },
  specimenName: {
    fontSize: 13,
    fontWeight: '700',
    fontStyle: 'italic',
    color: B.textPri,
    maxWidth: '50%',
  },
  specimenStatus: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    flexShrink: 1,
  },
  stageLogRow: {
    paddingVertical: 5,
  },
  stageLogStage: {
    fontSize: 10,
    fontWeight: '700',
    color: B.accentDim,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  stageLogText: {
    fontSize: 13,
    color: B.textPri,
    fontWeight: '500',
  },
  auditFooter: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: B.border,
  },
  auditFooterText: {
    fontSize: 12,
    color: B.textMuted,
    fontWeight: '600',
  },

  // ── Log Card ────────────────────────────────────────────────
  logCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: B.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: B.accentDim,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
  },
  batchIdText: {
    fontSize: 16,
    fontWeight: '800',
    color: B.textPri,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 0,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: B.border,
    marginVertical: 10,
  },
  cardDetailsButton: { width: '100%' },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  infoItem: { flex: 1 },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  infoItemLabel: {
    fontSize: 11,
    color: B.accentDim,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  infoItemVal: {
    fontSize: 15,
    fontWeight: '600',
    color: B.textPri,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: B.border,
    paddingTop: 8,
  },
  timestampText: {
    fontSize: 13,
    color: B.textMuted,
    fontWeight: '500',
  },
  flexSpacer: { flex: 1 },
  expandText: {
    fontSize: 11,
    fontWeight: '700',
    color: B.accent,
    marginRight: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // ── Notes panel ─────────────────────────────────────────────
  notesContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: B.border,
  },
  notesSectionTitle: {
    fontSize: 11,
    color: B.accent,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  operatorLabel: {
    fontSize: 11,
    color: B.accentDim,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  operatorValue: {
    fontSize: 13,
    color: B.textPri,
    fontWeight: '600',
  },
  noteContentBox: {
    backgroundColor: B.bg,
    padding: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
  },
  noteText: {
    fontSize: 14,
    color: B.textMuted,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  // ── Empty state ─────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: B.textPri,
    marginBottom: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  emptySubtitle: {
    fontSize: 14,
    color: B.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 17,
  },
});
