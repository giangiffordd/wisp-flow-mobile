import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  UIManager,
  Image,
  Modal,
} from 'react-native';
import { ArrowLeft, Bell, X, ShieldAlert, AlertCircle, CheckCircle2, Info, RefreshCw, WifiOff, Image as ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { fetchStaffAlerts, dismissStaffAlert, dismissAllStaffAlerts, fetchScanBatchImages } from '../src/services/supabaseService';
import { getWorkerSession, workerLabel } from '../src/services/workerSession';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SEVERITY_CONFIG = {
  critical: { Icon: ShieldAlert,  iconColor: '#EF4444', borderColor: '#EF4444', bg: 'rgba(239,68,68,0.04)'  },
  warning:  { Icon: AlertCircle,  iconColor: '#F59E0B', borderColor: '#F59E0B', bg: 'rgba(245,158,11,0.04)' },
  info:     { Icon: Info,         iconColor: '#5B21D9', borderColor: '#5B21D9', bg: 'rgba(91,33,217,0.04)'  },
  system:   { Icon: CheckCircle2, iconColor: '#10B981', borderColor: '#10B981', bg: 'rgba(16,185,129,0.04)' },
};

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)   return 'Just now';
  if (mins  < 60)  return `${mins} min${mins > 1 ? 's' : ''} ago`;
  if (hours < 24)  return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days  < 7)   return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(isoString).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function StaffAlertsNotifications({ navigation }) {
  const insets = useSafeAreaInsets();
  const [alerts,      setAlerts]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState(false);

  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [imageModalLoading, setImageModalLoading] = useState(false);
  const [modalImages,       setModalImages]        = useState([]);
  const [modalSpecies,      setModalSpecies]       = useState(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const session = await getWorkerSession();
      const data = await fetchStaffAlerts(session ? workerLabel(session) : null);
      setAlerts(data);
    } catch (e) {
      console.warn('loadAlerts error:', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAlerts(); }, [loadAlerts]));

  const dismissAlert = async (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    await dismissStaffAlert(id);
  };

  const clearAllAlerts = async () => {
    const ids = alerts.map(a => a.id);
    setAlerts([]);
    await dismissAllStaffAlerts(ids);
  };

  const openFlaggedImage = async (scanBatchId) => {
    setImageModalVisible(true);
    setImageModalLoading(true);
    setModalImages([]);
    setModalSpecies(null);
    try {
      const { images, species } = await fetchScanBatchImages(scanBatchId);
      setModalImages(images);
      setModalSpecies(species);
    } catch (e) {
      console.warn('openFlaggedImage error:', e);
    } finally {
      setImageModalLoading(false);
    }
  };

  const closeImageModal = () => {
    setImageModalVisible(false);
    setModalImages([]);
    setModalSpecies(null);
  };

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <ArrowLeft size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ALERTS</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={loadAlerts} style={styles.refreshButton} activeOpacity={0.7}>
            <RefreshCw size={14} color="#5B21D9" />
          </TouchableOpacity>
          {alerts.length > 0 && (
            <TouchableOpacity onPress={clearAllAlerts} style={styles.clearAllButton} activeOpacity={0.7}>
              <Text style={styles.clearAllText}>DISMISS ALL</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#5B21D9" />
          <Text style={styles.centerStateText}>Loading alerts…</Text>
        </View>
      ) : fetchError ? (
        <View style={styles.centerState}>
          <WifiOff size={36} color="#EF4444" />
          <Text style={[styles.centerStateText, { color: '#EF4444', marginTop: 12 }]}>Could not load alerts</Text>
          <TouchableOpacity onPress={loadAlerts} style={{ marginTop: 16, backgroundColor: '#5B21D9', paddingHorizontal: 20, paddingVertical: 10 }} activeOpacity={0.8}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12, letterSpacing: 2 }}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : alerts.length > 0 ? (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionDivider}>
            <Text style={styles.sectionDividerText}>[ ACTIVE ALERTS · {alerts.length} ]</Text>
            <View style={styles.sectionDividerLine} />
          </View>

          {alerts.map((alert) => {
            const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
            const { Icon } = cfg;
            return (
              <View
                key={alert.id}
                style={[styles.alertCard, { borderLeftColor: cfg.borderColor, backgroundColor: cfg.bg }]}
              >
                <View style={styles.cardMain}>
                  <View style={styles.iconWrapper}>
                    <Icon size={18} color={cfg.iconColor} />
                  </View>
                  <View style={styles.textWrapper}>
                    <View style={styles.titleRow}>
                      <View style={styles.titleWithBadge}>
                        <Text style={styles.cardTitle}>{alert.title}</Text>
                        {!!alert.worker_name && (
                          <Text style={styles.forYouBadge}>FOR YOU</Text>
                        )}
                      </View>
                      <Text style={styles.timestamp}>{timeAgo(alert.created_at)}</Text>
                    </View>
                    <Text style={styles.cardDescription}>{alert.message}</Text>

                    {!!alert.scan_batch_id && (
                      <TouchableOpacity
                        style={styles.viewImageButton}
                        onPress={() => openFlaggedImage(alert.scan_batch_id)}
                        activeOpacity={0.7}
                      >
                        <ImageIcon size={12} color="#5B21D9" />
                        <Text style={styles.viewImageButtonText}>VIEW FLAGGED IMAGE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => dismissAlert(alert.id)}
                  activeOpacity={0.7}
                >
                  <X size={14} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrapper}>
            <Bell size={42} color="#7C3AED" />
          </View>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySubtitle}>
            There are no pending alerts or notifications requiring your review.
          </Text>
        </View>
      )}

      <Modal
        visible={imageModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeImageModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { marginTop: insets.top + 24, marginBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalSpecies ? modalSpecies.toUpperCase() : 'FLAGGED SPECIMEN'}
              </Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={closeImageModal} activeOpacity={0.7}>
                <X size={16} color="#111827" />
              </TouchableOpacity>
            </View>

            {imageModalLoading ? (
              <View style={styles.modalCenterState}>
                <ActivityIndicator size="large" color="#5B21D9" />
                <Text style={styles.centerStateText}>Loading image…</Text>
              </View>
            ) : modalImages.length > 0 ? (
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                {modalImages.map((img, idx) => {
                  if (!img?.image) return null;
                  const uri = img.image.startsWith('data:')
                    ? img.image
                    : 'data:image/jpeg;base64,' + img.image;
                  return (
                    <View key={idx} style={styles.modalImageWrapper}>
                      <Image source={{ uri }} style={styles.modalImage} resizeMode="contain" />
                      {!!img.species && (
                        <Text style={styles.modalImageCaption}>
                          {img.species}{img.confidence ? ` · ${Math.round(img.confidence * 100)}%` : ''}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.modalCenterState}>
                <Text style={styles.centerStateText}>No image available for this alert.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitle: { color: '#111827', fontSize: 14, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  refreshButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  clearAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#5B21D9',
  },
  clearAllText: { color: '#5B21D9', fontSize: 9, fontWeight: '800', letterSpacing: 2.5, textTransform: 'uppercase' },

  scrollContainer: { flex: 1 },
  scrollContent:   { padding: 14, paddingBottom: 32 },

  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionDividerText: { fontSize: 9, color: '#5B21D9', fontWeight: '700', letterSpacing: 2.5 },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },

  alertCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 4,
    position: 'relative',
  },
  cardMain:    { flex: 1, flexDirection: 'row', paddingRight: 22 },
  iconWrapper: { marginRight: 10, marginTop: 1 },
  textWrapper: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: 5,
    gap: 6,
  },
  titleWithBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTitle:       { fontSize: 13, fontWeight: '700', color: '#111827' },
  forYouBadge:     { fontSize: 10, fontWeight: '800', color: '#5B21D9', letterSpacing: 1 },
  timestamp:       { fontSize: 9, color: '#6B7280', fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase' },
  cardDescription: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  dismissButton: {
    position: 'absolute',
    top: 12, right: 12,
    padding: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  centerState:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  centerStateText: { color: '#6B7280', fontSize: 13, fontWeight: '500' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIconWrapper: {
    width: 72, height: 72,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#5B21D9',
  },
  emptyTitle:    { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 7, letterSpacing: 1, textTransform: 'uppercase' },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19 },

  viewImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#5B21D9',
    backgroundColor: '#FFFFFF',
  },
  viewImageButtonText: { color: '#5B21D9', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 13, fontWeight: '800', color: '#111827', letterSpacing: 1.5, flex: 1, marginRight: 12 },
  modalCloseButton: {
    padding: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  modalScroll:        { flexGrow: 0 },
  modalScrollContent: { padding: 16, gap: 16 },
  modalImageWrapper:  { marginBottom: 16 },
  modalImage: {
    width: '100%',
    height: 320,
    backgroundColor: '#111827',
  },
  modalImageCaption: { marginTop: 8, fontSize: 12, color: '#6B7280', fontWeight: '600', textAlign: 'center' },
  modalCenterState: { padding: 32, alignItems: 'center', justifyContent: 'center', gap: 10 },
});
