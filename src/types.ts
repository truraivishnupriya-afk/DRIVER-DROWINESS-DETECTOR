export type DriverStatus = 'ALERT' | 'CLOSED' | 'DROWSY';

export interface EyeEAR {
  left: number;
  right: number;
  average: number;
}

export interface Settings {
  threshold: number; // EAR below this means closed
  closedTimeRequired: number; // seconds of continuous closure before drowsy
  debugMesh: boolean; // overlay the landmarks on camera feed
  alertVolume: number; // Volume 0 to 1
  minFPS: number;
}

export interface CalibrationData {
  openAverage: number;
  closedAverage: number;
  calibrated: boolean;
}
