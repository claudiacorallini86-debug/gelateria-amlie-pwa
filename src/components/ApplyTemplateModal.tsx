import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle,
  Loader2,
  Package,
  History
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';

interface Template {
  id: string;
  nome: string;
  righe: any[];
}

export function ApplyTemplateModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [skipExisting, setSkipExisting] = useState(true);
  
  const [loading, setLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [step, setStep] = useState<'config' | 'validate' | 'applying'>('config');

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      const data = await blink.db.produzione_templates.list();
      setTemplates(data as any[]);
    } catch (error) {
      toast.error('Errore nel caricamento dei template');
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate() {
    if (!selectedTemplateId) {
      toast.error('Seleziona un template');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      toast.error('La data di inizio non può essere successiva alla data di fine');
      return;
    }

    try {
      setIsApplying(true);
      const template = templates.find(t => t.id === selectedTemplateId);
      const righe = await blink.db.produzione_template_righe.list({
        where: { template_id: selectedTemplateId }
      });

      // Validation: check if products have recipes and if ingredients/lots are valid
      const results = [];
      const now = new Date();

      for (const riga of righe) {
        const product = await blink.db.prodotti.get(riga.prodotto_id);
        const recipe = await blink.db.ricette.get(riga.ricetta_id);
        
        if (!recipe) {
          results.push({
            type: 'error',
            message: `Il prodotto ${product?.nome} non ha una ricetta valida.`
          });
        }

        // Check pre-selected ingredients
        const ings = await blink.db.produzione_template_ingredienti.list({
          where: { riga_template_id: riga.id }
        });

        for (const ing of ings) {
          const ingredient = await blink.db.ingredienti.get(ing.ingrediente_id);
          const lotto = await blink.db.lotti_ingredienti.get(ing.lotto_ingrediente_id);

          if (!ingredient) {
            results.push({
              type: 'error',
              message: `Ingrediente sconosciuto nel template per ${product?.nome}.`
            });
            continue;
          }

          if (ing.lotto_ingrediente_id) {
            if (!lotto) {
              results.push({
                type: 'warning',
                message: `Il lotto pre-selezionato per ${ingredient.nome} (${product?.nome}) non esiste più.`
              });
            } else {
              // Check expiry
              const expiry = lotto.data_scadenza;
              if (expiry && new Date(expiry) < now) {
                results.push({
                  type: 'warning',
                  message: `Il lotto ${lotto.codice_lotto} per ${ingredient.nome} è scaduto.`
                });
              }

              // Check quantity
              const currentQty = lotto.quantita_attuale;
              if (currentQty < ing.quantita_prevista) {
                results.push({
                  type: 'warning',
                  message: `Scorte insufficienti per il lotto ${lotto.codice_lotto} di ${ingredient.nome}.`
                });
              }
            }
          }
        }
      }

      setValidationResults(results);
      setStep('validate');
    } catch (error) {
      toast.error('Errore durante la validazione');
    } finally {
      setIsApplying(false);
    }
  }

  async function handleApply() {
    try {
      setIsApplying(true);
      setStep('applying');

      const template = templates.find(t => t.id === selectedTemplateId);
      const righe = await blink.db.produzione_template_righe.list({
        where: { template_id: selectedTemplateId }
      });

      const start = new Date(startDate);
      const end = new Date(endDate);
      const dates = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().split('T')[0]);
      }

      let createdCount = 0;
      let skippedCount = 0;

      for (const date of dates) {
        // Check if batches already exist for this date and template (simplified check)
        if (skipExisting) {
          const existing = await blink.db.lotti_produzione.list({
            where: { data_produzione: { gte: date + 'T00:00:00', lte: date + 'T23:59:59' }, generato_da_template_id: selectedTemplateId }
          });
          if (existing.length > 0) {
            skippedCount++;
            continue;
          }
        }

        for (const riga of righe) {
          // 1. Fetch recipe data for price freezing
          const product = await blink.db.prodotti.get(riga.prodotto_id);
          const recipe = await blink.db.ricette.get(riga.ricetta_id);
          
          if (!recipe) continue;

          // Create batch
          const batchRes = await blink.db.lotti_produzione.create({
            prodotto_id: riga.prodotto_id,
            ricetta_id: riga.ricetta_id,
            data_produzione: date + 'T08:00:00', // Standard time
            quantita_prodotta: riga.quantita_prevista,
            unita_resa: riga.unita_misura,
            generato_da_template_id: selectedTemplateId,
            note: `Generato da template ${template?.nome}`
          });

          // Fetch recipe ingredients
          const recipeIngs = await blink.db.ricetta_ingredienti.list({
            where: { ricetta_id: recipe.id }
          });

          // Get pre-selected ingredients from template riga
          const templateIngs = await blink.db.produzione_template_ingredienti.list({
            where: { riga_template_id: riga.id }
          });
          
          let totalCost = 0;
          for (const ri of recipeIngs) {
            const ing = await blink.db.ingredienti.get(ri.ingrediente_id);
            const prices = await blink.db.prezzi_storico.list({
              where: { ingrediente_id: ri.ingrediente_id },
              orderBy: { data_acquisto: 'desc' },
              limit: 1
            });
            
            const priceUsed = prices[0]?.prezzo_per_unita || 0;
            const qtyUsed = ri.quantita;
            const rowCost = priceUsed * qtyUsed;
            totalCost += rowCost;

            const templateIng = templateIngs.find(ti => ti.ingrediente_id === ri.ingrediente_id);
            
            await blink.db.lotti_produzione_dettagli.create({
              lotto_produzione_id: batchRes.id,
              ingrediente_id: ri.ingrediente_id,
              lotto_ingrediente_id: templateIng?.lotto_ingrediente_id || null,
              quantita_usata: qtyUsed,
              unita_misura: ri.unita_misura,
              prezzo_congelato: priceUsed,
              costo_riga: rowCost
            });

            // Deduct from lot if pre-selected
            if (templateIng?.lotto_ingrediente_id) {
              const lot = await blink.db.lotti_ingredienti.get(templateIng.lotto_ingrediente_id);
              if (lot) {
                await blink.db.lotti_ingredienti.update(lot.id, {
                  quantita_attuale: lot.quantita_attuale - qtyUsed
                });
              }
            }
          }

          // Update total cost
          await blink.db.lotti_produzione.update(batchRes.id, {
            costo_totale_batch: totalCost,
            costo_unitario: riga.quantita_prevista > 0 ? totalCost / riga.quantita_prevista : 0
          });

          createdCount++;
        }
      }

      await logAudit('apply_template', 'produzione_template', selectedTemplateId, { 
        startDate, 
        endDate, 
        createdCount, 
        skippedCount 
      });
      
      toast.success(`Template applicato: ${createdCount} lotti creati, ${skippedCount} giorni saltati.`);
      onSuccess();
    } catch (error) {
      console.error(error);
      toast.error('Errore durante l\'applicazione del template');
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Applica Template Produzione
          </DialogTitle>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Seleziona Template</Label>
              <select 
                className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                <option value="">Scegli...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Inizio</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data Fine</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="skip" 
                checked={skipExisting} 
                onCheckedChange={(checked) => setSkipExisting(!!checked)} 
              />
              <Label htmlFor="skip" className="text-sm font-normal">
                Salta giorni già compilati con questo template
              </Label>
            </div>
          </div>
        )}

        {step === 'validate' && (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-2xl space-y-3">
              <h4 className="font-bold flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Validazione completata
              </h4>
              {validationResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tutto pronto! Clicca su Procedi per creare i lotti.</p>
              ) : (
                <div className="space-y-2">
                  {validationResults.map((res, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>{res.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground italic">
              Verranno generati lotti per il periodo {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}.
            </p>
          </div>
        )}

        {step === 'applying' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-lg font-serif italic text-primary">Generazione lotti in corso...</p>
          </div>
        )}

        <DialogFooter>
          {step === 'config' && (
            <Button onClick={handleValidate} disabled={loading || !selectedTemplateId} className="w-full">
              Continua
            </Button>
          )}
          {step === 'validate' && (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setStep('config')} className="flex-1">Indietro</Button>
              <Button onClick={handleApply} className="flex-1">Procedi</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}