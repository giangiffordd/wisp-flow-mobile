import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { ShieldCheck, AlertTriangle, Send } from 'lucide-react-native';
import { COLORS, SHADOW_SM } from '../theme';

export default function QualityControlModule() {
  const [qcNotes, setQcNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!selectedStatus) {
      Alert.alert('Missing Status', 'Please select a QC status before submitting.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSelectedStatus(null);
      setQcNotes('');
      Alert.alert('Success', 'Quality control report submitted successfully.');
    }, 1000);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>

        {/* Inspection status card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Inspection Status</Text>
          <Text style={styles.cardSubtitle}>Batch #BT-9921</Text>

          <View style={styles.statusGrid}>
            <TouchableOpacity
              style={[
                styles.statusOption,
                styles.statusPass,
                selectedStatus === 'pass' && styles.statusPassSelected,
              ]}
              onPress={() => setSelectedStatus('pass')}
            >
              <ShieldCheck size={30} color={selectedStatus === 'pass' ? COLORS.white : COLORS.successGreen} />
              <Text style={[
                styles.statusText,
                { color: selectedStatus === 'pass' ? COLORS.white : COLORS.successGreen },
              ]}>PASS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusOption,
                styles.statusFail,
                selectedStatus === 'fail' && styles.statusFailSelected,
              ]}
              onPress={() => setSelectedStatus('fail')}
            >
              <AlertTriangle size={30} color={selectedStatus === 'fail' ? COLORS.white : COLORS.errorRed} />
              <Text style={[
                styles.statusText,
                { color: selectedStatus === 'fail' ? COLORS.white : COLORS.errorRed },
              ]}>FAIL</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* QC notes card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>QC Notes</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder="Enter any observations, defects, or general notes..."
            placeholderTextColor={COLORS.textLight}
            value={qcNotes}
            onChangeText={setQcNotes}
            textAlignVertical="top"
          />
        </View>

        {/* Submit button — ICPI blue primary */}
        <TouchableOpacity
          style={[styles.submitButton, (!selectedStatus || isSubmitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!selectedStatus || isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Text>
          {!isSubmitting && <Send size={16} color={COLORS.white} style={{ marginLeft: 8 }} />}
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  content: {
    padding: 14,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusOption: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  statusPass: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.successBorder,
  },
  statusPassSelected: {
    backgroundColor: COLORS.successGreen,
    borderColor: COLORS.successGreen,
  },
  statusFail: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.errorBorder,
  },
  statusFailSelected: {
    backgroundColor: COLORS.errorRed,
    borderColor: COLORS.errorRed,
  },
  statusText: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '700',
  },
  textArea: {
    backgroundColor: COLORS.pageBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    padding: 12,
    color: COLORS.textMid,
    fontSize: 14,
    minHeight: 110,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.textLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
