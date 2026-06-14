import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
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
import { COLORS, SHADOW_SM } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const initialLogs = [
  {
    id: '1',
    batchId: 'BT-9921',
    stage: 'Initial Quality Control',
    timestamp: 'May 24, 2026 • 08:00 AM',
    status: 'approved',
    operator: 'EMP-1033',
    notes: 'All specimens visually inspected. Wing integrity and coloration confirmed within acceptable range. No deformities detected.',
  },
  {
    id: '2',
    batchId: 'BT-9921',
    stage: 'Final Quality Control',
    timestamp: 'May 24, 2026 • 10:45 AM',
    status: 'pending',
    operator: 'EMP-1033',
    notes: 'Awaiting secondary verification by Shift Lead. Specimen count re-confirmed, label check in progress.',
  },
  {
    id: '3',
    batchId: 'BT-9921',
    stage: 'Packaging',
    timestamp: 'May 24, 2026 • --:--',
    status: 'pending',
    operator: '--',
    notes: 'Pending completion of Final QC before packaging stage can begin.',
  },
  {
    id: '4',
    batchId: 'BT-9918',
    stage: 'Initial Quality Control',
    timestamp: 'May 23, 2026 • 09:15 AM',
    status: 'approved',
    operator: 'EMP-1021',
    notes: 'Passed visual inspection. Specimen condition rated excellent. All batch tags verified.',
  },
  {
    id: '5',
    batchId: 'BT-9918',
    stage: 'Final Quality Control',
    timestamp: 'May 23, 2026 • 01:30 PM',
    status: 'approved',
    operator: 'EMP-1033',
    notes: 'Approved by Shift Manager J. Doe. Density margins conform fully to spec. Barcode verification passed.',
  },
  {
    id: '6',
    batchId: 'BT-9918',
    stage: 'Packaging',
    timestamp: 'May 23, 2026 • 03:00 PM',
    status: 'approved',
    operator: 'EMP-1044',
    notes: 'Packaged in climate-controlled containers. Labels applied and sealed. Batch ready for dispatch.',
  },
  {
    id: '7',
    batchId: 'BT-9914',
    stage: 'Initial Quality Control',
    timestamp: 'May 22, 2026 • 08:30 AM',
    status: 'rejected',
    operator: 'EMP-1021',
    notes: 'Multiple specimens exhibited wing damage on visual pass. Batch flagged for re-inspection. Not cleared for Final QC.',
  },
];

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

  const [logs, setLogs] = useState(initialLogs);
  const [activeTab, setActiveTab] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState(null);

  useEffect(() => {
    async function loadScanHistory() {
      try {
        const raw = await AsyncStorage.getItem('task_history');
        if (!raw) return;
        const scanEntries = JSON.parse(raw);
        setLogs(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const newEntries = scanEntries.filter(e => !existingIds.has(e.id));
          return newEntries.length > 0 ? [...newEntries, ...prev] : prev;
        });
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  // ── Status badge matching ICPI pill badges ─────────────────
  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <View style={[styles.statusPill, { backgroundColor: COLORS.warningBg, borderColor: COLORS.warningBorder }]}>
            <Clock size={11} color={COLORS.warningAmber} style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: '#92400E' }]}>Pending Approval</Text>
          </View>
        );
      case 'approved':
        return (
          <View style={[styles.statusPill, { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorder }]}>
            <CheckCircle size={11} color={COLORS.successGreen} style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: '#065F46' }]}>Approved</Text>
          </View>
        );
      case 'rejected':
        return (
          <View style={[styles.statusPill, { backgroundColor: COLORS.errorBg, borderColor: COLORS.errorBorder }]}>
            <XCircle size={11} color={COLORS.errorRed} style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: '#991B1B' }]}>Rejected</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Animated.View style={{ flex: 1, opacity: screenFadeAnim }}>
      <View style={styles.container}>

        {/* ── Dark Navy Header ── */}
        {route?.name !== 'History' && (
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <ArrowLeft size={20} color={COLORS.textOnDark} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Task Logs & History</Text>
            </View>
            <FileSpreadsheet size={19} color={COLORS.textLight} />
          </View>
        )}

        <View style={styles.contentWrapper}>
          {/* ── Tab bar — ICPI-style segments ── */}
          <View style={styles.tabContainer}>
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.activeTab]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setActiveTab(tab);
                }}
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
                        <Text style={styles.batchLabel}>Batch ID</Text>
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
                            <Layers size={12} color={COLORS.textMuted} style={{ marginRight: 5 }} />
                            <Text style={styles.infoItemLabel}>Workflow Stage</Text>
                          </View>
                          <Text style={styles.infoItemVal}>{log.stage}</Text>
                        </View>
                      </View>

                      <View style={styles.expandRow}>
                        <Calendar size={11} color={COLORS.textLight} style={{ marginRight: 4 }} />
                        <Text style={styles.timestampText}>{log.timestamp}</Text>
                        <View style={styles.flexSpacer} />
                        <Text style={styles.expandText}>{isExpanded ? 'Hide Details' : 'Show Details'}</Text>
                        {isExpanded
                          ? <ChevronUp size={13} color={COLORS.primary} />
                          : <ChevronDown size={13} color={COLORS.primary} />}
                      </View>
                    </TouchableOpacity>

                    {/* Expanded notes panel */}
                    {isExpanded && (
                      <View style={styles.notesContainer}>
                        <Text style={styles.notesTitle}>Audit Trail Notes</Text>
                        <View style={styles.operatorRow}>
                          <Text style={styles.operatorLabel}>Submitted By:</Text>
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
                <FileSpreadsheet size={32} color={COLORS.borderMid} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>No Forms Found</Text>
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
    backgroundColor: COLORS.pageBg,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.headerBg,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.headerBorder,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 7,
  },
  headerTitle: {
    color: COLORS.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },

  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  // ── Tabs — ICPI segment bar ────────────────────────────────
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 7,
  },
  activeTab: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  activeTabText: {
    color: COLORS.white,
    fontWeight: '700',
  },

  scrollView: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },

  // ── Log Card ──────────────────────────────────────────────
  logCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  batchIdText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.pageBg,
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
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  infoItemVal: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMid,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.pageBg,
    paddingTop: 8,
  },
  timestampText: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  flexSpacer: { flex: 1 },
  expandText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: 3,
  },

  // ── Notes panel ──────────────────────────────────────────────
  notesContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.pageBg,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMid,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  operatorRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  operatorLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginRight: 4,
  },
  operatorValue: {
    fontSize: 11,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  noteContentBox: {
    backgroundColor: COLORS.pageBg,
    padding: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  // ── Empty state ──────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 17,
  },
});
