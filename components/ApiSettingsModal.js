import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Wifi, WifiOff, CheckCircle, AlertCircle, Server } from 'lucide-react-native';
import { getApiUrl, setApiUrl, checkHealth } from '../src/services/yoloApiService';

const NAVY = '#2B3441';
const SKY  = '#B8D4E8';

export default function ApiSettingsModal({ visible, onClose }) {
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null); // null | 'connected' | 'no_model' | 'offline'

  // Load the current URL when the modal opens
  useEffect(() => {
    if (visible) {
      (async () => {
        const current = await getApiUrl();
        setUrl(current);
        setSavedUrl(current);
        setStatus(null);
      })();
    }
  }, [visible]);

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);

    // Save the URL first so the health check uses it
    const normalized = await setApiUrl(url);
    setUrl(normalized);
    setSavedUrl(normalized);

    const result = await checkHealth();
    if (result.reachable && result.modelLoaded) {
      setStatus('connected');
    } else if (result.reachable && !result.modelLoaded) {
      setStatus('no_model');
    } else {
      setStatus('offline');
    }
    setTesting(false);
  };

  const handleSave = async () => {
    const normalized = await setApiUrl(url);
    setUrl(normalized);
    setSavedUrl(normalized);
    onClose();
  };

  const hasChanges = url !== savedUrl;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Server size={16} color={SKY} />
              <Text style={styles.headerTitle}>AI Server Settings</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Description */}
          <Text style={styles.description}>
            Enter the URL of your YOLO Flask API server. Both your phone and PC must be on the same WiFi network.
          </Text>

          {/* URL Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>API Server URL</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={url}
                onChangeText={setUrl}
                placeholder="http://192.168.1.9:5000"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          </View>

          {/* Status indicator */}
          {status && (
            <View style={[
              styles.statusBar,
              status === 'connected' && styles.statusBarSuccess,
              status === 'no_model' && styles.statusBarWarning,
              status === 'offline' && styles.statusBarError,
            ]}>
              {status === 'connected' && (
                <>
                  <CheckCircle size={14} color="#10b981" />
                  <Text style={[styles.statusText, { color: '#10b981' }]}>
                    Connected — Model loaded and ready
                  </Text>
                </>
              )}
              {status === 'no_model' && (
                <>
                  <AlertCircle size={14} color="#f59e0b" />
                  <Text style={[styles.statusText, { color: '#f59e0b' }]}>
                    Server reachable, but model not loaded
                  </Text>
                </>
              )}
              {status === 'offline' && (
                <>
                  <WifiOff size={14} color="#ef4444" />
                  <Text style={[styles.statusText, { color: '#ef4444' }]}>
                    Cannot reach server — check IP and port
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.testButton, testing && styles.buttonDisabled]}
              onPress={handleTest}
              disabled={testing || !url}
              activeOpacity={0.7}
            >
              {testing ? (
                <ActivityIndicator size="small" color={SKY} />
              ) : (
                <Wifi size={14} color={SKY} style={{ marginRight: 6 }} />
              )}
              <Text style={styles.testButtonText}>
                {testing ? 'Testing…' : 'Test Connection'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, !hasChanges && styles.saveButtonDone]}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Text style={styles.saveButtonText}>
                {hasChanges ? 'Save & Close' : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Help text */}
          <View style={styles.helpSection}>
            <Text style={styles.helpTitle}>How to find your PC's IP:</Text>
            <Text style={styles.helpText}>
              Windows: ipconfig | findstr "IPv4"{'\n'}
              Mac/Linux: ifconfig | grep "inet "
            </Text>
            <Text style={[styles.helpText, { marginTop: 6 }]}>
              Then start the API server:{'\n'}
              python api.py
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
  },
  description: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  statusBarSuccess: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  statusBarWarning: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  statusBarError: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  testButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(184,212,232,0.3)',
  },
  testButtonText: {
    color: SKY,
    fontWeight: '700',
    fontSize: 13,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
  },
  saveButtonDone: {
    backgroundColor: '#334155',
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  helpSection: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  helpTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  helpText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
