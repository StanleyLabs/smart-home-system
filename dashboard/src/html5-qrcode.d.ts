/**
 * Ambient types for html5-qrcode so `tsc` succeeds even when node_modules
 * layout differs (e.g. CI only installing from dashboard/package-lock).
 * Aligns with html5-qrcode@2.x public API.
 */
declare module 'html5-qrcode' {
  export interface Html5QrcodeCameraScanConfig {
    fps: number;
    qrbox?: number | { width: number; height: number };
    aspectRatio?: number;
  }

  export class Html5Qrcode {
    isScanning: boolean;
    constructor(elementId: string, configOrVerbosity?: boolean | { verbose?: boolean });
    static getCameras(): Promise<Array<{ id: string; label: string }>>;
    start(
      cameraIdOrConfig: string | MediaTrackConstraints,
      configuration: Html5QrcodeCameraScanConfig | undefined,
      qrCodeSuccessCallback: (decodedText: string) => void,
      qrCodeErrorCallback: (errorMessage: string, error: unknown) => void,
    ): Promise<null>;
    stop(): Promise<void>;
    clear(): void;
  }
}
