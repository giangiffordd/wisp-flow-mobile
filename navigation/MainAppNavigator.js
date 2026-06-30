import React, { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Layers, Users } from 'lucide-react-native';

import TaskHistoryPendingLogs  from '../screens/TaskHistoryPendingLogs';
import ProductionStagesScreen  from '../screens/ProductionStagesScreen';
import EmployeePerformanceReport from '../screens/EmployeePerformanceReport';
import GlobalHeader            from '../components/GlobalHeader';
import { clearWorkerSession, getWorkerSession, workerLabel } from '../src/services/workerSession';
import { fetchStaffAlerts, isSessionActive }     from '../src/services/supabaseService';

const Tab = createBottomTabNavigator();
const UNREAD_POLL_MS = 30000;
const SESSION_POLL_MS = 30000;

export default function MainAppNavigator({ navigation }) {
  const [hasUnread, setHasUnread] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const insets = useSafeAreaInsets();
  const seenAlertIdsRef = useRef(null); // null = not yet initialized (first check just baselines, doesn't pop)

  // Manager-only "Team" tab gating — loaded once on mount from the worker
  // session's role. Managers get a third bottom tab for the Employee
  // Performance report; everyone else only sees Stages/History.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getWorkerSession();
      if (cancelled) return;
      const role = (session?.role || '').toLowerCase();
      setIsManager(['manager', 'admin', 'supervisor'].includes(role));
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll for unread alerts so the bell badge stays current across all tabs,
  // not just whenever the alerts screen happens to be visited. Also pops a
  // native alert the moment a genuinely NEW alert appears, so workers don't
  // have to notice the silent badge to find out about it.
  useEffect(() => {
    let cancelled = false;
    const checkUnread = async () => {
      const session = await getWorkerSession();
      const alerts = await fetchStaffAlerts(session ? workerLabel(session) : null);
      if (cancelled) return;
      setHasUnread(alerts.length > 0);

      const currentIds = new Set(alerts.map(a => a.id));
      if (seenAlertIdsRef.current === null) {
        // First check this session -- just baseline, don't pop alerts for
        // things that were already unread before the app opened.
        seenAlertIdsRef.current = currentIds;
        return;
      }

      const newOnes = alerts.filter(a => !seenAlertIdsRef.current.has(a.id));
      seenAlertIdsRef.current = currentIds;

      // Pop a native alert for each genuinely new notification, most recent
      // first. Sequential native Alert.alert() calls queue automatically on
      // both iOS and Android, so this is safe even if several arrive at once.
      newOnes
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .forEach(a => {
          Alert.alert(a.title, a.message, [{ text: 'OK' }]);
        });
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

  const handleBell = () => navigation.navigate('StaffAlertsNotifications');

  const bottomPadding = Math.max(insets.bottom, 8);
  const tabBarHeight  = 56 + bottomPadding;

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route, navigation: nav }) => ({
          // No tab transition animation. The bottom-tabs 'fade' animation could get
          // STUCK at opacity 0 (white screen) when tabs were switched rapidly, and
          // wouldn't recover until the screen was re-mounted. Instant switching is
          // stable under spam-tapping.
          animation: 'none',
          tabBarIcon: ({ focused, color, size }) => {
            if (route.name === 'Stages')    return <Layers        size={size} color={color} />;
            if (route.name === 'History')   return <ClipboardList size={size} color={color} />;
            if (route.name === 'Team')      return <Users         size={size} color={color} />;
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
              onBell={handleBell}
              onProfile={() => (nav.getParent() ?? nav).navigate('Profile')}
              onBrandPress={() => nav.navigate('Stages')}
              hasUnread={hasUnread}
            />
          ),
        })}
      >
        <Tab.Screen name="Stages"    component={ProductionStagesScreen} options={{ tabBarLabel: 'Stages' }} />
        <Tab.Screen name="History"   component={TaskHistoryPendingLogs} options={{ tabBarLabel: 'History' }} />
        {isManager && (
          <Tab.Screen name="Team" component={EmployeePerformanceReport} options={{ tabBarLabel: 'Team' }} />
        )}
      </Tab.Navigator>

    </>
  );
}
