import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  Easing,
  ActivityIndicator
} from 'react-native';
import { ArrowLeft, Scan, CheckCircle2, Box, Package, ShieldCheck } from 'lucide-react-native';

export default function PackagingBarcodeScanner({ navigation }) {
  const [scanStatus, setScanStatus] = useState('scanning'); // scanning, success
  const [boxData, setBoxData] = useState(null);
  
  // Animated values
  const laserAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(100)).current; // starts offscreen (bottom offset)
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // Loop laser animation when scanning
  useEffect(() => {
    let animation;
    if (scanStatus === 'scanning') {
      laserAnim.setValue(0);
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 240, // Height of the scanner viewport is 250, line is 4px
            duration: 1800,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          })
        ])
      );
      animation.start();
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [scanStatus]);

  // Mock successful scan after 2 seconds
  useEffect(() => {
    let timeout;
    if (scanStatus === 'scanning') {
      // Hide card animation
      Animated.parallel([
        Animated.timing(cardAnim, {
          toValue: 100,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();

      timeout = setTimeout(() => {
        setScanStatus('success');
        setBoxData({
          boxId: 'PKG-2026',
          itemsInside: 50,
          status: 'Ready for Shipment'
        });

        // Slide up and fade in the card
        Animated.parallel([
          Animated.timing(cardAnim, {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.back(1)),
            useNativeDriver: true,
          }),
          Animated.timing(cardOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          })
        ]).start();
      }, 2500);
    }
    return () => clearTimeout(timeout);
  }, [scanStatus]);

  const handleScanNext = () => {
    setScanStatus('scanning');
    setBoxData(null);
  };

  return (
    <View style={styles.container}>
      {/* Dark Slate Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Packaging Scanner</Text>
        <View style={styles.headerRight}>
          <Text style={styles.stageBadge}>STAGE 12</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Help Banner */}
        <View style={styles.helpBanner}>
          <Scan size={18} color="#64748b" style={{ marginRight: 8 }} />
          <Text style={styles.helpText}>
            {scanStatus === 'scanning' 
              ? 'Align barcode inside the viewer to scan' 
              : 'Scan complete. Verify package details below.'}
          </Text>
        </View>

        {/* Camera Viewport Sandbox */}
        <View style={styles.scannerWrapper}>
          <View style={styles.cameraViewport}>
            {/* Viewport Corners */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            {scanStatus === 'scanning' ? (
              <>
                {/* Red Laser Line */}
                <Animated.View 
                  style={[
                    styles.laserLine, 
                    { transform: [{ translateY: laserAnim }] }
                  ]} 
                />
                
                {/* Scanning Mock HUD */}
                <View style={styles.scanHUD}>
                  <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.4)" style={{ marginBottom: 8 }} />
                  <Text style={styles.hudText}>FOCUSING CAMERA</Text>
                </View>
              </>
            ) : (
              <View style={styles.successOverlay}>
                <View style={styles.successIconWrapper}>
                  <CheckCircle2 size={44} color="#10b981" />
                </View>
                <Text style={styles.successText}>BARCODE CAPTURED</Text>
              </View>
            )}
          </View>
        </View>

        {/* Data Card (Slides Up on Success) */}
        {boxData && (
          <Animated.View 
            style={[
              styles.dataCard,
              { 
                opacity: cardOpacity,
                transform: [{ translateY: cardAnim }]
              }
            ]}
          >
            <View style={styles.cardHeader}>
              <Box size={20} color="#1e293b" style={{ marginRight: 8 }} />
              <Text style={styles.cardTitle}>Package Identification</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Box ID</Text>
              <Text style={styles.infoValue}>{boxData.boxId}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Items Inside</Text>
              <View style={styles.qtyBadge}>
                <Package size={14} color="#2563eb" style={{ marginRight: 4 }} />
                <Text style={styles.qtyText}>{boxData.itemsInside} Units</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Shipment Status</Text>
              <View style={styles.statusBadge}>
                <ShieldCheck size={14} color="#15803d" style={{ marginRight: 4 }} />
                <Text style={styles.statusText}>{boxData.status}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Large, Bright Blue Action Button */}
        {scanStatus === 'success' && (
          <TouchableOpacity 
            style={styles.scanButton} 
            onPress={handleScanNext}
            activeOpacity={0.85}
          >
            <Scan size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.scanButtonText}>Scan Next Box</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    minWidth: 32,
    alignItems: 'flex-end',
  },
  stageBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
  },
  helpText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  scannerWrapper: {
    width: '100%',
    aspectRatio: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
  },
  cameraViewport: {
    width: '90%',
    height: 244,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  laserLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  scanHUD: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  successOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  successText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#3b82f6',
    zIndex: 10,
  },
  topLeft: {
    top: 16,
    left: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  topRight: {
    top: 16,
    right: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  bottomLeft: {
    bottom: 16,
    left: 16,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  bottomRight: {
    bottom: 16,
    right: 16,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  dataCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  qtyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  qtyText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  statusText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    paddingVertical: 16,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
    marginTop: 16,
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
