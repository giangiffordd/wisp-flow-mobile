import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import MobileStaffDashboard from './screens/MobileStaffDashboard';
import MainAppNavigator from './navigation/MainAppNavigator';
import YoloCameraModule from './screens/YoloCameraModule';
import BatchSummary from './screens/BatchSummary';

// Import newly created screens
import PackagingBarcodeScanner from './screens/PackagingBarcodeScanner';
import StaffAlertsNotifications from './screens/StaffAlertsNotifications';
import ProcessFlowchart from './screens/ProcessFlowchart';
import MobileInventoryViewer from './screens/MobileInventoryViewer';
import TaskHistoryPendingLogs from './screens/TaskHistoryPendingLogs';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={MobileStaffDashboard} />
          <Stack.Screen name="MainTabs" component={MainAppNavigator} />
          <Stack.Screen name="PackagingBarcodeScanner" component={PackagingBarcodeScanner} />
          <Stack.Screen name="StaffAlertsNotifications" component={StaffAlertsNotifications} />
          <Stack.Screen name="ProcessFlowchart" component={ProcessFlowchart} />
          <Stack.Screen name="MobileInventoryViewer" component={MobileInventoryViewer} />
          <Stack.Screen name="TaskHistoryPendingLogs" component={TaskHistoryPendingLogs} />
          <Stack.Screen name="YoloScan"      component={YoloCameraModule} />
          <Stack.Screen name="BatchSummary" component={BatchSummary}      />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
