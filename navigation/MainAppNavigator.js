import React from 'react';
import { Platform, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, ClipboardList, Package, Layers } from 'lucide-react-native';

import WorkflowModule from '../screens/WorkflowModule';
import TaskHistoryPendingLogs from '../screens/TaskHistoryPendingLogs';
import MobileInventoryViewer from '../screens/MobileInventoryViewer';
import ProductionStagesScreen from '../screens/ProductionStagesScreen';
import GlobalHeader from '../components/GlobalHeader';
import { clearWorkerSession } from '../src/services/workerSession';

const Tab = createBottomTabNavigator();

export default function MainAppNavigator({ navigation }) {
  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await clearWorkerSession();
            navigation.replace('Login');
          },
        },
      ]
    );
  };
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
          if (route.name === 'Workflow')   return <Activity      size={size} color={color} />;
          if (route.name === 'Stages')     return <Layers        size={size} color={color} />;
          if (route.name === 'History')    return <ClipboardList size={size} color={color} />;
          if (route.name === 'Inventory')  return <Package       size={size} color={color} />;
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
      <Tab.Screen name="Workflow"  component={WorkflowModule}          options={{ tabBarLabel: 'Workflow' }} />
      <Tab.Screen name="Stages"    component={ProductionStagesScreen}  options={{ tabBarLabel: 'Stages' }} />
      <Tab.Screen name="History"   component={TaskHistoryPendingLogs}  options={{ tabBarLabel: 'History' }} />
      <Tab.Screen name="Inventory" component={MobileInventoryViewer}   options={{ tabBarLabel: 'Inventory' }} />
    </Tab.Navigator>
  );
}
