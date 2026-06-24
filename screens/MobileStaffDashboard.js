import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  StatusBar,
  Keyboard,
  Animated,
  ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import { loginWorker, savePushToken, claimWorkerSession } from '../src/services/supabaseService';
import { setWorkerSession, getWorkerSession } from '../src/services/workerSession';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
// ── Palette ──────────────────────────────────────────────────────────────────
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

// ── Validators ───────────────────────────────────────────────────────────────
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

export default function MobileStaffDashboard({ navigation }) {
  const insets   = useSafeAreaInsets();
  const sheetY   = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);

  // ── Keyboard slide ──
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = e => {
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      Animated.timing(sheetY, {
        toValue: -e.endCoordinates.height,
        duration: e.duration ?? 250,
        useNativeDriver: true,
      }).start();
    };
    const onHide = e => {
      const duration = e.duration ?? 250;
      hideTimer.current = setTimeout(() => {
        hideTimer.current = null;
        Animated.timing(sheetY, { toValue: 0, duration, useNativeDriver: true }).start();
      }, 80);
    };
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove(); hideSub.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin]               = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [errors, setErrors]         = useState({ employeeId: null, pin: null, general: null });
  const [empFocused, setEmpFocused] = useState(false);
  const [pinFocused, setPinFocused] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil,   setLockedUntil]   = useState(null);

  useEffect(() => {
    getWorkerSession().then(s => {
      SplashScreen.hideAsync();
      if (s?.id) navigation.replace('MainTabs');
    });
  }, []);

  const validate = () => {
    const empErr = validateEmployeeId(employeeId);
    const pinErr = validatePin(pin);
    setErrors({ employeeId: empErr, pin: pinErr, general: null });
    return !empErr && !pinErr;
  };

  const handleLogin = async () => {
    if (lockedUntil && Date.now() < lockedUntil) {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      setErrors(prev => ({ ...prev, general: `Too many attempts. Try again in ${remaining}s.` }));
      return;
    }
    if (!validate()) return;
    setIsLoading(true);
    try {
      const session = await loginWorker(employeeId.trim(), pin.trim());
      if (session) {
        setLoginAttempts(0);
        setLockedUntil(null);
        // Claims this device as the active session for this worker --
        // any other device already logged in as them will get logged out
        // next time its periodic check runs (see MainAppNavigator).
        session.sessionToken = await claimWorkerSession(session.id);
        await setWorkerSession(session);
        Notifications.getExpoPushTokenAsync()
          .then(t => { if (t?.data) savePushToken(session.id, t.data); })
          .catch(() => {});
        navigation.replace('MainTabs');
      } else {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        if (newAttempts >= 5) {
          const until = Date.now() + 30_000;
          setLockedUntil(until);
          setLoginAttempts(0);
          setErrors(prev => ({ ...prev, general: 'Too many failed attempts. Locked for 30 seconds.' }));
        } else {
          setErrors(prev => ({ ...prev, general: `Invalid credentials. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? 's' : ''} remaining.` }));
        }
      }
    } catch {
      setErrors(prev => ({ ...prev, general: 'Could not connect. Check your internet and try again.' }));
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = field => setErrors(prev => ({ ...prev, [field]: null, general: null }));

  return (
    <ImageBackground
      source={require('../assets/login-bg.png')}
      style={[styles.bg, { paddingTop: insets.top }]}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── Top spacer — pushes panel down, no text ── */}
      <View style={styles.topBlock} />

      {/* ── Panel ── */}
      <Animated.View style={[styles.panelWrap, { transform: [{ translateY: sheetY }] }]}>
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 28) }]}>

          {/* Panel header rule */}
          <View style={styles.panelHeader}>
            <Text style={styles.panelLabel}>{'> LOG IN'}</Text>
            <View style={styles.headerLine} />
          </View>

          {/* General error */}
          {errors.general ? (
            <View style={styles.generalError}>
              <AlertCircle size={13} color={C.error} style={{ marginRight: 6 }} />
              <Text style={styles.generalErrorText}>{errors.general}</Text>
            </View>
          ) : null}

          {/* Username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>[ USERNAME ]</Text>
            <View style={[
              styles.inputRow,
              empFocused && styles.inputFocused,
              errors.employeeId && styles.inputError,
            ]}>
              <TextInput
                style={styles.input}
                placeholder="Enter username"
                placeholderTextColor={C.mutedText}
                value={employeeId}
                onChangeText={v => { setEmployeeId(v); clearError('employeeId'); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={() => setEmpFocused(true)}
                onBlur={() => setEmpFocused(false)}
              />
            </View>
            {errors.employeeId ? <Text style={styles.fieldError}>{'! ' + errors.employeeId}</Text> : null}
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>[ PASSWORD ]</Text>
            <View style={[
              styles.inputRow,
              pinFocused && styles.inputFocused,
              errors.pin && styles.inputError,
            ]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter password"
                placeholderTextColor={C.mutedText}
                value={pin}
                onChangeText={v => { setPin(v); clearError('pin'); }}
                secureTextEntry={!pinVisible}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                onFocus={() => setPinFocused(true)}
                onBlur={() => setPinFocused(false)}
              />
              <TouchableOpacity onPress={() => setPinVisible(v => !v)} style={{ padding: 6 }} activeOpacity={0.7}>
                {pinVisible
                  ? <EyeOff size={15} color={C.accentDim} />
                  : <Eye    size={15} color={C.accentDim} />
                }
              </TouchableOpacity>
            </View>
            {errors.pin ? <Text style={styles.fieldError}>{'! ' + errors.pin}</Text> : null}
          </View>

          {/* Forgot */}
          <TouchableOpacity style={styles.forgotRow} activeOpacity={0.7}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Sign In */}
          <TouchableOpacity
            style={[styles.loginBtn, isLoading && { opacity: 0.5 }]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator color='#FFFFFF' />
              : <Text style={styles.loginBtnText}>LOG IN</Text>
            }
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.footerDivider} />

          {/* Footer links */}
          <TouchableOpacity
            onPress={() => WebBrowser.openBrowserAsync(
              'https://app.termly.io/policy-viewer/policy.html?policyUUID=1c0a8365-0ccf-4ffc-8f40-ee580a479fb3'
            )}
            activeOpacity={0.6}
            style={styles.privacyRow}
          >
            <Text style={styles.privacyText}>Privacy Policy</Text>
          </TouchableOpacity>

        </View>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Top spacer ──
  topBlock: {
    flex: 1,
  },

  // ── Panel ──
  panelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  panel: {
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.panelBorder,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 28,
    paddingTop: 20,
  },

  // Panel header
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  panelLabel: {
    fontSize: 10,
    color: C.accent,
    letterSpacing: 2,
    fontWeight: '700',
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.panelBorder,
  },

  // ── Errors ──
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
    fontSize: 12,
    fontWeight: '500',
  },
  fieldError: {
    color: C.error,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 0.5,
  },

  // ── Inputs ──
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 10,
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
  inputFocused: {
    borderColor: C.accent,
  },
  inputError: {
    borderColor: C.error,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },

  // ── Forgot ──
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 22,
    marginTop: 2,
  },
  forgotText: {
    fontSize: 11,
    color: C.accentDim,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Button ──
  loginBtn: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
  },

  // ── Footer ──
  footerDivider: {
    height: 1,
    backgroundColor: C.panelBorder,
    marginTop: 20,
    marginBottom: 14,
  },
  privacyRow: {
    alignItems: 'center',
    marginBottom: 6,
  },
  privacyText: {
    fontSize: 10,
    color: C.mutedText,
    letterSpacing: 1,
    textDecorationLine: 'underline',
  },
  footer: {
    textAlign: 'center',
    fontSize: 10,
    color: C.muted,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 4,
  },
});
