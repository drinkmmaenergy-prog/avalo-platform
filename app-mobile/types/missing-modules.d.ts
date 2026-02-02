/**
 * Type stubs for missing npm packages
 * These suppress editor errors for packages that are not yet installed
 * or have missing type definitions.
 */

declare module 'react-i18next' {
  export function useTranslation(): {
    t: (key: string, defaultValue?: string) => string;
    i18n: {
      language: string;
      changeLanguage: (lang: string) => Promise<void>;
    };
  };
  export function Trans(props: { i18nKey: string; children?: React.ReactNode }): JSX.Element;
}

declare module 'expo-image-manipulator' {
  export interface ImageManipulatorAction {
    resize?: { width?: number; height?: number };
    rotate?: number;
    flip?: 'horizontal' | 'vertical';
    crop?: { originX: number; originY: number; width: number; height: number };
  }

  export enum SaveFormat {
    PNG = 'png',
    JPEG = 'jpeg',
    WEBP = 'webp',
  }

  export interface ImageResult {
    uri: string;
    width: number;
    height: number;
    base64?: string;
  }

  export function manipulateAsync(
    uri: string,
    actions: ImageManipulatorAction[],
    options?: { compress?: number; format?: SaveFormat; base64?: boolean }
  ): Promise<ImageResult>;
}

declare module 'expo-video-thumbnails' {
  export interface ThumbnailOptions {
    time?: number;
    headers?: Record<string, string>;
  }

  export interface ThumbnailResult {
    uri: string;
    width: number;
    height: number;
  }

  export function getThumbnailAsync(
    sourceFilename: string,
    options?: ThumbnailOptions
  ): Promise<ThumbnailResult>;
}

declare module 'expo-device' {
  export const isDevice: boolean;
  export const brand: string | null;
  export const manufacturer: string | null;
  export const modelName: string | null;
  export const modelId: string | null;
  export const designName: string | null;
  export const productName: string | null;
  export const deviceYearClass: number | null;
  export const totalMemory: number | null;
  export const supportedCpuArchitectures: string[] | null;
  export const osName: string | null;
  export const osVersion: string | null;
  export const osBuildId: string | null;
  export const osInternalBuildId: string | null;
  export const osBuildFingerprint: string | null;
  export const platformApiLevel: number | null;
  export const deviceName: string | null;
  
  export enum DeviceType {
    UNKNOWN = 0,
    PHONE = 1,
    TABLET = 2,
    DESKTOP = 3,
    TV = 4,
  }
  
  export function getDeviceTypeAsync(): Promise<DeviceType>;
  export function getUptimeAsync(): Promise<number>;
  export function isRootedExperimentalAsync(): Promise<boolean>;
}

declare module 'react-native-maps' {
  import { ComponentType } from 'react';
  import { ViewProps } from 'react-native';

  export interface Region {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }

  export interface LatLng {
    latitude: number;
    longitude: number;
  }

  export interface MapViewProps extends ViewProps {
    region?: Region;
    initialRegion?: Region;
    onRegionChange?: (region: Region) => void;
    onRegionChangeComplete?: (region: Region) => void;
    showsUserLocation?: boolean;
    followsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
    showsCompass?: boolean;
    showsScale?: boolean;
    showsTraffic?: boolean;
    showsBuildings?: boolean;
    showsIndoors?: boolean;
    zoomEnabled?: boolean;
    rotateEnabled?: boolean;
    scrollEnabled?: boolean;
    pitchEnabled?: boolean;
    toolbarEnabled?: boolean;
    loadingEnabled?: boolean;
    moveOnMarkerPress?: boolean;
    mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain' | 'none' | 'mutedStandard';
  }

  export interface MarkerProps {
    coordinate: LatLng;
    title?: string;
    description?: string;
    image?: any;
    pinColor?: string;
    anchor?: { x: number; y: number };
    centerOffset?: { x: number; y: number };
    calloutAnchor?: { x: number; y: number };
    flat?: boolean;
    rotation?: number;
    draggable?: boolean;
    tracksViewChanges?: boolean;
    tracksInfoWindowChanges?: boolean;
    stopPropagation?: boolean;
    opacity?: number;
    onPress?: () => void;
    onCalloutPress?: () => void;
    onDrag?: (event: any) => void;
    onDragStart?: (event: any) => void;
    onDragEnd?: (event: any) => void;
  }

  export interface CircleProps {
    center: LatLng;
    radius: number;
    strokeWidth?: number;
    strokeColor?: string;
    fillColor?: string;
    zIndex?: number;
    lineCap?: 'butt' | 'round' | 'square';
    lineJoin?: 'miter' | 'round' | 'bevel';
    miterLimit?: number;
    geodesic?: boolean;
    lineDashPhase?: number;
    lineDashPattern?: number[];
  }

  const MapView: ComponentType<MapViewProps>;
  export const Marker: ComponentType<MarkerProps>;
  export const Circle: ComponentType<CircleProps>;
  export const Polyline: ComponentType<any>;
  export const Polygon: ComponentType<any>;
  export const Callout: ComponentType<any>;
  export const Overlay: ComponentType<any>;
  export const Heatmap: ComponentType<any>;
  export const Geojson: ComponentType<any>;

  export default MapView;
}
