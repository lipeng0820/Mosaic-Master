import { BrushSettings } from '../types';

/**
 * Applies a pixelation effect to a specific circular area of the canvas.
 * The mosaic grid is aligned to the global (0,0) coordinate to ensure consistency
 * across multiple strokes.
 */
export const applyPixelate = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  settings: BrushSettings
) => {
  const { radius, intensity } = settings;
  const blockSize = Math.max(2, Math.floor(intensity));
  
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  // 1. Determine the bounding box of the brush area
  const brushMinX = Math.floor(centerX - radius);
  const brushMinY = Math.floor(centerY - radius);
  const brushMaxX = Math.ceil(centerX + radius);
  const brushMaxY = Math.ceil(centerY + radius);

  // 2. Align bounds to the global grid (0,0)
  // We extend the bounds to include the full blocks that the brush touches
  const startX = Math.floor(brushMinX / blockSize) * blockSize;
  const startY = Math.floor(brushMinY / blockSize) * blockSize;
  
  // Calculate end bounds. We add blockSize-1 before dividing to ensure we include the last partial block.
  const endX = Math.floor((brushMaxX + blockSize - 1) / blockSize) * blockSize;
  const endY = Math.floor((brushMaxY + blockSize - 1) / blockSize) * blockSize;

  // 3. Clip the processing area to the canvas dimensions to avoid errors
  const safeStartX = Math.max(0, startX);
  const safeStartY = Math.max(0, startY);
  const safeEndX = Math.min(canvasWidth, endX);
  const safeEndY = Math.min(canvasHeight, endY);
  
  const safeWidth = safeEndX - safeStartX;
  const safeHeight = safeEndY - safeStartY;

  if (safeWidth <= 0 || safeHeight <= 0) return;

  // 4. Get pixel data for the relevant area
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(safeStartX, safeStartY, safeWidth, safeHeight);
  } catch (e) {
    return;
  }
  const data = imgData.data;

  // 5. Process grid blocks
  // Determine where the first block starts relative to the safe area
  // (The safe area might start in the middle of a block if the canvas edge clipped it)
  const gridStartX = Math.floor(safeStartX / blockSize) * blockSize;
  const gridStartY = Math.floor(safeStartY / blockSize) * blockSize;

  for (let gy = gridStartY; gy < safeEndY; gy += blockSize) {
    for (let gx = gridStartX; gx < safeEndX; gx += blockSize) {
      
      // Calculate intersection of the current block with the safe area
      // Block is [gx, gx + blockSize)
      const blockMinX = Math.max(safeStartX, gx);
      const blockMinY = Math.max(safeStartY, gy);
      const blockMaxX = Math.min(safeEndX, gx + blockSize);
      const blockMaxY = Math.min(safeEndY, gy + blockSize);

      if (blockMinX >= blockMaxX || blockMinY >= blockMaxY) continue;

      // --- Calculate Average Color of the block ---
      // We average all pixels in the visible part of the block
      let r = 0, g = 0, b = 0, count = 0;

      for (let y = blockMinY; y < blockMaxY; y++) {
        for (let x = blockMinX; x < blockMaxX; x++) {
          // Map global coordinates (x, y) to local ImageData buffer index
          const localX = x - safeStartX;
          const localY = y - safeStartY;
          const idx = (localY * safeWidth + localX) * 4;
          
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }

      if (count === 0) continue;

      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);

      // --- Apply Color ---
      // Only paint pixels that are inside the circular brush radius
      for (let y = blockMinY; y < blockMaxY; y++) {
        for (let x = blockMinX; x < blockMaxX; x++) {
          // Check distance to brush center
          const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
          
          if (dist <= radius) {
            const localX = x - safeStartX;
            const localY = y - safeStartY;
            const idx = (localY * safeWidth + localX) * 4;
            
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }
        }
      }
    }
  }

  // 6. Write modified data back to canvas
  ctx.putImageData(imgData, safeStartX, safeStartY);
};

/**
 * Applies a noise effect to a specific circular area.
 */
export const applyNoise = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  settings: BrushSettings
) => {
  const { radius, intensity } = settings;
  const diameter = radius * 2;
  const startX = Math.floor(x - radius);
  const startY = Math.floor(y - radius);
  
  const variance = intensity * 1.5;

  let imgData: ImageData;
  try {
    // Check bounds before getting data
    const safeX = Math.max(0, startX);
    const safeY = Math.max(0, startY);
    const safeW = Math.min(ctx.canvas.width - safeX, diameter);
    const safeH = Math.min(ctx.canvas.height - safeY, diameter);
    if (safeW <= 0 || safeH <= 0) return;

    imgData = ctx.getImageData(safeX, safeY, safeW, safeH);
  } catch (e) {
    return;
  }

  const data = imgData.data;
  const width = imgData.width;
  const height = imgData.height;
  
  // Real coordinates of the top-left of imgData
  const realStartX = Math.max(0, startX);
  const realStartY = Math.max(0, startY);

  for (let ly = 0; ly < height; ly++) {
    for (let lx = 0; lx < width; lx++) {
      const realX = realStartX + lx;
      const realY = realStartY + ly;
      const dist = Math.sqrt((realX - x) ** 2 + (realY - y) ** 2);
      
      if (dist <= radius) {
        const pos = (ly * width + lx) * 4;
        
        const randR = (Math.random() - 0.5) * variance;
        const randG = (Math.random() - 0.5) * variance;
        const randB = (Math.random() - 0.5) * variance;

        data[pos] = Math.min(255, Math.max(0, data[pos] + randR));
        data[pos + 1] = Math.min(255, Math.max(0, data[pos + 1] + randG));
        data[pos + 2] = Math.min(255, Math.max(0, data[pos + 2] + randB));
      }
    }
  }

  ctx.putImageData(imgData, realStartX, realStartY);
};

/**
 * Applies a blur effect using canvas filter and compositing.
 */
export const applyBlur = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  settings: BrushSettings,
  canvas: HTMLCanvasElement
) => {
  const { radius, intensity } = settings;
  
  ctx.save();
  
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  
  const blurPx = Math.max(1, intensity / 4);
  ctx.filter = `blur(${blurPx}px)`;
  
  const drawStart = Math.max(0, x - radius - blurPx * 2);
  const drawEnd = Math.max(0, y - radius - blurPx * 2);
  const drawSize = (radius + blurPx * 2) * 2;

  ctx.drawImage(
    canvas, 
    drawStart, drawEnd, drawSize, drawSize,
    drawStart, drawEnd, drawSize, drawSize
  );

  ctx.restore();
};
