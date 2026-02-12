import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Camera, 
  Barcode, 
  Calendar, 
  Trash2, 
  Save,
  CheckCircle2,
  Package,
  X,
  Scan
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';
import { BarcodeScanner } from '../components/BarcodeScanner';

interface BatchFormData {
  ingrediente_id: string;
  codice_lotto: string;
  fornitore: string;
  data_consegna: string;
  data_scadenza: string;
  quantita: number;
  unita_misura: string;
  conservazione: string;
  note: string;
}

export function BatchManagement({ onClose }: { onClose: () => void }) {
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [batchCode, setBatchCode] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetchIngredients();
  }, []);

  async function fetchIngredients() {
    const data = await blink.db.ingredienti.list({ orderBy: { nome: 'asc' } });
    setIngredients(data);
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
      }
    } catch (error) {
      toast.error('Impossibile accedere alla fotocamera');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        
        // Convert to blob and upload
        canvasRef.current.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], `batch-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
            try {
              const { publicUrl } = await blink.storage.upload(file, `batches/${Date.now()}.jpg`);
              setCapturedPhotos([...capturedPhotos, publicUrl]);
              toast.success('Foto acquisita');
            } catch (error) {
              toast.error('Errore nel caricamento della foto');
            }
          }
        }, 'image/jpeg');
      }
    }
  };

  async function handleSaveBatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const ingredientId = formData.get('ingrediente_id') as string;
    const selectedIng = ingredients.find(i => i.id === ingredientId);
    
    if (!selectedIng) {
      toast.error('Seleziona un ingrediente valido');
      return;
    }

    const data = {
      ingredienteId: ingredientId,
      codiceLotto: formData.get('codice_lotto') as string,
      fornitore: formData.get('fornitore') as string,
      dataConsegna: formData.get('data_consegna') as string,
      dataScadenza: formData.get('data_scadenza') as string,
      quantitaIniziale: Number(formData.get('quantita')),
      quantitaAttuale: Number(formData.get('quantita')),
      unitaMisura: selectedIng.unita_misura,
      conservazione: formData.get('conservazione') as string,
      note: formData.get('note') as string,
      fotoEtichettaUrl: capturedPhotos[0] || '', // Use first photo as main label
    };

    try {
      setIsSaving(true);
      // 1. Create lot record
      const batchRes = await blink.db.lotti_ingredienti.create(data);
      
      // 2. Create inventory movement (type: 'carico')
      await blink.db.movimenti_magazzino.create({
        ingredienteId: data.ingredienteId,
        tipo: 'carico',
        quantita: data.quantitaIniziale,
        unitaMisura: data.unitaMisura,
        lottoId: batchRes.id,
        causale: `Carico lotto ${data.codiceLotto}`,
      });

      await logAudit('create', 'lotto_ingrediente', batchRes.id, data);
      toast.success('Lotto caricato correttamente');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Errore nel caricamento del lotto. Controlla tutti i campi.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-500 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-3xl font-serif">Gestione Lotti</h1>
      </div>

      <div className="max-w-2xl mx-auto">
        <Card className="border-none shadow-elegant">
          <CardHeader>
            <CardTitle>Nuovo Carico Merce</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveBatch} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ingrediente</Label>
                  <select name="ingrediente_id" required className="w-full h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm">
                    <option value="">Seleziona ingrediente...</option>
                    {ingredients.map(ing => (
                      <option key={ing.id} value={ing.id}>{ing.nome} ({ing.unita_misura})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Codice Lotto</Label>
                    <div className="relative">
                      <Input 
                        name="codice_lotto" 
                        required 
                        placeholder="L-XXXX" 
                        className="pr-10" 
                        value={batchCode}
                        onChange={(e) => setBatchCode(e.target.value)}
                      />
                      <button 
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary hover:text-primary/80 transition-colors"
                        onClick={() => setIsScannerOpen(true)}
                      >
                        <Scan className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantità Caricata</Label>
                    <Input name="quantita" type="number" step="0.01" required placeholder="0.00" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Consegna</Label>
                    <Input name="data_consegna" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Scadenza</Label>
                    <Input name="data_scadenza" type="date" required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fornitore</Label>
                    <Input name="fornitore" placeholder="es. Rossi Srl" />
                  </div>
                  <div className="space-y-2">
                    <Label>Conservazione</Label>
                    <select name="conservazione" className="w-full h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm">
                      <option value="secco">Secco</option>
                      <option value="frigo">Frigo</option>
                      <option value="freezer">Freezer</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Foto Etichetta/Lotto</Label>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="h-24 w-24 shrink-0 rounded-2xl border-dashed border-2 flex flex-col gap-2"
                      onClick={startCamera}
                    >
                      <Camera className="h-6 w-6" />
                      <span className="text-[10px] uppercase">Scatta</span>
                    </Button>
                    {capturedPhotos.map((url, i) => (
                      <div key={i} className="relative h-24 w-24 shrink-0 rounded-2xl overflow-hidden group">
                        <img src={url} alt={`Foto ${i}`} className="h-full w-full object-cover" />
                        <button 
                          type="button"
                          className="absolute top-1 right-1 bg-background/80 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setCapturedPhotos(capturedPhotos.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Note</Label>
                  <Input name="note" placeholder="Eventuali annotazioni sul carico..." />
                </div>
              </div>

              <Button type="submit" disabled={isSaving} className="w-full h-12 text-lg gap-2">
                <Save className="h-5 w-5" /> {isSaving ? 'Salvataggio...' : 'Registra Carico'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Camera Dialog */}
      <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black border-none">
          <div className="relative aspect-[3/4] bg-black">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-8">
              <Button 
                size="icon" 
                variant="outline" 
                className="h-16 w-16 rounded-full border-4 border-white bg-transparent hover:bg-white/20 text-white"
                onClick={capturePhoto}
              >
                <div className="h-12 w-12 rounded-full bg-white" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-16 w-16 rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={stopCamera}
              >
                <X className="h-8 w-8" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scanner Dialog */}
      <BarcodeScanner 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={(code) => {
          setBatchCode(code);
          toast.success('Codice acquisito!');
        }} 
      />
    </div>
  );
}
