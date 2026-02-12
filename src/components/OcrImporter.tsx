import React, { useState, useRef } from 'react';
import { 
  Camera, 
  Upload, 
  X, 
  Loader2, 
  CheckCircle2, 
  FileText,
  Save
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';

export function OcrImporter({ isOpen, onClose, onImported }: { isOpen: boolean, onClose: () => void, onImported: () => void }) {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [ingredients, setIngredients] = useState<any[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      toast.error('Errore fotocamera');
    }
  };

  const captureAndProcess = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        
        canvasRef.current.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], `invoice-${Date.now()}.jpg`, { type: 'image/jpeg' });
            processFile(file);
          }
        }, 'image/jpeg');
      }
    }
  };

  const processFile = async (file: File) => {
    try {
      setStep('processing');
      // 1. Upload to storage
      const { publicUrl } = await blink.storage.upload(file, `invoices/${Date.now()}.jpg`);
      setPhotoUrl(publicUrl);

      // 2. Extract with AI
      const prompt = "Extract invoice data: supplier (fornitore), date (data_acquisto), and a list of items with description (descrizione), quantity (quantita), and price (prezzo). Response must be a valid JSON object matching the following structure: { \"supplier\": \"...\", \"date\": \"...\", \"items\": [ { \"description\": \"...\", \"quantity\": 0, \"price\": 0 } ] }. Response must be in Italian.";
      
      const { text } = await blink.ai.generateText({
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image", image: publicUrl }
          ]
        }]
      });

      // Extract JSON from response (handling potential markdown blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not find valid JSON in AI response");
      const object = JSON.parse(jsonMatch[0]);

      setExtractedData(object);
      const ings = await blink.db.ingredienti.list();
      setIngredients(ings);
      setStep('review');
    } catch (error) {
      toast.error('Errore nella scansione OCR');
      setStep('upload');
    }
  };

  const handleSaveAll = async () => {
    try {
      await Promise.all(extractedData.items.map(async (item: any) => {
        // Find existing ingredient or skip
        const ing = ingredients.find(i => i.nome.toLowerCase().includes(item.description.toLowerCase()));
        if (ing) {
          await blink.db.prezzi_storico.create({
            ingrediente_id: ing.id,
            data_acquisto: extractedData.date || new Date().toISOString(),
            fornitore: extractedData.supplier,
            prezzo_per_unita: item.price,
            riferimento_documento: `OCR-${Date.now()}`,
            foto_documento_url: photoUrl
          });
        }
      }));
      toast.success('Dati importati con successo');
      onImported();
      onClose();
    } catch (error) {
      toast.error('Errore nel salvataggio');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa Prezzi da Fattura (OCR)</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6 py-8">
            <div className="aspect-video bg-secondary/30 rounded-2xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center relative overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
              <div className="relative z-10 text-center space-y-4">
                <div className="p-4 bg-background rounded-full shadow-lg inline-block">
                  <Camera className="h-8 w-8 text-primary" />
                </div>
                <p className="text-sm font-medium">Inquadra il documento o carica un file</p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={startCamera} size="sm">Attiva Camera</Button>
                  <Button variant="outline" size="sm" onClick={captureAndProcess}>Scatta e Analizza</Button>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
            <div className="space-y-1">
              <p className="font-bold text-lg">Analisi in corso...</p>
              <p className="text-sm text-muted-foreground text-balance px-12">L'intelligenza artificiale sta estraendo i dati dal tuo documento.</p>
            </div>
          </div>
        )}

        {step === 'review' && extractedData && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/30 rounded-xl">
              <div>
                <Label className="text-[10px] uppercase">Fornitore</Label>
                <p className="font-bold">{extractedData.supplier}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase">Data</Label>
                <p className="font-bold">{extractedData.date}</p>
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-4 py-3 text-left">Articolo</th>
                    <th className="px-4 py-3 text-right">Qta</th>
                    <th className="px-4 py-3 text-right">Prezzo</th>
                    <th className="px-4 py-3 text-left">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {extractedData.items.map((item: any, i: number) => {
                    const match = ingredients.find(ing => ing.nome.toLowerCase().includes(item.description.toLowerCase()));
                    return (
                      <tr key={i}>
                        <td className="px-4 py-3 font-medium">{item.description}</td>
                        <td className="px-4 py-3 text-right">{item.quantity}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary">€ {item.price.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {match ? (
                            <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/5">{match.nome}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-rose-500 border-rose-500/20 bg-rose-500/5">Nessun Match</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('upload')}>Annulla</Button>
              <Button onClick={handleSaveAll} className="gap-2">
                <Save className="h-4 w-4" /> Conferma e Salva
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
