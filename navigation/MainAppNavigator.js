import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Activity, Menu as MenuIcon } from 'lucide-react-native';

import WorkflowModule from '../screens/WorkflowModule';
import MenuScreen from '../screens/MenuScreen';
import GlobalHeader from '../components/GlobalHeader';

const Tab = createBottomTabNavigator();

const NAVY = '#2B3441';

export default function MainAppNavigator({ navigation }) {
  const handleLogout = () => {
    navigation.replace('Login');
  };

  const handleBell = () => {
    navigation.navigate('StaffAlertsNotifications');
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Workflow') return <Activity size={size} color={color} />;
          if (route.name === 'Menu')     return <MenuIcon size={size} color={color} />;
        },
        tabBarActiveTintColor: NAVY,
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#DDE8F0',
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
          elevation: 8,
          shadowColor: NAVY,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.07,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        header: () => (
          <GlobalHeader
            title={route.name}
            onLogout={handleLogout}
            onBell={handleBell}
          />
        ),
      })}
    >
      <Tab.Screen name="Workflow" component={WorkflowModule} />
      <Tab.Screen name="Menu" component={MenuScreen} />
    </Tab.Navigator>
  );
}
