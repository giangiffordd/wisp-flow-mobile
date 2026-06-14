import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, ClipboardList, Package } from 'lucide-react-native';
import { COLORS } from '../theme';

import WorkflowModule from '../screens/WorkflowModule';
import TaskHistoryPendingLogs from '../screens/TaskHistoryPendingLogs';
import MobileInventoryViewer from '../screens/MobileInventoryViewer';
import GlobalHeader from '../components/GlobalHeader';

const Tab = createBottomTabNavigator();

export default function MainAppNavigator({ navigation }) {
  const handleLogout = () => navigation.replace('Login');
  const handleBell   = () => navigation.navigate('StaffAlertsNotifications');
  const insets = useSafeAreaInsets();

  // Dynamic bottom padding: use safe area inset on devices with gesture nav / notch,
  // fall back to a sensible minimum on older Android with hardware buttons.
  const bottomPadding = Platform.OS === 'ios'
    ? Math.max(insets.bottom, 8)
    : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tab.Navigator
      screenOptions={({ route, navigation: nav }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Workflow')  return <Activity     size={size} color={color} />;
          if (route.name === 'History')   return <ClipboardList size={size} color={color} />;
          if (route.name === 'Inventory') return <Package      size={size} color={color} />;
        },
        // Active tab uses ICPI primary blue, inactive uses muted
        tabBarActiveTintColor:   COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.cardBg,
          borderTopWidth: 1,
          borderTopColor: COLORS.borderLight,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          height: tabBarHeight,
          elevation: 8,
          shadowColor: COLORS.textDark,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        header: () => (
          <GlobalHeader
            title={route.name}
            onLogout={handleLogout}
            onBell={handleBell}
            onBrandPress={() => nav.navigate('Workflow')}
          />
        ),
      })}
    >
      <Tab.Screen name="Workflow"  component={WorkflowModule}        options={{ tabBarLabel: 'Workflow' }} />
      <Tab.Screen name="History"   component={TaskHistoryPendingLogs} options={{ tabBarLabel: 'Task History' }} />
      <Tab.Screen name="Inventory" component={MobileInventoryViewer}  options={{ tabBarLabel: 'Inventory' }} />
    </Tab.Navigator>
  );
}
