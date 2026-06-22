import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { CheckCircle, AlertTriangle, Trash2, AlertCircle, ChevronLeft, Send } from 'lucide-react-native';
import { fmtTime } from '../src/utils/format';
import { submitBatchToStorage } from '../src/hooks/useBatch';

const STATUS_CONFIG = {
  pass:      { label: 'PASS',      bg: 'rgba(16,185,129,0.12)',  border: '#10B981', text: '#10B981', Icon: CheckCircle  },
  flagged:   { label: 'FLAGGED',   bg: 'rgba(239,68,68,0.12)',   border: '#EF4444', text: '#EF4444', Icon: AlertTriangle },
  discarded: { label: 'DISCARDED', bg: 'rgba(143,164,184,0.12)', border: '#5B21D9', text: '#5B21D9', Icon: Trash2        },
  escalated: { label: 'ESCALATED', bg: 'rgba(245,158,11,0.12)',  border: '#F59E0B', text: '#F59E0B', Icon: AlertCircle   },
};

export default function BatchSummary({ navigation, route }) {
  const { batch } = route.params;
  const [submitting, setSubmitting] = useState(false);

  const specimens = batch.specimens || [];

  const stats = {
    total:     specimens.length,
    pass:      specimens.filter(s => s.status === 'pass').length,
    flagged:   specimens.filter(s => s.status === 'flagged').length,
    discarded: specimens.filter(s => s.status === 'discarded').length,
    escalated: specimens.filter(s => s.status === 'escalated').length,
  };

  const handleSubmit = () => {
    Alert.alert(
      'Submit Batch',
      'This batch will be sent to the manager for final review. No changes can be made after submission.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', style: 'default', onPress: confirmSubmit },
      ]
    );
  };

  const confirmSubmit = async () => {
    setSubmitting(true);
    try {
      await submitBatchToStorage(batch);
      navigation.navigate('MainTabs', { screen: 'Workflow' });
    } catch {
      Alert.alert('Error', 'Failed to submit batch. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ChevronLeft size={20} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Batch Summary</Text>
          <Text style={styles.headerSub}>Review before submitting to manager</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Species Info */}
        <View style={styles.speciesCard}>
          <Text style={styles.speciesLabel}>[ SPECIES ]</Text>
          <Text style={styles.speciesName}>{batch.species}</Text>
          {batch.commonName ? (
            <Text style={styles.speciesCommon}>{batch.commonName}</Text>
          ) : null}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderColor: '#10B981' }]}>
            <Text style={[styles.statNum, { color: '#10B981' }]}>{stats.pass}</Text>
            <Text style={[styles.statLabel, { color: '#10B981' }]}>PASS</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#EF4444' }]}>
            <Text style={[styles.statNum, { color: '#EF4444' }]}>{stats.flagged}</Text>
            <Text style={[styles.statLabel, { color: '#EF4444' }]}>FLAGGED</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#F59E0B' }]}>
            <Text style={[styles.statNum, { color: '#F59E0B' }]}>{stats.escalated}</Text>
            <Text style={[styles.statLabel, { color: '#F59E0B' }]}>ESCALATED</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#5B21D9' }]}>
            <Text style={[styles.statNum, { color: '#5B21D9' }]}>{stats.discarded}</Text>
            <Text style={[styles.statLabel, { color: '#5B21D9' }]}>DISCARDED</Text>
          </View>
        </View>

        {/* Manager note */}
        <View style={styles.managerNote}>
          <AlertCircle size={14} color="#5B21D9" style={{ marginTop: 1 }} />
          <Text style={styles.managerNoteText}>
            A manager will review all specimens before this batch is committed to the database.
            Escalated items will also be resolved by the manager.
          </Text>
        </View>

        {/* Specimen Breakdown */}
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionDividerText}>[ ALL SPECIMENS · {stats.total} ]</Text>
          <View style={styles.sectionDividerLine} />
        </View>

        {specimens.map((s, i) => {
          const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.flagged;
          const { Icon } = cfg;
          return (
            <View key={s.id} style={styles.specimenCard}>
              <View style={styles.specimenRow}>
                <View style={styles.specimenIndex}>
                  <Text style={styles.specimenIndexText}>{i + 1}</Text>
                </View>

                <View style={styles.specimenInfo}>
                  <Text style={styles.specimenSpecies} numberOfLines={1}>{s.species}</Text>
                  <Text style={styles.specimenMeta}>
                    {Math.round(s.confidence * 100)}% conf · {fmtTime(s.scanned_at)}
                    {s.rescan_count > 0 ? `  ·  ${s.rescan_count} rescan(s)` : ''}
                  </Text>
                  {s.status === 'discarded' && s.discard_reason && (
                    <Text style={styles.specimenNote}>Reason: {s.discard_reason}</Text>
                  )}
                  {s.status === 'escalated' && (
                    <Text style={[styles.specimenNote, { color: '#F59E0B' }]}>
                      Pending manager decision
                    </Text>
                  )}
                </View>

                <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                  <Icon size={10} color={cfg.text} />
                  <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Submit Button — fixed at bottom */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Send size={16} color="#FFFFFF" />
          <Text style={styles.submitBtnText}>
            {submitting ? 'SUBMITTING…' : 'SUBMIT FOR MANAGER APPROVAL'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  headerTitle: { fontSize: 14, fontWeight: '800', color: '#111827', letterSpacing: 2, textTransform: 'uppercase' },
  headerSub:   { fontSize: 11, color: '#6B7280', marginTop: 1 },

  scrollContent: { padding: 16 },

  // ── Species Card ──
  speciesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  speciesLabel:  { fontSize: 9, fontWeight: '700', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 8 },
  speciesName:   { fontSize: 22, fontWeight: '800', color: '#111827', fontStyle: 'italic', marginBottom: 4 },
  speciesCommon: { fontSize: 13, color: '#6B7280', fontWeight: '500' },

  // ── Stats Grid ──
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statNum:   { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  statLabel: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 3 },

  // ── Manager Note ──
  managerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(143,164,184,0.06)',
    borderRadius: 0,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#5B21D9',
  },
  managerNoteText: { flex: 1, fontSize: 12, color: '#5B21D9', fontWeight: '500', lineHeight: 18 },

  // ── Section Divider ──
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionDividerText: {
    fontSize: 9,
    color: '#5B21D9',
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },

  // ── Specimen Cards ──
  specimenCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  specimenRow:      { flexDirection: 'row', alignItems: 'center' },
  specimenIndex: {
    width: 26, height: 26,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  specimenIndexText: { fontSize: 11, fontWeight: '700', color: '#5B21D9' },
  specimenInfo:      { flex: 1 },
  specimenSpecies:   { fontSize: 13, fontWeight: '700', color: '#111827', fontStyle: 'italic', marginBottom: 3 },
  specimenMeta:      { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  specimenNote:      { fontSize: 10, color: '#6B7280', marginTop: 3, fontWeight: '500' },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 0,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
    alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },

  // ── Footer Submit ──
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5B21D9',
    borderRadius: 0,
    paddingVertical: 15,
    gap: 10,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#F5F5F7', fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },
});
