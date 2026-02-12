import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Save, 
  Calculator, 
  Package, 
  Boxes,
  History,
  CheckCircle2,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';

interface IngredientBatchSelection {
  ingredientId: string;
  ingredientName: string;
  recipeQuantity: number;
  unit: string;
  selectedBatchId: string;
  availableBatches: any[];
  actualQuantityUsed: number;
}

export function NewProductionBatch({ onClose }: { onClose: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<any[]>([]);
  const [ingredientsInfo, setIngredientsInfo] = useState<Record<string, any>>({});
  const [batchesByIngredient, setBatchesByIngredient] = useState<Record<string, any[]>>({});
  const [selectedBatches, setSelectedBatches] = useState<Record<string, string>>({});
  
  const [quantity, setQuantity] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [batchSelections, setBatchSelections] = useState<IngredientBatchSelection[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const prodData = await blink.db.prodotti.list({ orderBy: { nome: 'asc' } });
      const recipeData = await blink.db.ricette.list();
      setProducts(prodData);
      setRecipes(recipeData);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    }
  }

  const handleProductChange = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    setSelectedProduct(product);
    
    // In our schema, ricette belongs to prodotto_id
    // Let's fetch the recipe for this product
    try {
      const recipeData = await blink.db.ricette.list({
        where: { prodottoId: productId },
        limit: 1
      });
      
      const recipe = recipeData[0];
      setSelectedRecipe(recipe);
      setQuantity(recipe?.resaBatch || 0);
      
      if (recipe) {
        // Fetch recipe ingredients
        const ri = await blink.db.ricetta_ingredienti.list({
          where: { ricettaId: recipe.id }
        });
        setRecipeIngredients(ri);

        // Fetch available batches and ingredient info
        const batches: Record<string, any[]> = {};
        const info: Record<string, any> = {};
        
        for (const item of ri) {
          // Get ingredient info
          const ing = await blink.db.ingredienti.get(item.ingredienteId);
          if (ing) info[item.ingredienteId] = ing;

          // Find batches with stock > 0
          const batchDetails = await blink.db.lotti_ingredienti.list({
            where: {
              AND: [
                { ingredienteId: item.ingredienteId },
                { quantitaAttuale: { gt: 0 } }
              ]
            },
            orderBy: { dataScadenza: 'asc' }
          });
          
          batches[item.ingredienteId] = batchDetails.map(b => ({
            ...b,
            stock: b.quantitaAttuale,
            unit: b.unitaMisura,
            batchCode: b.codiceLotto,
            expiryDate: b.dataScadenza
          }));
        }
        setIngredientsInfo(info);
        setBatchesByIngredient(batches);
      } else {
        setRecipeIngredients([]);
        setIngredientsInfo({});
      }
    } catch (error) {
      toast.error('Errore nel caricamento della ricetta');
    }
  };

  async function handleSave() {
    if (!selectedProduct || quantity <= 0) {
      toast.error('Completa tutti i campi');
      return;
    }

    // Check if all ingredients have a batch selected
    const missingBatches = recipeIngredients.filter(ri => !selectedBatches[ri.ingredienteId]);
    if (missingBatches.length > 0) {
      toast.error('Seleziona un lotto per ogni ingrediente');
      return;
    }

    try {
      setIsSaving(true);
      
      // 1. Create production batch (Lotto Produzione)
      const batchRes = await blink.db.lotti_produzione.create({
        prodottoId: selectedProduct.id,
        ricettaId: selectedRecipe.id,
        dataProduzione: new Date(date).toISOString(),
        quantitaProdotta: quantity,
        unitaResa: selectedProduct.unita_vendita,
        note: `Produzione di ${selectedProduct.nome}`
      });

      // 2. Process ingredients, freeze prices and deduct inventory
      let totalBatchCost = 0;
      
      for (const ri of recipeIngredients) {
        const ing = ingredientsInfo[ri.ingredienteId];
        const selectedBatchId = selectedBatches[ri.ingredienteId];
        
        // Get current price (frozen)
        const prices = await blink.db.prezzi_storico.list({
          where: { ingredienteId: ri.ingredienteId },
          orderBy: { dataAcquisto: 'desc' },
          limit: 1
        });
        
        const priceUsed = prices[0]?.prezzoPerUnita || 0;
        const qtyNeeded = (ri.quantita / selectedRecipe.resaBatch) * quantity;
        const rowCost = priceUsed * qtyNeeded;
        totalBatchCost += rowCost;

        // Save frozen detail
        await blink.db.lotti_produzione_dettagli.create({
          lottoProduzioneId: batchRes.id,
          ingredienteId: ri.ingredienteId,
          lottoIngredienteId: selectedBatchId,
          quantitaUsata: qtyNeeded,
          unitaMisura: ri.unitaMisura,
          prezzoCongelato: priceUsed,
          costoRiga: rowCost
        });

        // Deduct from lot inventory
        const lot = await blink.db.lotti_ingredienti.get(selectedBatchId);
        if (lot) {
          await blink.db.lotti_ingredienti.update(selectedBatchId, {
            quantitaAttuale: lot.quantitaAttuale - qtyNeeded
          });
        }

        // Create inventory movement
        await blink.db.movimenti_magazzino.create({
          ingredienteId: ri.ingredienteId,
          tipo: 'scarico',
          quantita: qtyNeeded,
          unitaMisura: ri.unitaMisura,
          lottoId: selectedBatchId,
          causale: `Produzione lotto #${batchRes.id.slice(-6).toUpperCase()}`
        });
      }

      // Update total cost in production batch
      await blink.db.lotti_produzione.update(batchRes.id, {
        costoTotaleBatch: totalBatchCost,
        costoUnitario: totalBatchCost / quantity
      });
      
      await logAudit('create', 'lotto_produzione', batchRes.id, { productId: selectedProduct.id, quantity });
      toast.success('Produzione registrata con successo');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Errore nel salvataggio della produzione');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-3xl font-serif">Nuova Produzione</h1>
      </div>

      <div className="max-w-2xl mx-auto space-y-6 pb-20">
        <Card className="border-none shadow-elegant">
          <CardHeader>
            <CardTitle>Configurazione Batch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Prodotto Finito</Label>
              <select 
                className="w-full h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm"
                onChange={(e) => handleProductChange(e.target.value)}
                required
              >
                <option value="">Seleziona prodotto...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>

            {selectedRecipe && (
              <div className="space-y-4">
                <div className="p-4 bg-secondary/50 rounded-xl flex items-center justify-between border border-primary/20">
                  <div className="flex items-center gap-3">
                    <History className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Ricetta Collegata</p>
                      <p className="font-bold">Resa Std: {selectedRecipe.resa_batch} {selectedRecipe.unita_resa}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Selezione Lotti Ingredienti</Label>
                  {recipeIngredients.map((ri) => {
                    const ingBatches = batchesByIngredient[ri.ingrediente_id] || [];
                    const ingredient = ingredientsInfo[ri.ingrediente_id];
                    
                    return (
                      <div key={ri.id} className="p-3 bg-background border rounded-xl space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">{ingredient?.nome || `Ingrediente #${ri.ingrediente_id.slice(-4)}`}</span>
                          <span className="text-xs text-muted-foreground">{ri.quantita} {ingredient?.unita_misura || ''}</span>
                        </div>
                        <select 
                          className="w-full h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs"
                          value={selectedBatches[ri.ingrediente_id] || ""}
                          onChange={(e) => setSelectedBatches(prev => ({ ...prev, [ri.ingrediente_id]: e.target.value }))}
                        >
                          <option value="">Seleziona lotto...</option>
                          {ingBatches.map(lot => (
                            <option key={lot.id} value={lot.id}>
                              {lot.codice_lotto} (Disp: {lot.quantita_attuale} {lot.unita_misura} - Scad: {new Date(lot.data_scadenza).toLocaleDateString('it-IT')})
                            </option>
                          ))}
                        </select>
                        {ingBatches.length === 0 && (
                          <p className="text-[10px] text-rose-500 font-bold">ATTENZIONE: Nessun lotto disponibile in magazzino!</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Produzione</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Quantità Prodotta ({selectedProduct?.unita_vendita || '?'})</Label>
                <Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
              </div>
            </div>

            <Button 
              className="w-full h-12 text-lg gap-2" 
              onClick={handleSave} 
              disabled={isSaving}
            >
              <Save className="h-5 w-5" /> {isSaving ? 'Registrazione...' : 'Concludi Produzione'}
            </Button>
          </CardContent>
        </Card>

        {selectedRecipe && (
          <Card className="border-none shadow-elegant bg-primary text-primary-foreground">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                <h4 className="font-bold uppercase tracking-wider text-sm">Costi Congelati per questo Batch</h4>
              </div>
              <p className="text-sm text-white/80">
                Il sistema salverà i prezzi correnti degli ingredienti. Anche se cambierai i prezzi in futuro, il costo di questo lotto rimarrà invariato per fini contabili.
              </p>
              <div className="pt-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span className="text-xs font-medium">Tracciabilità automatica abilitata</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
