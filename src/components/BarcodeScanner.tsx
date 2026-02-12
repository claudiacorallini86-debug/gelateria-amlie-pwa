import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { X, Camera } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { toast } from 'sonner';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function BarcodeScanner({ onScan, onClose, isOpen }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef(new BrowserMultiFormatReader());
  const [hasPermission, setHasHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => stopScanner();
  }, [isOpen]);

  const startScanner = async () => {
    try {
      const devices = await codeReader.current.listVideoInputDevices();
      if (devices.length === 0) {
        toast.error('Nessuna fotocamera trovata');
        return;
      }

      setHasHasPermission(true);
      codeReader.current.decodeFromVideoDevice(
        null, // Default camera
        videoRef.current!,
        (result, err) => {
          if (result) {
            onScan(result.getText());
            stopScanner();
            onClose();
          }
        }
      );
    } catch (error) {
      setHasHasPermission(false);
      toast.error('Permesso fotocamera negato');
    }
  };

  const stopScanner = () => {
    codeReader.current.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-black border-none">
        <div className="relative aspect-square sm:aspect-video bg-black flex items-center justify-center">
          {hasPermission === false ? (
            <div className="text-white text-center p-8 space-y-4">
              <Camera className="h-12 w-12 mx-auto opacity-50" />
              <p>Accesso alla fotocamera negato.</p>
              <Button variant="outline" onClick={onClose}>Chiudi</Button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" />
              {/* Scanner Overlay */}
              <div className="absolute inset-0 border-[40px] border-black/40">
                <div className="h-full w-full border-2 border-primary/50 relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary" />
                  
                  {/* Scanning Line */}
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary/50 shadow-[0_0_15px_hsl(var(--primary))] animate-pulse" />
                </div>
              </div>
              <p className="absolute bottom-4 left-0 right-0 text-center text-white text-xs font-medium uppercase tracking-widest bg-black/40 py-2 backdrop-blur-sm">
                Inquadra il codice a barre o QR
              </p>
            </>
          )}
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-2 right-2 text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
