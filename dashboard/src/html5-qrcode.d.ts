/**
 * Ambient types for html5-qrcode so `tsc` succeeds even when node_modules
 * layout differs (e.g. CI only installing from dashboard/package-lock).
 * Aligns with html5-qrcode@2.x public API.
 */
declare module 'html5-qrcode' {
  export enum Html5QrcodeSupportedFormats {
    QR_CODE = 0,
  }

  export interface Html5QrcodeCameraScanConfig {
    fps: number;
    qrbox?:
      | number
      | { width: number; height: number }
      | ((viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number });
    aspectRatio?: number;
    disableFlip?: boolean;
    videoConstraints?: MediaTrackConstraints;
  }

  export type Html5QrcodeConstructorConfig = {
    verbose?: boolean;
    formatsToSupport?: Html5QrcodeSupportedFormats[];
    experimentalFeatures?: { useBarCodeDetectorIfSupported?: boolean };
  };

  export class Html5Qrcode {
    isScanning: boolean;
    constructor(elementId: string, configOrVerbosity?: boolean | Html5QrcodeConstructorConfig);
    static getCameras(): Promise<Array<{ id: string; label: string }>>;
    start(
      cameraIdOrConfig: string | MediaTrackConstraints,
      configuration: Html5QrcodeCameraScanConfig | undefined,
      qrCodeSuccessCallback: (decodedText: string) => void,
      qrCodeErrorCallback: (errorMessage: string, error: unknown) => void,
    ): Promise<null>;
    stop(): Promise<void>;
    clear(): void;
    scanFile(imageFile: File, showImage?: boolean): Promise<string>;
  }
}
