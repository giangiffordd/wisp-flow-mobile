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
import { Eye, EyeOff, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react-native';
import { changeWorkerPassword } from '../src/services/supabaseService';
import { getWorkerSession } from '../src/services/workerSession';

// ── Palette (matches ForcePasswordChange.js / MobileStaffDashboard.js) ────────
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

export default function ChangePassword({ navigation }) {
  const insets = useSafeAreaInsets();

  const [session, setSession]                  = useState(null);
  const [currentPassword, setCurrentPassword]  = useState('');
  const [newPassword, setNewPassword]           = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [pwVisible, setPwVisible]               = useState(false);
  const [isLoading, setIsLoading]               = useState(false);
  const [errors, setErrors]                     = useState({
    currentPassword: null,
    newPassword:     null,
    confirmPassword: null,
    general:         null,
  });

  useEffect(() => {
    getWorkerSession().then(s => {
      if (s?.id) {
        setSession(s);
      } else {
        setErrors(prev => ({ ...prev, general: 'No active session. Please log in again.' }));
      }
    });
  }, []);

  const clearError = field => setErrors(prev => ({ ...prev, [field]: null, general: null }));

  const validate = () => {
    let currentPasswordErr = null;
    let newPasswordErr     = null;
    let confirmPasswordErr = null;

    if (!currentPassword) {
      currentPasswordErr = 'Current password is required.';
    }
    if (!newPassword || newPassword.length < 6) {
      newPasswordErr = 'Password must be at least 6 characters.';
    } else if (newPassword === currentPassword) {
      newPasswordErr = 'New password must be different.';
    }
    if (newPassword !== confirmPassword) {
      confirmPasswordErr = 'Passwords do not match.';
    }

    setErrors({ currentPassword: currentPasswordErr, newPassword: newPasswordErr, confirmPassword: confirmPasswordErr, general: null });
    return !currentPasswordErr && !newPasswordErr && !confirmPasswordErr;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!session?.id) {
      setErrors(prev => ({ ...prev, general: 'No active session. Please log in again.' }));
      return;
    }
    setIsLoading(true);
    try {
      const result = await changeWorkerPassword(session.id, currentPassword, newPassword);
      if (result?.ok) {
        Alert.alert('Password changed', 'Your password has been updated.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Could not change password', result?.message || 'Please try again.');
        setErrors(prev => ({ ...prev, general: result?.message || 'Please try again.' }));
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

      {/* Back affordance */}
      <TouchableOpacity
        style={[styles.backBtn, { marginTop: 8 }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <ArrowLeft size={20} color={C.accentDim} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 28) }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconWrap}>
          <KeyRound size={32} color={C.accent} />
        </View>

        <Text style={styles.heading}>Change Password</Text>
        <Text style={styles.subtitle}>Update the password you use to sign in.</Text>

        <View style={styles.panel}>
          {errors.general ? (
            <View style={styles.generalError}>
              <AlertCircle size={13} color={C.error} style={{ marginRight: 6 }} />
              <Text style={styles.generalErrorText}>{errors.general}</Text>
            </View>
          ) : null}

          {/* Current Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>[ CURRENT PASSWORD ]</Text>
            <View style={[styles.inputRow, errors.currentPassword && styles.inputError]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Your current password"
                placeholderTextColor={C.mutedText}
                value={currentPassword}
                onChangeText={v => { setCurrentPassword(v); clearError('currentPassword'); }}
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
            {errors.currentPassword ? <Text style={styles.fieldError}>{'! ' + errors.currentPassword}</Text> : null}
          </View>

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
            style={[styles.submitBtn, (isLoading || !session) && { opacity: 0.5 }]}
            onPress={handleSubmit}
            disabled={isLoading || !session}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator color={C.white} />
              : <Text style={styles.submitBtnText}>UPDATE PASSWORD</Text>
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
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
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
