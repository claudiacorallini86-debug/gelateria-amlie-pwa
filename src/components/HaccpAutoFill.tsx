import React, { useState, useEffect } from 'react';
import { 
  History, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  Calendar as CalendarIcon
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from './ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';
import { format, subDays, isSameDay, startOfDay, eachDayOfInterval } from 'date-fns';
import { it } from 'date-fns/locale';

interface HaccpAutoFillProps {
  onComplete: () => void;
}

export function HaccpAutoFill({ onComplete }: HaccpAutoFillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [findingData, setFindingData] = useState(false);
  
  const [options, setOptions] = useState({
    temperature: true,
    cleaning: true,
    days: 3
  });

  const [preview, setPreview] = useState<{
    sourceDate: Date | null;
    missingDays: Date[];
    tempCount: number;
    cleanCount: number;
  }>({
    sourceDate: null,
    missingDays: [],
    tempCount: 0,
    cleanCount: 0
  });

  useEffect(() => {
    if (isOpen) {
      calculateGap();
    }
  }, [isOpen, options.days]);

  async function calculateGap() {
    setFindingData(true);
    try {
      // Find the most recent records
      const [lastTemps, lastCleans] = await Promise.all([
        blink.db.haccp_temperature.list({ orderBy: { dataOra: 'desc' }, limit: 1 }),
        blink.db.haccp_pulizie.list({ orderBy: { dataOra: 'desc' }, limit: 1 })
      ]);

      const lastTempDate = lastTemps.length > 0 ? new Date(lastTemps[0].dataOra) : null;
      const lastCleanDate = lastCleans.length > 0 ? new Date(lastCleans[0].dataOra) : null;

      let sourceDate: Date | null = null;
      if (lastTempDate && lastCleanDate) {
        sourceDate = lastTempDate > lastCleanDate ? lastTempDate : lastCleanDate;
      } else {
        sourceDate = lastTempDate || lastCleanDate;
      }

      if (!sourceDate) {
        setPreview({ sourceDate: null, missingDays: [], tempCount: 0, cleanCount: 0 });
        return;
      }

      const today = startOfDay(new Date());
      const start = startOfDay(subDays(today, options.days));
      
      // Get all days in range that are NOT today and NOT after today
      const interval = eachDayOfInterval({ start, end: subDays(today, 1) });
      
      // Filter out days that already have records
      // For simplicity in this UI, we'll just check if there's *any* record for those days
      // In a real app we might want more granular checks, but the requirement says "se mancano registrazioni"
      
      const missingDays: Date[] = [];
      for (const day of interval) {
        const dayStr = day.toISOString().split('T')[0];
        const [dayTemps, dayCleans] = await Promise.all([
          blink.db.haccp_temperature.list({ 
            where: { dataOra: { gte: `${dayStr}T00:00:00Z`, lte: `${dayStr}T23:59:59Z` } },
            limit: 1
          }),
          blink.db.haccp_pulizie.list({ 
            where: { dataOra: { gte: `${dayStr}T00:00:00Z`, lte: `${dayStr}T23:59:59Z` } },
            limit: 1
          })
        ]);

        if (dayTemps.length === 0 && dayCleans.length === 0) {
          missingDays.push(day);
        }
      }

      // Fetch counts from source date
      const sourceDayStr = sourceDate.toISOString().split('T')[0];
      const [sourceTemps, sourceCleans] = await Promise.all([
        blink.db.haccp_temperature.list({ 
          where: { dataOra: { gte: `${sourceDayStr}T00:00:00Z`, lte: `${sourceDayStr}T23:59:59Z` } }
        }),
        blink.db.haccp_pulizie.list({ 
          where: { dataOra: { gte: `${sourceDayStr}T00:00:00Z`, lte: `${sourceDayStr}T23:59:59Z` } }
        })
      ]);

      setPreview({
        sourceDate,
        missingDays,
        tempCount: sourceTemps.length,
        cleanCount: sourceCleans.length
      });

    } catch (error) {
      console.error('Error calculating gap:', error);
      toast.error('Errore nel calcolo dei giorni mancanti');
    } finally {
      setFindingData(false);
    }
  }

  async function handleAutoFill() {
    if (!preview.sourceDate || preview.missingDays.length === 0) return;
    
    setLoading(true);
    try {
      const sourceDayStr = preview.sourceDate.toISOString().split('T')[0];
      const [sourceTemps, sourceCleans] = await Promise.all([
        blink.db.haccp_temperature.list({ 
          where: { dataOra: { gte: `${sourceDayStr}T00:00:00Z`, lte: `${sourceDayStr}T23:59:59Z` } }
        }),
        blink.db.haccp_pulizie.list({ 
          where: { dataOra: { gte: `${sourceDayStr}T00:00:00Z`, lte: `${sourceDayStr}T23:59:59Z` } }
        })
      ]);

      const sourceInfo = `GENERATO DA COPIA - Sorgente: ${format(preview.sourceDate, 'dd/MM/yyyy')}`;

      for (const day of preview.missingDays) {
        const dayStr = day.toISOString().split('T')[0];
        
        if (options.temperature && sourceTemps.length > 0) {
          const newTemps = sourceTemps.map(t => ({
            attrezzatura: t.attrezzatura,
            temperatura: t.temperatura,
            note: t.note ? `${t.note} (${sourceInfo})` : sourceInfo,
            dataOra: `${dayStr}T12:00:00Z` // Mid-day default
          }));
          await blink.db.haccp_temperature.createMany(newTemps);
        }

        if (options.cleaning && sourceCleans.length > 0) {
          const newCleans = sourceCleans.map(c => ({
            area: c.area,
            compito: c.compito,
            eseguito: true,
            note: c.note ? `${c.note} (${sourceInfo})` : sourceInfo,
            dataOra: `${dayStr}T18:00:00Z` // Evening default
          }));
          await blink.db.haccp_pulizie.createMany(newCleans);
        }
      }

      await logAudit('create', 'haccp_autofill', 'multiple', {
        daysCreated: preview.missingDays.map(d => d.toISOString().split('T')[0]),
        sourceDate: sourceDayStr,
        tempCount: options.temperature ? sourceTemps.length : 0,
        cleanCount: options.cleaning ? sourceCleans.length : 0
      });

      toast.success(`Compilazione completata: ${preview.missingDays.length} giorni creati`);
      setIsOpen(false);
      onComplete();
    } catch (error) {
      console.error('Auto-fill error:', error);
      toast.error('Errore durante la compilazione automatica');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button 
        variant="outline" 
        onClick={() => setIsOpen(true)}
        className="gap-2 border-primary/20 hover:bg-primary/5 text-primary"
      >
        <History className="h-4 w-4" />
        Reset
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compilazione Automatica HACCP</DialogTitle>
            <DialogDescription>
              Copia i dati dall'ultimo giorno valido per i giorni mancanti.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Giorni da controllare</Label>
                <select 
                  className="w-full p-2 border rounded-md text-sm bg-background"
                  value={options.days}
                  onChange={(e) => setOptions(prev => ({ ...prev, days: Number(e.target.value) }))}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <option key={d} value={d}>Ultimi {d} giorni</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="temp" 
                  checked={options.temperature}
                  onCheckedChange={(checked) => setOptions(prev => ({ ...prev, temperature: !!checked }))}
                />
                <label htmlFor="temp" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Temperature
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="clean" 
                  checked={options.cleaning}
                  onCheckedChange={(checked) => setOptions(prev => ({ ...prev, cleaning: !!checked }))}
                />
                <label htmlFor="clean" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Pulizie
                </label>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Anteprima Operazione
              </h4>
              
              {findingData ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ricerca dati mancanti...
                </div>
              ) : preview.missingDays.length > 0 ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sorgente dati:</span>
                    <span className="font-medium">{preview.sourceDate ? format(preview.sourceDate, 'dd/MM/yyyy') : 'Nessuna'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Giorni da creare:</span>
                    <span className="font-medium">{preview.missingDays.length}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-muted-foreground">Record Temperature:</span>
                    <span className="font-medium">{options.temperature ? preview.tempCount : 0} per giorno</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Record Pulizie:</span>
                    <span className="font-medium">{options.cleaning ? preview.cleanCount : 0} per giorno</span>
                  </div>
                  
                  <div className="mt-3 bg-amber-500/10 text-amber-600 p-2 rounded text-xs font-medium">
                    Verranno creati {preview.missingDays.length * ((options.temperature ? preview.tempCount : 0) + (options.cleaning ? preview.cleanCount : 0))} nuovi record.
                  </div>
                </div>
              ) : (
                <div className="text-sm text-emerald-600 font-medium py-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Tutti i giorni sono già compilati!
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handleAutoFill} 
              disabled={loading || findingData || preview.missingDays.length === 0}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Conferma e Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
