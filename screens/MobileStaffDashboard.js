import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react-native';

// ─────────────────────────────────────────────
//  Color Palette (matches WispFlow butterfly logo)
// ─────────────────────────────────────────────
const COLORS = {
  skyBg: '#B8D4E8',       // light sky blue
  navy: '#2B3441',        // dark navy (butterfly body / text)
  navyMid: '#3D4F63',     // mid navy
  navyLight: '#6B7C93',   // secondary text
  white: '#FFFFFF',
  cardBg: '#FFFFFFCC',    // slightly translucent white
  inputBg: '#EEF5FB',     // very light blue for inputs
  inputBorder: '#C2D9EA',
  inputBorderActive: '#2B3441',
  errorRed: '#D94F4F',
  errorBg: 'rgba(217,79,79,0.08)',
  errorBorder: 'rgba(217,79,79,0.3)',
};

// ─────────────────────────────────────────────
//  Validation helpers
// ─────────────────────────────────────────────
function validateEmployeeId(id) {
  if (!id || id.trim().length === 0) return 'Employee ID is required.';
  if (id.trim().length < 3) return 'Employee ID must be at least 3 characters.';
  if (!/^[a-zA-Z0-9\-_]+$/.test(id.trim())) return 'Only letters, numbers, hyphens and underscores allowed.';
  return null;
}

function validatePin(pin) {
  if (!pin || pin.trim().length === 0) return 'Access PIN is required.';
  if (!/^\d{4}$/.test(pin.trim())) return 'PIN must be exactly 4 digits.';
  return null;
}

export default function MobileStaffDashboard({ navigation }) {
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({ employeeId: null, pin: null, general: null });

  // ── Validate all fields; returns true if valid ──
  const validate = () => {
    const empErr = validateEmployeeId(employeeId);
    const pinErr = validatePin(pin);
    setErrors({ employeeId: empErr, pin: pinErr, general: null });
    return !empErr && !pinErr;
  };

  const handleLogin = () => {
    if (!validate()) return;
    setIsLoading(true);

    // Simulate network request
    setTimeout(() => {
      setIsLoading(false);
      if (employeeId.trim() === 'admin' && pin.trim() === '1234') {
        navigation.replace('MainTabs');
      } else {
        setErrors(prev => ({
          ...prev,
          general: 'Invalid credentials. Please check your Employee ID and PIN.',
        }));
      }
    }, 1000);
  };

  const clearError = (field) =>
    setErrors(prev => ({ ...prev, [field]: null, general: null }));

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kbAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>

          {/* ── Logo / Branding ── */}
          <View style={styles.brandSection}>
            {/* Decorative butterfly-inspired circles */}
            <View style={styles.decorCircleLeft} />
            <View style={styles.decorCircleRight} />

             <Text style={styles.brandTitle}>wisp-flow</Text>
            <Text style={styles.brandTagline}>Factory Operations Portal</Text>
          </View>

          {/* ── Login Card ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Staff Login</Text>

            {/* General Error */}
            {errors.general ? (
              <View style={styles.generalError}>
                <AlertCircle size={15} color={COLORS.errorRed} style={{ marginRight: 6 }} />
                <Text style={styles.generalErrorText}>{errors.general}</Text>
              </View>
            ) : null}

            {/* Employee ID */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Employee ID</Text>
              <View style={[
                styles.inputRow,
                errors.employeeId && styles.inputRowError,
              ]}>
                <User size={16} color={errors.employeeId ? COLORS.errorRed : COLORS.navyLight} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. EMP-1234 or admin"
                  placeholderTextColor={COLORS.navyLight}
                  value={employeeId}
                  onChangeText={(v) => { setEmployeeId(v); clearError('employeeId'); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
              {errors.employeeId ? (
                <Text style={styles.fieldError}>{errors.employeeId}</Text>
              ) : null}
            </View>

            {/* Access PIN */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Access PIN</Text>
              <View style={[
                styles.inputRow,
                errors.pin && styles.inputRowError,
              ]}>
                <Lock size={16} color={errors.pin ? COLORS.errorRed : COLORS.navyLight} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="4-digit PIN"
                  placeholderTextColor={COLORS.navyLight}
                  value={pin}
                  onChangeText={(v) => { setPin(v); clearError('pin'); }}
                  secureTextEntry={!pinVisible}
                  keyboardType="number-pad"
                  maxLength={4}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setPinVisible(v => !v)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  {pinVisible
                    ? <EyeOff size={16} color={COLORS.navyLight} />
                    : <Eye size={16} color={COLORS.navyLight} />
                  }
                </TouchableOpacity>
              </View>
              {errors.pin ? (
                <Text style={styles.fieldError}>{errors.pin}</Text>
              ) : null}
            </View>

            {/* Authenticate Button */}
            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.loginBtnText}>Authenticate</Text>
              }
            </TouchableOpacity>

            <Text style={styles.hintText}>
              Default: <Text style={styles.hintCode}>admin</Text> / <Text style={styles.hintCode}>1234</Text>
            </Text>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.skyBg,
  },
  kbAvoid: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },

  // ── Branding ──
  brandSection: {
    alignItems: 'center',
    marginBottom: 36,
    position: 'relative',
  },
  decorCircleLeft: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(43,52,65,0.06)',
    left: -8,
    top: 10,
  },
  decorCircleRight: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(43,52,65,0.05)',
    right: 0,
    top: 0,
  },
  brandTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  brandTagline: {
    fontSize: 12,
    color: COLORS.navyMid,
    marginTop: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Card ──
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 28,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(43,52,65,0.08)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 20,
    letterSpacing: 0.3,
  },

  // ── Errors ──
  generalError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  generalErrorText: {
    flex: 1,
    color: COLORS.errorRed,
    fontSize: 13,
    fontWeight: '500',
  },
  fieldError: {
    color: COLORS.errorRed,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 5,
    marginLeft: 4,
  },

  // ── Input Fields ──
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: COLORS.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputRowError: {
    borderColor: COLORS.errorRed,
    backgroundColor: COLORS.errorBg,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.navy,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 6,
  },

  // ── Button ──
  loginBtn: {
    backgroundColor: COLORS.navy,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Hint ──
  hintText: {
    textAlign: 'center',
    color: COLORS.navyLight,
    fontSize: 12,
    marginTop: 14,
  },
  hintCode: {
    color: COLORS.navy,
    fontWeight: '700',
  },
});
