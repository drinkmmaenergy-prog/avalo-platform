/**
 * PACK 76 - Geoshare Map View
 * Real-time map view showing user and partner locations
 * Note: Requires react-native-maps package
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { PartnerLocation } from '../../types/geoshare';
import { GEOSHARE_CONFIG, formatRemainingTime } from '../../config/geoshare';

interface GeoshareMapViewProps {
  userLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null;
  partnerLocation: PartnerLocation | null;
  partnerName: string;
  remainingSeconds: number;
  onStop: () => void;
  loading?: boolean;
}

export default function GeoshareMapView({
  userLocation,
  partnerLocation,
  partnerName,
  remainingSeconds,
  onStop,
  loading = false,
}: GeoshareMapViewProps) {
  const [mapRegion, setMapRegion] = useState({
    latitude: userLocation?.latitude || 0,
    longitude: userLocation?.longitude || 0,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  // Update map region when locations change
  useEffect(() => {
    if (userLocation && partnerLocation) {
      // Calculate center point between user and partner
      const centerLat = (userLocation.latitude + partnerLocation.latitude) / 2;
      const centerLng = (userLocation.longitude + partnerLocation.longitude) / 2;

      // Calculate deltas to show both locations
      const latDelta = Math.abs(userLocation.latitude - partnerLocation.latitude) * 2 + 0.005;
      const lngDelta = Math.abs(userLocation.longitude - partnerLocation.longitude) * 2 + 0.005;

      setMapRegion({
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: Math.max(latDelta, 0.01),
        longitudeDelta: Math.max(lngDelta, 0.01),
      });
    } else if (userLocation) {
      setMapRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [userLocation, partnerLocation]);

  const formatLastUpdate = (timestamp: Date): string => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - timestamp.getTime()) / 1000);

    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        style={styles.map}
        region={mapRegion}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={true}
        showsScale={true}
        zoomEnabled={true}
        scrollEnabled={true}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* User Location Marker */}
        {userLocation && (
          <>
            <Marker
              coordinate={{
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
              }}
              title="Your Location"
              pinColor="#007AFF"
            />
            {userLocation.accuracy && (
              <Circle
                center={{
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude,
                }}
                radius={userLocation.accuracy}
                fillColor="rgba(0, 122, 255, 0.2)"
                strokeColor="#007AFF"
                strokeWidth={1}
              />
            )}
          </>
        )}

        {/* Partner Location Marker */}
        {partnerLocation && (
          <>
            <Marker
              coordinate={{
                latitude: partnerLocation.latitude,
                longitude: partnerLocation.longitude,
              }}
              title={`${partnerName}'s Location`}
              pinColor="#FF3B30"
            />
            {partnerLocation.accuracy && (
              <Circle
                center={{
                  latitude: partnerLocation.latitude,
                  longitude: partnerLocation.longitude,
                }}
                radius={partnerLocation.accuracy}
                fillColor="rgba(255, 59, 48, 0.2)"
                strokeColor="#FF3B30"
                strokeWidth={1}
              />
            )}
          </>
        )}
      </ MapView>

      {/* Header Info Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Location Sharing Active</Text>
            <Text style={styles.headerSubtitle}>
              Sharing with {partnerName}
            </Text>
          </View>
          <View style={styles.timerContainer}>
            <Text style={styles.timerText}>
              {formatRemainingTime(remainingSeconds)}
            </Text>
            <Text style={styles.timerLabel}>remaining</Text>
          </View>
        </View>
      </View>

      {/* Location Info Cards */}
      <View style={styles.infoCards}>
        {/* Your Location Info */}
        <View style={styles.infoCard}>
          <View style={[styles.indicator, styles.indicatorBlue]} />
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>Your Location</Text>
            {userLocation ? (
              <>
                <Text style={styles.infoCardCoords}>
                  {userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}
                </Text>
                {userLocation.accuracy && (
                  <Text style={styles.infoCardAccuracy}>
                    Accuracy: ±{Math.round(userLocation.accuracy)}m
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.infoCardLoading}>Loading...</Text>
            )}
          </View>
        </View>

        {/* Partner Location Info */}
        <View style={styles.infoCard}>
          <View style={[styles.indicator, styles.indicatorRed]} />
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>{partnerName}'s Location</Text>
            {partnerLocation ? (
              <>
                <Text style={styles.infoCardCoords}>
                  {partnerLocation.latitude.toFixed(6)}, {partnerLocation.longitude.toFixed(6)}
                </Text>
                {partnerLocation.accuracy && (
                  <Text style={styles.infoCardAccuracy}>
                    Accuracy: ±{Math.round(partnerLocation.accuracy)}m
                  </Text>
                )}
                <Text style={styles.infoCardUpdate}>
                  Updated {formatLastUpdate(partnerLocation.timestamp)}
                </Text>
              </>
            ) : (
              <Text style={styles.infoCardLoading}>Waiting for location...</Text>
            )}
          </View>
        </View>
      </View>

      {/* Stop Button */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.stopButton}
          onPress={onStop}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.stopButtonText}>Stop Sharing</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  headerCard: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666666',
  },
  timerContainer: {
    alignItems: 'flex-end',
  },
  timerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  timerLabel: {
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
  },
  infoCards: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 100,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 12,
  },
  indicatorBlue: {
    backgroundColor: '#007AFF',
  },
  indicatorRed: {
    backgroundColor: '#FF3B30',
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  infoCardCoords: {
    fontSize: 11,
    color: '#666666',
    fontFamily: 'monospace',
  },
  infoCardAccuracy: {
    fontSize: 11,
    color: '#999999',
    marginTop: 2,
  },
  infoCardUpdate: {
    fontSize: 10,
    color: '#999999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  infoCardLoading: {
    fontSize: 12,
    color: '#999999',
    fontStyle: 'italic',
  },
  bottomActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
  },
  stopButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  stopButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
