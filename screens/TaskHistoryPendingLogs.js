import React, { useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
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


export default function TaskHistoryPendingLogs({ navigation }) {
  const [logs, setLogs] = useState(initialLogs);
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, PENDING, APPROVED, REJECTED
  const [expandedLogId, setExpandedLogId] = useState(null);

  const filteredLogs = useMemo(() => {
    if (activeTab === 'ALL') return logs;
    return logs.filter(log => log.status === activeTab.toLowerCase());
  }, [logs, activeTab]);

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedLogId === id) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(id);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <View style={[styles.statusPill, styles.statusPending]}>
            <Clock size={12} color="#b45309" style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, styles.textPending]}>Pending Manager Approval</Text>
          </View>
        );
      case 'approved':
        return (
          <View style={[styles.statusPill, styles.statusApproved]}>
            <CheckCircle size={12} color="#047857" style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, styles.textApproved]}>Approved</Text>
          </View>
        );
      case 'rejected':
        return (
          <View style={[styles.statusPill, styles.statusRejected]}>
            <XCircle size={12} color="#b91c1c" style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, styles.textRejected]}>Rejected</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Slate Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Task Logs & History</Text>
        </View>
        <FileSpreadsheet size={20} color="#cbd5e1" />
      </View>

      {/* 480px Max-Width Centered Wrapper */}
      <View style={styles.contentWrapper}>
        {/* Navigation Tabs */}
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

        {/* Scrollable Logs List */}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;

              return (
                <View key={log.id} style={styles.logCard}>
                  {/* Card Header Header (Top Right Status, Top Left Batch ID) */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.batchContainer}>
                      <Text style={styles.batchLabel}>Batch ID</Text>
                      <Text style={styles.batchIdText}>#{log.batchId}</Text>
                    </View>
                    {getStatusBadge(log.status)}
                  </View>

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Main Details (Stage & Quantity) */}
                  <TouchableOpacity 
                    style={styles.cardDetailsButton}
                    onPress={() => toggleExpand(log.id)}
                    activeOpacity={0.9}
                  >
                    <View style={styles.infoGrid}>
                      <View style={styles.infoItem}>
                        <View style={styles.iconLabelRow}>
                          <Layers size={13} color="#64748b" style={{ marginRight: 6 }} />
                          <Text style={styles.infoItemLabel}>Workflow Stage</Text>
                        </View>
                        <Text style={styles.infoItemVal}>{log.stage}</Text>
                      </View>
                    </View>

                    {/* Expand Indicator */}
                    <View style={styles.expandRow}>
                      <Calendar size={12} color="#94a3b8" style={{ marginRight: 4 }} />
                      <Text style={styles.timestampText}>{log.timestamp}</Text>
                      <View style={styles.flexSpacer} />
                      <Text style={styles.expandText}>{isExpanded ? 'Hide Details' : 'Show Details'}</Text>
                      {isExpanded ? (
                        <ChevronUp size={14} color="#3b82f6" />
                      ) : (
                        <ChevronDown size={14} color="#3b82f6" />
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Supervisor Notes */}
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
              <FileSpreadsheet size={36} color="#cbd5e1" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No Forms Found</Text>
              <Text style={styles.emptySubtitle}>There are no logs matching this status tab currently registered.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 480, // Layout wrapper max-width requirement
    alignSelf: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#f1f5f9',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#1e293b',
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  logCard: {
    backgroundColor: '#ffffff', // Clean white card requirement
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchContainer: {
    flexDirection: 'column',
  },
  batchLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  batchIdText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
  },
  statusApproved: {
    backgroundColor: '#ecfdf5',
    borderColor: '#d1fae5',
  },
  statusRejected: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textPending: {
    color: '#b45309',
  },
  textApproved: {
    color: '#047857',
  },
  textRejected: {
    color: '#b91c1c',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12,
  },
  cardDetailsButton: {
    width: '100%',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  infoItem: {
    flex: 1,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoItemLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
  },
  infoItemVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
    paddingTop: 10,
  },
  timestampText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  flexSpacer: {
    flex: 1,
  },
  expandText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
    marginRight: 4,
  },
  notesContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  notesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  operatorRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  operatorLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginRight: 4,
  },
  operatorValue: {
    fontSize: 11,
    color: '#0f172a',
    fontWeight: '600',
  },
  noteContentBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  noteText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
});
