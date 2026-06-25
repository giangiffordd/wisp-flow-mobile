import React, { useState, useEffect } from 'react';
import {
  Platform,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Layers, LogOut } from 'lucide-react-native';

import TaskHistoryPendingLogs  from '../screens/TaskHistoryPendingLogs';
import ProductionStagesScreen  from '../screens/ProductionStagesScreen';
import GlobalHeader            from '../components/GlobalHeader';
import { clearWorkerSession, getWorkerSession } from '../src/services/workerSession';
import { fetchStaffAlerts, isSessionActive }     from '../src/services/supabaseService';

const Tab = createBottomTabNavigator();
const UNREAD_POLL_MS = 30000;
const SESSION_POLL_MS = 30000;

export default function MainAppNavigator({ navigation }) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const insets = useSafeAreaInsets();

  // Poll for unread alerts so the bell badge stays current across all tabs,
  // not just whenever the alerts screen happens to be visited.
  useEffect(() => {
    let cancelled = false;
    const checkUnread = async () => {
      const alerts = await fetchStaffAlerts();
      if (!cancelled) setHasUnread(alerts.length > 0);
    };
    checkUnread();
    const interval = setInterval(checkUnread, UNREAD_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Single-session enforcement: if this worker logged in on another device,
  // this device's token stops being the active one -- log it out here.
  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      const session = await getWorkerSession();
      if (!session?.id || !session?.sessionToken) return;
      const active = await isSessionActive(session.id, session.sessionToken);
      if (!active && !cancelled) {
        await clearWorkerSession();
        Alert.alert(
          'Logged Out',
          'Your account was signed in on another device, so this session has been logged out.'
        );
        navigation.replace('Login');
      }
    };
    // Run immediately (not just on the interval) -- matches the unread-alerts
    // poll above. Without this, the first real check didn't happen until a
    // full SESSION_POLL_MS after mount.
    checkSession();
    const interval = setInterval(checkSession, SESSION_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleLogout = () => setShowLogoutModal(true);

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await clearWorkerSession();
    navigation.replace('Login');
  };

  const handleBell = () => navigation.navigate('StaffAlertsNotifications');

  const bottomPadding = Math.max(insets.bottom, 8);
  const tabBarHeight  = 56 + bottomPadding;

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route, navigation: nav }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            if (route.name === 'Stages')    return <Layers        size={size} color={color} />;
            if (route.name === 'History')   return <ClipboardList size={size} color={color} />;
          },
          tabBarActiveTintColor:   '#5B21D9',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
            paddingBottom: bottomPadding,
            paddingTop: 8,
            height: tabBarHeight,
            elevation: 4,
            shadowColor: '#111827',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          header: () => (
            <GlobalHeader
              title={route.name}
              onLogout={handleLogout}
              onBell={handleBell}
              onBrandPress={() => nav.navigate('Stages')}
              hasUnread={hasUnread}
            />
          ),
        })}
      >
        <Tab.Screen name="Stages"    component={ProductionStagesScreen} options={{ tabBarLabel: 'Stages' }} />
        <Tab.Screen name="History"   component={TaskHistoryPendingLogs} options={{ tabBarLabel: 'History' }} />
      </Tab.Navigator>

      {/* Logout confirmation — custom modal stays portrait, native Alert does not */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['portrait']}
      >
        <View style={m.overlay}>
          <View style={m.card}>
            <View style={m.iconRow}>
              <LogOut size={22} color="#EF4444" />
            </View>
            <Text style={m.title}>Log Out</Text>
            <Text style={m.body}>Are you sure you want to log out?</Text>
            <View style={m.actions}>
              <TouchableOpacity
                style={m.cancelBtn}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.75}
              >
                <Text style={m.cancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={m.confirmBtn}
                onPress={confirmLogout}
                activeOpacity={0.85}
              >
                <Text style={m.confirmText}>LOG OUT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const m = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    alignItems: 'center',
  },
  iconRow: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title:  { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  body:   { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  actions: { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelText:  { fontSize: 12, fontWeight: '800', color: '#6B7280', letterSpacing: 2 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#EF4444',
  },
  confirmText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2 },
});
