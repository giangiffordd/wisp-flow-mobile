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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  FileSpreadsheet,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Layers
} from 'lucide-react-native';

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

  useEffect(() => {
    async function loadScanHistory() {
      try {
        const session = await getWorkerSession();
        const prefix  = session?.employee_id || 'default';
        const raw = await AsyncStorage.getItem(`${prefix}_recent_batches`);
        if (!raw) return;
        const batches = JSON.parse(raw);
        const statusMap = { pending_approval: 'pending', approved: 'approved', rejected: 'rejected' };
        const mapped = batches.map(b => {
          const passCount    = (b.specimens || []).filter(s => s.status === 'pass').length;
          const flaggedCount = (b.specimens || []).filter(s => s.status === 'flagged' || s.status === 'escalated').length;
          return {
            id:        b.id,
            batchId:   b.id.slice(-6).toUpperCase(),
            stage:     b.stageName || 'Quality Control',
            timestamp: b.submittedAt ? new Date(b.submittedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--',
            status:    statusMap[b.status] || 'pending',
            operator:  b.workerName || 'Worker',
            notes:     `${b.species || 'Unknown'} — ${b.specimens?.length || 0} scanned, ${passCount} passed, ${flaggedCount} flagged.`,
          };
        });
        setLogs(mapped);
      } catch (err) {
        console.warn('AsyncStorage read failed:', err);
      }
    }
    loadScanHistory();
  }, [isFocused]);

  const filteredLogs = useMemo(() => {
    if (activeTab === 'ALL') return logs;
    return logs.filter(log => log.status === activeTab.toLowerCase());
  }, [logs, activeTab]);

  const toggleExpand = (id) => {
    setExpandedLogId(prev => (prev === id ? null : id));
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
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
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

                    {/* Stage details + expand toggle */}
                    <TouchableOpacity
                      style={styles.cardDetailsButton}
                      onPress={() => toggleExpand(log.id)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.infoGrid}>
                        <View style={styles.infoItem}>
                          <View style={styles.iconLabelRow}>
                            <Layers size={12} color={B.accentDim} style={{ marginRight: 5 }} />
                            <Text style={styles.infoItemLabel}>[ WORKFLOW STAGE ]</Text>
                          </View>
                          <Text style={styles.infoItemVal}>{log.stage}</Text>
                        </View>
                      </View>

                      <View style={styles.expandRow}>
                        <Calendar size={11} color={B.textMuted} style={{ marginRight: 4 }} />
                        <Text style={styles.timestampText}>{log.timestamp}</Text>
                        <View style={styles.flexSpacer} />
                        <Text style={styles.expandText}>{isExpanded ? 'HIDE' : 'DETAILS'}</Text>
                        {isExpanded
                          ? <ChevronUp size={13} color={B.accent} />
                          : <ChevronDown size={13} color={B.accent} />}
                      </View>
                    </TouchableOpacity>

                    {/* Expanded notes panel */}
                    {isExpanded && (
                      <View style={styles.notesContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                          <Text style={styles.notesSectionTitle}>[ AUDIT TRAIL ]</Text>
                          <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
                        </View>
                        <View style={styles.operatorRow}>
                          <Text style={styles.operatorLabel}>[ SUBMITTED BY ]</Text>
                          <Text style={styles.operatorValue}>{log.operator}</Text>
                        </View>
                        <View style={styles.noteContentBox}>
                          <Text style={styles.noteText}>{log.notes}</Text>
                        </View>
                      </View>
                    )}
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
    fontSize: 14,
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
    fontSize: 11,
    fontWeight: '600',
    color: B.textMuted,
  },
  activeTabText: {
    color: B.bg,
    fontWeight: '800',
  },

  scrollView: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },

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
    fontSize: 9,
    fontWeight: '700',
    color: B.accentDim,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
  },
  batchIdText: {
    fontSize: 14,
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
    fontSize: 10,
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
    fontSize: 9,
    color: B.accentDim,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  infoItemVal: {
    fontSize: 13,
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
    fontSize: 11,
    color: B.textMuted,
    fontWeight: '500',
  },
  flexSpacer: { flex: 1 },
  expandText: {
    fontSize: 9,
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
    fontSize: 9,
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
    fontSize: 9,
    color: B.accentDim,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  operatorValue: {
    fontSize: 11,
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
    fontSize: 12,
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
    fontSize: 13,
    fontWeight: '800',
    color: B.textPri,
    marginBottom: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  emptySubtitle: {
    fontSize: 12,
    color: B.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 17,
  },
});
