import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckCircle, AlertTriangle, Trash2, AlertCircle, ChevronLeft, Send } from 'lucide-react-native';
import { COLORS, SHADOW_SM } from '../theme';

const STATUS_CONFIG = {
  pass:      { label: 'PASS',      bg: '#d1fae5', text: '#065f46', Icon: CheckCircle  },
  flagged:   { label: 'FLAGGED',   bg: '#fee2e2', text: '#991b1b', Icon: AlertTriangle },
  discarded: { label: 'DISCARDED', bg: '#f1f5f9', text: '#64748b', Icon: Trash2        },
  escalated: { label: 'ESCALATED', bg: '#fff7ed', text: '#c2410c', Icon: AlertCircle   },
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

  const fmtTime = iso =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
      const finalized = {
        ...batch,
        status:      'pending_approval',
        submittedAt: new Date().toISOString(),
      };

      const raw = await AsyncStorage.getItem('recent_batches').catch(() => null);
      const existing = raw ? JSON.parse(raw) : [];
      const updated  = [finalized, ...existing].slice(0, 10);

      await Promise.all([
        AsyncStorage.setItem('recent_batches', JSON.stringify(updated)),
        AsyncStorage.removeItem('active_batch'),
      ]);

      // Navigate back to the Workflow tab with a clean state
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
          <ChevronLeft size={20} color={COLORS.textDark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Batch Summary</Text>
          <Text style={styles.headerSub}>Review before submitting to manager</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Species Info */}
        <View style={styles.speciesCard}>
          <Text style={styles.speciesLabel}>SPECIES</Text>
          <Text style={styles.speciesName}>{batch.species}</Text>
          {batch.commonName ? (
            <Text style={styles.speciesCommon}>{batch.commonName}</Text>
          ) : null}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderColor: '#86efac' }]}>
            <Text style={[styles.statNum, { color: '#065f46' }]}>{stats.pass}</Text>
            <Text style={[styles.statLabel, { color: '#065f46' }]}>PASS</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#fca5a5' }]}>
            <Text style={[styles.statNum, { color: '#991b1b' }]}>{stats.flagged}</Text>
            <Text style={[styles.statLabel, { color: '#991b1b' }]}>FLAGGED</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#fdba74' }]}>
            <Text style={[styles.statNum, { color: '#c2410c' }]}>{stats.escalated}</Text>
            <Text style={[styles.statLabel, { color: '#c2410c' }]}>ESCALATED</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#cbd5e1' }]}>
            <Text style={[styles.statNum, { color: '#64748b' }]}>{stats.discarded}</Text>
            <Text style={[styles.statLabel, { color: '#64748b' }]}>DISCARDED</Text>
          </View>
        </View>

        {/* Manager note */}
        <View style={styles.managerNote}>
          <AlertCircle size={14} color="#6d28d9" style={{ marginTop: 1 }} />
          <Text style={styles.managerNoteText}>
            A manager will review all specimens before this batch is committed to the database.
            Escalated items will also be resolved by the manager.
          </Text>
        </View>

        {/* Specimen Breakdown */}
        <Text style={styles.sectionLabel}>ALL SPECIMENS · {stats.total}</Text>

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
                    <Text style={[styles.specimenNote, { color: '#c2410c' }]}>
                      Pending manager decision
                    </Text>
                  )}
                </View>

                <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
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
          <Send size={16} color="#fff" />
          <Text style={styles.submitBtnText}>
            {submitting ? 'Submitting…' : 'Submit for Manager Approval'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textDark },
  headerSub:   { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },

  scrollContent: { padding: 16 },

  // ── Species Card ──
  speciesCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  speciesLabel:  { fontSize: 10, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  speciesName:   { fontSize: 22, fontWeight: '800', color: COLORS.textDark, fontStyle: 'italic', marginBottom: 4 },
  speciesCommon: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },

  // ── Stats Grid ──
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    ...SHADOW_SM,
  },
  statNum:   { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  statLabel: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },

  // ── Manager Note ──
  managerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#ede9fe',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  managerNoteText: { flex: 1, fontSize: 12, color: '#6d28d9', fontWeight: '500', lineHeight: 18 },

  // ── Section Label ──
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // ── Specimen Cards ──
  specimenCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  specimenRow:      { flexDirection: 'row', alignItems: 'center' },
  specimenIndex: {
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  specimenIndexText: { fontSize: 11, fontWeight: '700', color: COLORS.textMid },
  specimenInfo:      { flex: 1 },
  specimenSpecies:   { fontSize: 13, fontWeight: '700', color: COLORS.textDark, fontStyle: 'italic', marginBottom: 3 },
  specimenMeta:      { fontSize: 11, color: COLORS.textLight, fontWeight: '500' },
  specimenNote:      { fontSize: 10, color: '#64748b', marginTop: 3, fontWeight: '500' },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
    alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  // ── Footer Submit ──
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.cardBg,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    gap: 10,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
