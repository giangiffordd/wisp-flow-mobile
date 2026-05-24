import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { ShieldCheck, AlertTriangle, Send } from 'lucide-react-native';

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
    // Simulate submission
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
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Inspection Status</Text>
          <Text style={styles.cardSubtitle}>Batch #BT-9921</Text>

          <View style={styles.statusGrid}>
            <TouchableOpacity 
              style={[
                styles.statusOption, 
                styles.statusPass,
                selectedStatus === 'pass' && styles.statusPassSelected
              ]}
              onPress={() => setSelectedStatus('pass')}
            >
              <ShieldCheck size={32} color={selectedStatus === 'pass' ? '#ffffff' : '#10b981'} />
              <Text style={[
                styles.statusText, 
                styles.statusPassText,
                selectedStatus === 'pass' && styles.statusTextSelected
              ]}>PASS</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.statusOption, 
                styles.statusFail,
                selectedStatus === 'fail' && styles.statusFailSelected
              ]}
              onPress={() => setSelectedStatus('fail')}
            >
              <AlertTriangle size={32} color={selectedStatus === 'fail' ? '#ffffff' : '#ef4444'} />
              <Text style={[
                styles.statusText, 
                styles.statusFailText,
                selectedStatus === 'fail' && styles.statusTextSelected
              ]}>FAIL</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>QC Notes</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder="Enter any observations, defects, or general notes..."
            placeholderTextColor="#94a3b8"
            value={qcNotes}
            onChangeText={setQcNotes}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity 
          style={[styles.submitButton, (!selectedStatus || isSubmitting) && styles.submitButtonDisabled]} 
          onPress={handleSubmit}
          disabled={!selectedStatus || isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Text>
          {!isSubmitting && <Send size={18} color="#ffffff" style={{ marginLeft: 8 }} />}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  statusOption: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
  },
  statusPass: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  statusPassSelected: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  statusFail: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusFailSelected: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  statusText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  statusPassText: {
    color: '#10b981',
  },
  statusFailText: {
    color: '#ef4444',
  },
  statusTextSelected: {
    color: '#ffffff',
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    color: '#334155',
    fontSize: 15,
    minHeight: 120,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
