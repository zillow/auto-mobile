export interface RotationCheckResult {
  rotationComplete: boolean;
  currentRotation: number | null;
  shouldContinue: boolean;
}
