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
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react-native';
import { COLORS } from '../theme';

// ─── Storefront-Aligned Palette ───────────────────────────────
// Extracted from the wisp-flow storefront screenshot:
//   Header:   #1A2332  (deep navy)
//   Page bg:  #F8FAFC  (near-white)
//   Cards:    #FFFFFF
//   Accent:   #2563EB  (blue links / active)
//   Text:     #0F172A  (dark)  → #64748B (muted)
//   Borders:  #E2E8F0
const SF = {
  pageBg:      '#F8FAFC',
  cardBg:      '#FFFFFF',
  navy:        '#1A2332',
  navyAlt:     '#253347',
  textDark:    '#0F172A',
  textMid:     '#1E293B',
  textMuted:   '#64748B',
  textLight:   '#94A3B8',
  accent:      '#2563EB',
  accentLight: '#DBEAFE',
  border:      '#E2E8F0',
  borderMid:   '#CBD5E1',
  inputBg:     '#F1F5F9',
  white:       '#FFFFFF',
};

// ─── Validation ───────────────────────────────────────────────
function validateEmployeeId(id) {
  if (!id || id.trim().length === 0) return 'Username is required.';
  if (id.trim().length < 3) return 'Username must be at least 3 characters.';
  if (!/^[a-zA-Z0-9\-_]+$/.test(id.trim())) return 'Only letters, numbers, hyphens and underscores allowed.';
  return null;
}
function validatePin(pin) {
  if (!pin || pin.trim().length === 0) return 'Password is required.';
  return null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MobileStaffDashboard({ navigation }) {
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({ employeeId: null, pin: null, general: null });

  const [isEmployeeIdFocused, setIsEmployeeIdFocused] = useState(false);
  const [isPinFocused, setIsPinFocused] = useState(false);

  const validate = () => {
    const empErr = validateEmployeeId(employeeId);
    const pinErr = validatePin(pin);
    setErrors({ employeeId: empErr, pin: pinErr, general: null });
    return !empErr && !pinErr;
  };

  const handleLogin = () => {
    if (!validate()) return;
    setIsLoading(true);
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.kbAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.content}>

          {/* ── Butterfly watermark (subtle, behind brand section) ── */}
          <View style={styles.watermarkContainer} pointerEvents="none">
            <Image
              source={require('../assets/images/butterfly-watermark.png')}
              style={styles.watermarkImage}
              resizeMode="contain"
            />
          </View>

          {/* ── Logo / Branding ── */}
          <View style={styles.brandSection}>
            <Text style={styles.brandTitle}>wisp-flow</Text>
            <View style={styles.brandDivider} />
            <Text style={styles.brandTagline}>Factory Operations Portal</Text>
          </View>

          {/* ── Login Card ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Staff Login</Text>
            <Text style={styles.cardSubtitle}>Enter your credentials to access the system</Text>

            {/* General Error */}
            {errors.general ? (
              <View style={styles.generalError}>
                <AlertCircle size={15} color={COLORS.errorRed} style={{ marginRight: 6 }} />
                <Text style={styles.generalErrorText}>{errors.general}</Text>
              </View>
            ) : null}

            {/* Username */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={[
                styles.inputRow,
                errors.employeeId && styles.inputRowError,
                isEmployeeIdFocused && styles.inputRowFocused,
              ]}>
                <User 
                  size={16} 
                  color={errors.employeeId ? COLORS.errorRed : (isEmployeeIdFocused ? SF.accent : SF.textLight)} 
                  style={styles.inputIcon} 
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your username"
                  placeholderTextColor={SF.textLight}
                  value={employeeId}
                  onChangeText={(v) => { setEmployeeId(v); clearError('employeeId'); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onFocus={() => setIsEmployeeIdFocused(true)}
                  onBlur={() => setIsEmployeeIdFocused(false)}
                />
              </View>
              {errors.employeeId ? (
                <Text style={styles.fieldError}>{errors.employeeId}</Text>
              ) : null}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[
                styles.inputRow,
                errors.pin && styles.inputRowError,
                isPinFocused && styles.inputRowFocused,
              ]}>
                <Lock 
                  size={16} 
                  color={errors.pin ? COLORS.errorRed : (isPinFocused ? SF.accent : SF.textLight)} 
                  style={styles.inputIcon} 
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={SF.textLight}
                  value={pin}
                  onChangeText={(v) => { setPin(v); clearError('pin'); }}
                  secureTextEntry={!pinVisible}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  onFocus={() => setIsPinFocused(true)}
                  onBlur={() => setIsPinFocused(false)}
                />
                <TouchableOpacity
                  onPress={() => setPinVisible(v => !v)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  {pinVisible
                    ? <EyeOff size={16} color={isPinFocused ? SF.accent : SF.textLight} />
                    : <Eye size={16} color={isPinFocused ? SF.accent : SF.textLight} />
                  }
                </TouchableOpacity>
              </View>
              {errors.pin ? (
                <Text style={styles.fieldError}>{errors.pin}</Text>
              ) : null}
            </View>

            {/* Forgot password link */}
            <TouchableOpacity style={styles.forgotRow} activeOpacity={0.7}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Login Button — storefront dark navy */}
            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator color={SF.white} />
                : <Text style={styles.loginBtnText}>Login</Text>
              }
            </TouchableOpacity>

            <Text style={styles.hintText}>
              Default: <Text style={styles.hintCode}>admin</Text> / <Text style={styles.hintCode}>1234</Text>
            </Text>
          </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SF.pageBg, // Storefront near-white background
  },
  kbAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    position: 'relative', // anchor for the watermark
  },

  // ── Butterfly Watermark ──
  watermarkContainer: {
    position: 'absolute',
    top: '8%',
    right: -20,
    width: SCREEN_WIDTH * 0.55,
    height: SCREEN_WIDTH * 0.55,
    zIndex: 0,
    opacity: 0.06,
  },
  watermarkImage: {
    width: '100%',
    height: '100%',
  },

  // ── Branding ──
  brandSection: {
    alignItems: 'center',
    marginBottom: 32,
    zIndex: 1,
  },
  brandTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: SF.navy, // Storefront dark navy
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  brandDivider: {
    width: 40,
    height: 3,
    backgroundColor: SF.accent,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 8,
  },
  brandTagline: {
    fontSize: 12,
    color: SF.textMuted,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Card ──
  card: {
    backgroundColor: SF.cardBg,
    borderRadius: 20,
    padding: 28,
    zIndex: 1,
    shadowColor: SF.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: SF.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: SF.textDark,
    letterSpacing: 0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: SF.textMuted,
    marginBottom: 20,
    marginTop: 4,
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
    color: SF.textMid,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SF.inputBg,
    borderWidth: 1.5,
    borderColor: SF.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputRowError: {
    borderColor: COLORS.errorRed,
    backgroundColor: COLORS.errorBg,
  },
  inputRowFocused: {
    borderColor: SF.accent,
    backgroundColor: SF.accentLight,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: SF.textDark,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 6,
  },

  // ── Forgot Password ──
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 16,
    marginTop: -8,
  },
  forgotText: {
    fontSize: 12,
    color: SF.accent,
    fontWeight: '600',
  },

  // ── Button ──
  loginBtn: {
    backgroundColor: SF.navy, // Storefront header dark navy
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: SF.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: SF.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Hint ──
  hintText: {
    textAlign: 'center',
    color: SF.textLight,
    fontSize: 12,
    marginTop: 14,
  },
  hintCode: {
    color: SF.textDark,
    fontWeight: '700',
  },
});
