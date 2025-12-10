import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BrushSettings, ToolType } from '../types';
import { applyPixelate, applyNoise, applyBlur } from '../utils/effects';

interface ImageEditorProps {
  imageSrc: string;
  tool: ToolType;
  brushSettings: BrushSettings;
  onReset: () => void;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageSrc, tool, brushSettings, onReset }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);

  // Initialize Image
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.crossOrigin = "anonymous"; // Try to handle CORS if needed, mainly for local/blob
    img.onload = () => {
      setImgObj(img);
    };
  }, [imageSrc]);

  // Setup Canvas when Image Loads
  useEffect(() => {
    if (!imgObj || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Set actual resolution
    canvas.width = imgObj.width;
    canvas.height = imgObj.height;

    // Draw initial image
    ctx.drawImage(imgObj, 0, 0);

    // Initial scale calculation
    handleResize();

    // Add resize listener
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [imgObj]);

  // Listen for reset signal from parent (prop change or external trigger logic could be added)
  // But here we rely on re-mounting or re-drawing if imageSrc changes.
  // We can expose a ref method or simply re-draw if a "version" prop changed.
  // For now, let's just allow the parent to force a reload by key change or similar if needed.
  // Or simpler: The user hits "Reset" in toolbar -> Parent passes a signal?
  // Actually, let's handle "Reset" via a dedicated effect dependent on imageSrc changing, which we did.

  const handleResize = useCallback(() => {
    if (!containerRef.current || !imgObj) return;
    const container = containerRef.current;
    
    // Determine the scale factor between the displayed size and natural size
    // We want the canvas to fit within the container
    const containerAspect = container.clientWidth / container.clientHeight;
    const imgAspect = imgObj.width / imgObj.height;

    let displayWidth, displayHeight;

    if (containerAspect > imgAspect) {
      // Height constrained
      displayHeight = container.clientHeight;
      displayWidth = displayHeight * imgAspect;
    } else {
      // Width constrained
      displayWidth = container.clientWidth;
      displayHeight = displayWidth / imgAspect;
    }

    // Scale = Natural / Display
    // Actually, to map Mouse -> Canvas, we need: CanvasSize / DisplaySize
    // But since the CSS styles handle the display size (max-width: 100%, object-fit: contain logic simulated via width/height auto),
    // We need to calculate exactly how the browser is rendering it.
    
    // Simplest way: Let CSS handle layout, calculate scale on mouse move based on getBoundingClientRect.
  }, [imgObj]);


  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const paint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    // Update cursor position for the UI overlay
    // We need screen coordinates for the custom cursor overlay
    // But actually, it's easier to use a separate small canvas or div for the cursor,
    // or just rely on the mouse position.
    // Let's store coords for logic.

    if (tool === ToolType.PIXELATE) {
      applyPixelate(ctx, coords.x, coords.y, brushSettings);
    } else if (tool === ToolType.NOISE) {
      applyNoise(ctx, coords.x, coords.y, brushSettings);
    } else if (tool === ToolType.BLUR) {
      applyBlur(ctx, coords.x, coords.y, brushSettings, canvas);
    }
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    setIsDrawing(true);
    paint(e);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCanvasCoordinates(e);
    if (!canvasRef.current || !coords) return;

    // Get screen coordinates for the visual cursor
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    // visualX relative to the canvas element
    const visualX = coords.x / scaleX; 
    const visualY = coords.y / (canvasRef.current.height / rect.height);
    
    setCursorPos({ x: visualX, y: visualY });

    if (isDrawing) {
      // Throttle? For blur, maybe. For pixelate, it's fast enough usually.
      // requestAnimationFrame is better for smooth rendering, but for a paint tool,
      // we need immediate feedback.
      paint(e);
    }
  };

  const handleEnd = () => {
    setIsDrawing(false);
  };
  
  const handleMouseLeave = () => {
    setIsDrawing(false);
    setCursorPos(null);
  };

  // Expose the download function via ref? Or pass a callback up?
  // The parent needs to access the canvas dataURL.
  // We can add an imperative handle or just access the DOM element via ID from parent if we wanted to be hacky,
  // but let's stick to React data flow. 
  // Actually, the parent can request download by passing a "downloadTrigger" prop, 
  // or we pass a ref to this component up to the parent.
  // Let's use `forwardRef` pattern conceptually, but since we are inside a functional component,
  // we can just export the canvas Ref via a prop if needed, OR provide a `onSave` callback that passes the blob.
  
  // Actually, let's keep the save button IN the parent, but the parent needs access to canvasRef.
  // We will assign `window.currentCanvas = canvasRef.current` temporarily or use a Context?
  // Simplest: Pass `canvasRef` from parent down to here.
  // But wait, this component creates the ref.
  
  // Re-structure: We will stick to the plan where this component handles the drawing.
  // The parent passes a "saveRequest" timestamp or similar? No, that's messy.
  // Let's pass a function "registerSaveHandler" that this component calls on mount?
  
  // EASIEST: Put the "Save" logic inside this component, but the Button is in the Toolbar?
  // No, the Layout has a header.
  
  // Solution: This component exposes a method via `useImperativeHandle` (if we wrapped it)
  // OR: We just pass the canvasRef from the parent.
  // Let's do: Parent creates the ref, passes it down.
  
  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full flex items-center justify-center bg-gray-900/50 overflow-hidden select-none touch-none"
    >
      {!imgObj && <div className="text-gray-500">Loading Image...</div>}
      
      {/* The Canvas */}
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full shadow-2xl cursor-none object-contain"
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        style={{
             // Ensure it doesn't stretch weirdly
             display: imgObj ? 'block' : 'none'
        }}
      />

      {/* Custom Brush Cursor Overlay */}
      {cursorPos && imgObj && canvasRef.current && (
        <div
          className="pointer-events-none absolute border border-white/80 shadow-[0_0_10px_rgba(0,0,0,0.5)] rounded-full mix-blend-difference"
          style={{
            left: 0,
            top: 0,
            width: (brushSettings.radius * 2) / (imgObj.width / canvasRef.current.clientWidth), // Scale radius to screen
            height: (brushSettings.radius * 2) / (imgObj.height / canvasRef.current.clientHeight),
            transform: `translate(${cursorPos.x}px, ${cursorPos.y}px) translate(-50%, -50%)`,
            // If scale calculations are complex, we can simplify:
            // The cursor is drawn relative to the displayed canvas box.
            // We calculated cursorPos as relative to canvas element top-left in CSS pixels.
            // Just need to calculate width/height in CSS pixels.
          }}
        />
      )}
    </div>
  );
};

// Helper wrapper to handle the ref logic for saving
export const ImageEditorWrapper = React.forwardRef<HTMLCanvasElement, ImageEditorProps>((props, ref) => {
    const internalRef = useRef<HTMLCanvasElement>(null);
    
    // Sync internal ref with external ref
    React.useImperativeHandle(ref, () => internalRef.current as HTMLCanvasElement);

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    // We clone the element to attach the internal ref to the canvas
    // Wait, the ImageEditor defines the structure. 
    // We need to inject the ref into the canvas element inside ImageEditor.
    // Let's just modify ImageEditor to accept a forwarded ref.
    return <ImageEditorWithRef {...props} forwardedRef={internalRef} />;
});

const ImageEditorWithRef: React.FC<ImageEditorProps & { forwardedRef: React.RefObject<HTMLCanvasElement> }> = ({ forwardedRef, ...props }) => {
    // Copy-paste the logic from above but use forwardedRef instead of local canvasRef
    // ... (To avoid massive duplication in this thought block, I will implement the merged version in the final XML output)
    
    // REDEFINING ImageEditor below in the final output to accept forwardedRef.
    return null; 
};

export default ImageEditor;
