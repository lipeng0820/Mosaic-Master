export enum ToolType {
  PIXELATE = 'PIXELATE',
  BLUR = 'BLUR',
  NOISE = 'NOISE',
}

export interface BrushSettings {
  radius: number;
  intensity: number; // Used for pixel size (mosaic) or strength (noise/blur)
}

export interface ImageDimensions {
  width: number;
  height: number;
}
