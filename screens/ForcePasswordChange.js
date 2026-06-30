import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react-native';
import { changeWorkerPassword } from '../src/services/supabaseService';

// ── Palette (matches MobileStaffDashboard.js) ─────────────────────────────────
const C = {
  bg:           '#F8F9FA',
  panel:        '#FFFFFF',
  panelBorder:  '#E5E7EB',
  accent:       '#5B21D9',
  accentDim:    '#7C3AED',
  accentText:   '#FFFFFF',
  muted:        '#E5E7EB',
  mutedText:    '#9CA3AF',
  error:        '#EF4444',
  errorBg:      'rgba(239,68,68,0.12)',
  white:        '#FFFFFF',
};

export default function ForcePasswordChange({ navigation, route }) {
  const { workerId, tempPin, name } = route.params || {};
  const insets = useSafeAreaInsets();

  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwVisible, setPwVisible]             = useState(false);
  const [isLoading, setIsLoading]             = useState(false);
  const [errors, setErrors]                   = useState({ newPassword: null, confirmPassword: null, general: null });

  // Block hardware back from returning to login/main while a password
  // change is still required -- this screen only ever exits via a
  // successful navigation.replace('MainTabs') below.
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (e.data.action.type === 'REPLACE') return; // allow our own replace
      e.preventDefault();
    });
    return sub;
  }, [navigation]);

  const clearError = field => setErrors(prev => ({ ...prev, [field]: null, general: null }));

  const validate = () => {
    let newPasswordErr = null;
    let confirmPasswordErr = null;
    if (!newPassword || newPassword.length < 6) {
      newPasswordErr = 'Password must be at least 6 characters.';
    }
    if (newPassword !== confirmPassword) {
      confirmPasswordErr = 'Passwords do not match.';
    }
    setErrors({ newPassword: newPasswordErr, confirmPassword: confirmPasswordErr, general: null });
    return !newPasswordErr && !confirmPasswordErr;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!workerId || !tempPin) {
      setErrors(prev => ({ ...prev, general: 'Missing session info. Please log in again.' }));
      return;
    }
    setIsLoading(true);
    try {
      const result = await changeWorkerPassword(workerId, tempPin, newPassword);
      if (result?.ok) {
        navigation.replace('MainTabs');
      } else {
        Alert.alert('Could not change password', result?.message || 'Please try again.');
      }
    } catch {
      Alert.alert('Could not connect', 'Check your internet and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.bg, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 28) }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconWrap}>
          <ShieldCheck size={32} color={C.accent} />
        </View>

        <Text style={styles.heading}>Create New Password</Text>
        <Text style={styles.subtitle}>
          {name ? `Hi ${name}, ` : ''}your temporary password must be changed before you can continue.
        </Text>

        <View style={styles.panel}>
          {errors.general ? (
            <View style={styles.generalError}>
              <AlertCircle size={13} color={C.error} style={{ marginRight: 6 }} />
              <Text style={styles.generalErrorText}>{errors.general}</Text>
            </View>
          ) : null}

          {/* New Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>[ NEW PASSWORD ]</Text>
            <View style={[styles.inputRow, errors.newPassword && styles.inputError]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="At least 6 characters"
                placeholderTextColor={C.mutedText}
                value={newPassword}
                onChangeText={v => { setNewPassword(v); clearError('newPassword'); }}
                secureTextEntry={!pwVisible}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <TouchableOpacity onPress={() => setPwVisible(v => !v)} style={{ padding: 6 }} activeOpacity={0.7}>
                {pwVisible
                  ? <EyeOff size={15} color={C.accentDim} />
                  : <Eye    size={15} color={C.accentDim} />
                }
              </TouchableOpacity>
            </View>
            {errors.newPassword ? <Text style={styles.fieldError}>{'! ' + errors.newPassword}</Text> : null}
          </View>

          {/* Confirm Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>[ CONFIRM PASSWORD ]</Text>
            <View style={[styles.inputRow, errors.confirmPassword && styles.inputError]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Re-enter new password"
                placeholderTextColor={C.mutedText}
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); clearError('confirmPassword'); }}
                secureTextEntry={!pwVisible}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
            {errors.confirmPassword ? <Text style={styles.fieldError}>{'! ' + errors.confirmPassword}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, isLoading && { opacity: 0.5 }]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator color={C.white} />
              : <Text style={styles.submitBtnText}>SET PASSWORD</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: C.mutedText,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 8,
  },

  panel: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.panelBorder,
    padding: 20,
  },

  generalError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.errorBg,
    borderWidth: 1,
    borderColor: C.error,
    padding: 10,
    marginBottom: 16,
  },
  generalErrorText: {
    flex: 1,
    color: C.error,
    fontSize: 14,
    fontWeight: '500',
  },
  fieldError: {
    color: C.error,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 0.5,
  },

  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accentDim,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.panelBorder,
    backgroundColor: C.bg,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    paddingHorizontal: 12,
  },
  inputError: {
    borderColor: C.error,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: '#111827',
    fontWeight: '500',
  },

  submitBtn: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4,
  },
});
