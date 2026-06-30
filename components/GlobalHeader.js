import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Bell, UserCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

export default function GlobalHeader({ title, onBell, onProfile, onBrandPress, hasUnread }) {
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    scaleAnim.setValue(0.93);
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 120,
      friction: 6,
      useNativeDriver: true,
    }).start();
    if (onBrandPress) onBrandPress();
  };

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      {/* Left: profile button + brand */}
      <View style={styles.leftSection}>
        {onProfile && (
          <TouchableOpacity onPress={onProfile} style={styles.iconButton} activeOpacity={0.7}>
            <UserCircle size={17} color={COLORS.textOnDark} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
          <Animated.View style={[styles.brandWrapper, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.brandTextGroup}>
              <Text style={styles.brandText}>wisp</Text>
              <Text style={styles.brandDash}>-</Text>
              <Text style={styles.brandSubtext}>flow</Text>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Right: notification bell only */}
      <View style={styles.rightSection}>
        {onBell && (
          <TouchableOpacity onPress={onBell} style={styles.iconButton} activeOpacity={0.7}>
            <Bell size={17} color={COLORS.textOnDark} />
            {hasUnread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.headerBorder,
    elevation: 2,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    color: '#5B21D9',
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: 0.2,
  },
  brandDash: {
    color: '#9CA3AF',
    fontWeight: '300',
    fontSize: 18,
  },
  brandSubtext: {
    color: '#5B21D9',
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: 0.2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    position: 'relative',
    padding: 7,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unreadDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 0,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: COLORS.headerBg,
  },
});
