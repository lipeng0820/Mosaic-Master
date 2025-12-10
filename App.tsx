import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Undo2, Redo2, Image as ImageIcon, Eraser, Zap, Droplet, Move, RotateCcw } from 'lucide-react';
import Button from './components/Button';
import Slider from './components/Slider';
import { ToolType, BrushSettings } from './types';
import { applyPixelate, applyNoise, applyBlur } from './utils/effects';

// --- Integrated Editor Component ---
const EditorCanvas = ({
  imageSrc,
  tool,
  brushSettings,
  canvasRef,
  onStrokeStart,
  onStrokeEnd
}: {
  imageSrc: string;
  tool: ToolType;
  brushSettings: BrushSettings;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onStrokeStart?: () => void;
  onStrokeEnd?: () => void;
}) => {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);

  // Initialize Image
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.crossOrigin = "anonymous";
    img.onload = () => setImgObj(img);
  }, [imageSrc]);

  // Setup Canvas
  useEffect(() => {
    if (!imgObj || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Only reset if size changes or first load. 
    // If we just undo/redo, imgObj doesn't change, so this effect won't fire incorrectly.
    if (canvas.width !== imgObj.width || canvas.height !== imgObj.height) {
        canvas.width = imgObj.width;
        canvas.height = imgObj.height;
        ctx.drawImage(imgObj, 0, 0);
        // Signal that initial state is ready? Parent handles this via initial useEffect or explicit reset.
    }
    
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, [imgObj]);

  const updateRect = () => {
    if (canvasRef.current) {
      setCanvasRect(canvasRef.current.getBoundingClientRect());
    }
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !canvasRect) return null;
    
    // Handle touch vs mouse
    let clientX, clientY;
    if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
         // For touchend
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }

    const scaleX = canvasRef.current.width / canvasRect.width;
    const scaleY = canvasRef.current.height / canvasRect.height;

    return {
      x: (clientX - canvasRect.left) * scaleX,
      y: (clientY - canvasRect.top) * scaleY,
      screenX: clientX - canvasRect.left,
      screenY: clientY - canvasRect.top,
      scaleX
    };
  };

  const paint = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    if (!coords || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (tool === ToolType.PIXELATE) {
      applyPixelate(ctx, coords.x, coords.y, brushSettings);
    } else if (tool === ToolType.NOISE) {
      applyNoise(ctx, coords.x, coords.y, brushSettings);
    } else if (tool === ToolType.BLUR) {
      applyBlur(ctx, coords.x, coords.y, brushSettings, canvasRef.current);
    }
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    // If touches > 1, allow pinch zoom (default browser behavior), don't paint
    if ('touches' in e && e.touches.length > 1) return;
    
    if (onStrokeStart) onStrokeStart();
    setIsDrawing(true);
    updateRect();
    paint(e);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    if (coords) {
      setCursorPos({ x: coords.screenX, y: coords.screenY, scale: coords.scaleX });
    }
    if (isDrawing) {
      e.preventDefault(); // Prevent scrolling while drawing
      paint(e);
    }
  };

  const handleEnd = () => {
    if (isDrawing) {
        setIsDrawing(false);
        if (onStrokeEnd) onStrokeEnd();
    }
  };

  if (!imgObj) return <div className="text-white/50 animate-pulse">Loading Canvas...</div>;

  return (
    <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }}>
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-[80vh] shadow-2xl cursor-none touch-none"
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={() => { 
            // If leaving canvas while drawing, we end the stroke
            if (isDrawing) handleEnd();
            setCursorPos(null); 
        }}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      />
      {cursorPos && (
        <div
          className="pointer-events-none absolute rounded-full border border-white/90 shadow-[0_0_4px_rgba(0,0,0,0.8)] z-50 mix-blend-difference"
          style={{
            left: 0, 
            top: 0,
            width: (brushSettings.radius * 2) / cursorPos.scale, 
            height: (brushSettings.radius * 2) / cursorPos.scale,
            transform: `translate(${cursorPos.x}px, ${cursorPos.y}px) translate(-50%, -50%)`
          }}
        />
      )}
    </div>
  );
};


// --- Main App ---

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolType>(ToolType.PIXELATE);
  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    radius: 40,
    intensity: 15
  });
  
  // Undo/Redo State
  // We store ImageData objects. Limit history to conserve memory.
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize history when image loads
  const initHistory = useCallback(() => {
     if (!canvasRef.current) return;
     const ctx = canvasRef.current.getContext('2d');
     if (!ctx) return;
     
     // Small timeout to ensure image is drawn
     setTimeout(() => {
         const initialState = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
         setHistory([initialState]);
         setHistoryIndex(0);
     }, 50);
  }, []);

  // Effect to reset history when a new image is loaded
  useEffect(() => {
      if (imageSrc) {
          // History init is handled inside EditorCanvas via callback or time, 
          // but we can just wait for the canvas to be ready.
          // Better: Use a ref to track if we initialized for this src.
          setHistory([]);
          setHistoryIndex(-1);
      }
  }, [imageSrc]);

  // Pass this to EditorCanvas to call when Image is successfully drawn for the first time
  // Using a hacky way via initHistory called from onStrokeEnd? No.
  // We'll use a specific "onReady" effect or just assume the first stroke adds to history?
  // Ideally, we want the base state. 
  // Let's modify handleReset to also reset history.
  
  // Watch for historyIndex changes to restore canvas
  const restoreHistory = (index: number) => {
      if (!canvasRef.current || index < 0 || index >= history.length) return;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
          ctx.putImageData(history[index], 0, 0);
      }
  };

  const handleStrokeStart = () => {
     // Nothing strict needed here, but we could lock UI
     if (historyIndex === -1 && canvasRef.current) {
         // Should have been initialized, but if not:
         const ctx = canvasRef.current.getContext('2d');
         if (ctx) {
             const base = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
             setHistory([base]);
             setHistoryIndex(0);
         }
     }
  };

  const handleStrokeEnd = () => {
     if (!canvasRef.current) return;
     const ctx = canvasRef.current.getContext('2d');
     if (!ctx) return;

     const newState = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
     
     // Slice history if we are in the middle
     const newHistory = history.slice(0, historyIndex + 1);
     
     // Add new state
     newHistory.push(newState);
     
     // Limit history size (e.g., 20 steps)
     if (newHistory.length > 20) {
         newHistory.shift();
     }
     
     setHistory(newHistory);
     setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          restoreHistory(newIndex);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          restoreHistory(newIndex);
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
    }
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'mosaic-master-edit.png';
    link.href = canvasRef.current.toDataURL('image/png', 1.0);
    link.click();
  };

  const handleReset = () => {
    if (!canvasRef.current || !imageSrc) return;
    const ctx = canvasRef.current.getContext('2d');
    const img = new Image();
    img.src = imageSrc;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvasRef.current!.width = img.width;
      canvasRef.current!.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      // Reset history
      const baseState = ctx!.getImageData(0, 0, img.width, img.height);
      setHistory([baseState]);
      setHistoryIndex(0);
    };
  };

  if (!imageSrc) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-[#1e1e1e] border border-gray-800 rounded-2xl p-12 shadow-2xl">
          <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
            <ImageIcon size={40} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Mosaic Master</h1>
          <p className="text-gray-400 mb-8">Upload an image to start editing with professional privacy tools.</p>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Upload size={20} />
            Select Image
          </button>
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleImageUpload} 
          />
        </div>
      </div>
    );
  }

  // Ensure history is initialized on mount if not already
  if (historyIndex === -1 && canvasRef.current) {
      // It's tricky to sync React state with Canvas readiness. 
      // The EditorCanvas effect handles the drawing. 
      // We'll rely on the user's first stroke or manual reset to set baseline, 
      // OR we add a small delayed init in useEffect above.
      // Let's manually trigger initHistory once after render
      setTimeout(initHistory, 100);
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#121212] text-gray-200 overflow-hidden">
      
      {/* Header */}
      <header className="h-14 border-b border-gray-800 bg-[#1a1a1a] flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-2 text-white font-bold text-lg">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center hidden sm:flex">
            <span className="text-sm">M</span>
          </div>
          <span className="hidden sm:inline">Mosaic Master</span>
          <span className="sm:hidden">Mosaic</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-800 rounded-lg p-1 mr-2 gap-1">
              <Button 
                variant="ghost" 
                onClick={undo} 
                disabled={historyIndex <= 0}
                className="!px-2 !py-1"
                title="Undo"
              >
                  <Undo2 size={18} />
              </Button>
              <Button 
                variant="ghost" 
                onClick={redo} 
                disabled={historyIndex >= history.length - 1}
                className="!px-2 !py-1"
                title="Redo"
              >
                  <Redo2 size={18} />
              </Button>
          </div>

          <Button variant="ghost" onClick={() => setImageSrc(null)} className="hidden sm:flex">New</Button>
          <Button variant="primary" onClick={handleSave} icon={<Download size={16} />}>
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </header>

      {/* Main Workspace - Responsive Layout: Flex-col on mobile (Canvas Top, Tools Bottom), Row on Desktop */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Toolbar - Order 2 on mobile (bottom), Order 1 on Desktop (left) */}
        <aside className="
            order-2 md:order-1
            w-full md:w-72 
            bg-[#1a1a1a] border-t md:border-t-0 md:border-r border-gray-800 
            flex flex-col 
            p-4 gap-4 md:gap-6 
            overflow-y-auto shrink-0 z-10 shadow-xl
            max-h-[40vh] md:max-h-full
        ">
          
          {/* Tool Selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:block">Tools</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setTool(ToolType.PIXELATE)}
                className={`flex flex-col items-center justify-center p-2 md:p-3 rounded-xl border transition-all ${
                  tool === ToolType.PIXELATE 
                    ? 'bg-blue-600/10 border-blue-600 text-blue-500' 
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-750 text-gray-400'
                }`}
              >
                <div className="mb-1"><Eraser size={20} /></div>
                <span className="text-[10px] font-medium">Mosaic</span>
              </button>
              
              <button
                onClick={() => setTool(ToolType.BLUR)}
                className={`flex flex-col items-center justify-center p-2 md:p-3 rounded-xl border transition-all ${
                  tool === ToolType.BLUR 
                    ? 'bg-blue-600/10 border-blue-600 text-blue-500' 
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-750 text-gray-400'
                }`}
              >
                <div className="mb-1"><Droplet size={20} /></div>
                <span className="text-[10px] font-medium">Blur</span>
              </button>

              <button
                onClick={() => setTool(ToolType.NOISE)}
                className={`flex flex-col items-center justify-center p-2 md:p-3 rounded-xl border transition-all ${
                  tool === ToolType.NOISE 
                    ? 'bg-blue-600/10 border-blue-600 text-blue-500' 
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-750 text-gray-400'
                }`}
              >
                <div className="mb-1"><Zap size={20} /></div>
                <span className="text-[10px] font-medium">Noise</span>
              </button>
            </div>
          </div>

          {/* Settings - Compact on mobile */}
          <div className="space-y-4 md:space-y-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:block">Settings</h3>
            
            <Slider 
              label="Brush Radius" 
              value={brushSettings.radius} 
              min={5} 
              max={200} 
              onChange={(v) => setBrushSettings(prev => ({ ...prev, radius: v }))}
              unit="px"
            />

            <Slider 
              label={tool === ToolType.PIXELATE ? "Block Size" : tool === ToolType.BLUR ? "Strength" : "Intensity"}
              value={brushSettings.intensity} 
              min={2} 
              max={100} 
              onChange={(v) => setBrushSettings(prev => ({ ...prev, intensity: v }))}
            />
          </div>

          <div className="mt-auto pt-4 border-t border-gray-800 hidden md:block">
             <Button variant="secondary" className="w-full" onClick={handleReset} icon={<RotateCcw size={16} />}>
               Reset Image
             </Button>
          </div>
        </aside>

        {/* Canvas Area - Order 1 on mobile (Top), Order 2 on Desktop */}
        <main className="
            order-1 md:order-2
            flex-1 bg-[#121212] relative overflow-hidden flex items-center justify-center p-4
        ">
            {/* Checkerboard background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
              style={{
                backgroundImage: 'linear-gradient(45deg, #262626 25%, transparent 25%), linear-gradient(-45deg, #262626 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #262626 75%), linear-gradient(-45deg, transparent 75%, #262626 75%)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
              }} 
            />
            
            <EditorCanvas 
              imageSrc={imageSrc}
              tool={tool}
              brushSettings={brushSettings}
              canvasRef={canvasRef}
              onStrokeStart={handleStrokeStart}
              onStrokeEnd={handleStrokeEnd}
            />
            
             {/* Mobile Reset Button (Floating) */}
             <button 
                onClick={handleReset}
                className="md:hidden absolute top-4 right-4 p-2 bg-gray-800/80 rounded-full text-white shadow-lg backdrop-blur-sm"
             >
                <RotateCcw size={16} />
             </button>
        </main>
      </div>
    </div>
  );
}
