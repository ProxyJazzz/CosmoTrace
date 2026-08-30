export type SensorStatus = 'OK' | 'BROKEN' | 'UNKNOWN';

export interface RawData {
  [channelId: string]: number;
}

export interface PerChannelData {
  [channelId: string]: SensorStatus;
}

export interface ZoneStatus {
  [zoneId: string]: SensorStatus;
}

export interface SensorData {
  timestamp: number;
  raw: RawData;
  perChannel: PerChannelData;
  zoneStatus: ZoneStatus;
  brokenChannels: string[];
}

export type ConnectionState = 'DISCONNECTED' | 'WAITING' | 'LIVE';

// UI Specific Types
export type SuitRegion = 
  | 'helmet'
  | 'torso_front' | 'torso_back'
  | 'left_arm' | 'right_arm'
  | 'left_glove' | 'right_glove'
  | 'left_leg' | 'right_leg'
  | 'left_boot' | 'right_boot';

export interface SensorMapping {
  id: string;
  region: SuitRegion;
  position: [number, number, number];
  label: string;
}

export type MappingConfidence = 'calibrated' | 'placeholder';

export interface CalibratedSensor {
  id: string;
  fibreId: string;
  region: SuitRegion;
  label: string;
  position: [number, number, number];
  uv?: [number, number];
  distanceAlongFibreMm: number;
  sensorSpacingMm: number;
  confidence: MappingConfidence;
}

export type CalibrationMap = Record<string, CalibratedSensor>;

export interface EventLogEntry {
  id: string;
  timestamp: number;
  channelId: string;
  reading: number;
  region: SuitRegion;
  status: SensorStatus;
}

export type GloveHand = 'left' | 'right';

export type GloveFinger = 'palm' | 'thumb' | 'index' | 'middle' | 'ring' | 'little';

export type GloveRegion = 
  | 'left_palm' | 'left_thumb' | 'left_index_finger' | 'left_middle_finger' | 'left_ring_finger' | 'left_little_finger'
  | 'right_palm' | 'right_thumb' | 'right_index_finger' | 'right_middle_finger' | 'right_ring_finger' | 'right_little_finger';

export interface CalibratedGloveSensor {
  id: string;
  hand: GloveHand;
  finger: GloveFinger;
  region: GloveRegion;
  label: string;
  position: [number, number, number];
  uv?: [number, number];
  fibreId: string;
  distanceAlongFibreMm: number;
  sensorSpacingMm: number;
  confidence: MappingConfidence;
}

export type GloveCalibrationMap = Record<string, CalibratedGloveSensor>;
