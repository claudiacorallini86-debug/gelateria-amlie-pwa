import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Calculator, 
  Save,
  Search,
  Package
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';
import type { Recipe } from './RecipesPage';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  latestPrice?: number;
}

interface LotOption {
  id: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  unit: string;
}

function safe(val: any): string {
  return (val ?? '').toString();
}

export function RecipeBuilder({ recipe, onClose }: { recipe: Recipe | null, onClose: () => void }) {
  const [name, setName] = useState(recipe?.name || recipe?.nome || '');
  const [batchYield, setBatchYield] = useState(recipe?.batchYield || recipe?.resaBatch || 1);
  const [yieldUnit, setYieldUnit] = useState(recipe?.yieldUnit || recipe?.unitaResa || 'kg');
  const [overheadPercent, setOverheadPercent] = useState(recipe?.overheadPercent || 0);
  
  const [selectedIngredients, setSelectedIngredients] = useState<any[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
  const [ingredientLots, setIngredientLots] = useState<Record<string, LotOption[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const ings = await blink.db.ingredienti.list() as any[];
      
      const ingsWithPrices = await Promise.all(ings.map(async (ing) => {
        const prices = await blink.db.prezzi_storico.list({
          where: { ingredienteId: ing.id },
          orderBy: { dataAcquisto: 'desc' },
          limit: 1
        });
        return {
          ...ing,
          name: safe(ing.nome),
          unit: safe(ing.unitaMisura || ing.unita_misura),
          latestPrice: prices[0]?.prezzoPerUnita ?? prices[0]?.prezzo_per_unita ?? 0
        };
      }));
      setAvailableIngredients(ingsWithPrices);

      // Fetch lots for all ingredients
      const lotsMap: Record<string, LotOption[]> = {};
      await Promise.all(ings.map(async (ing) => {
        try {
          const lots = await blink.db.ingredientLots.list({
            where: { ingredientId: ing.id },
            orderBy: { createdAt: 'desc' }
          }) as any[];
          if (lots.length > 0) {
            lotsMap[ing.id] = lots.map(l => ({
              id: l.id,
              lotNumber: safe(l.lotNumber ?? l.lot_number),
              expiryDate: safe(l.expiryDate ?? l.expiry_date),
              quantity: Number(l.quantity ?? 0),
              unit: safe(l.unit),
            }));
          }
        } catch {
          // no lots for this ingredient
        }
      }));
      setIngredientLots(lotsMap);

      // If editing, fetch recipe ingredients
      if (recipe) {
        const recipeIngs = await blink.db.ricetta_ingredienti.list({
          where: { ricettaId: recipe.id }
        });
        const mapped = recipeIngs.map((ri: any) => {
          const ing = ingsWithPrices.find(i => i.id === (ri.ingredienteId ?? ri.ingrediente_id));
          return {
            id: ri.id,
            ingredientId: ri.ingredienteId ?? ri.ingrediente_id,
            quantity: ri.quantita ?? ri.quantity,
            name: ing?.name || 'Sconosciuto',
            unit: safe(ri.unitaMisura ?? ri.unita_misura ?? ing?.unit),
            price: Number(ing?.latestPrice ?? 0),
            selectedLotId: '',
          };
        });
        setSelectedIngredients(mapped);
      }
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    }
  }

  const addIngredient = (ing: Ingredient) => {
    if (selectedIngredients.some(si => si.ingredientId === ing.id)) {
      toast.error('Ingrediente già presente');
      return;
    }
    const lots = ingredientLots[ing.id] || [];
    setSelectedIngredients([...selectedIngredients, {
      ingredientId: ing.id,
      quantity: 1,
      name: ing.name,
      unit: ing.unit,
      price: ing.latestPrice || 0,
      selectedLotId: lots.length > 0 ? lots[0].id : '',
    }]);
  };

  const removeIngredient = (id: string) => {
    setSelectedIngredients(selectedIngredients.filter(si => si.ingredientId !== id));
  };

  const updateQuantity = (id: string, qty: number) => {
    setSelectedIngredients(selectedIngredients.map(si => 
      si.ingredientId === id ? { ...si, quantity: qty } : si
    ));
  };

  const updateSelectedLot = (ingredientId: string, lotId: string) => {
    setSelectedIngredients(selectedIngredients.map(si =>
      si.ingredientId === ingredientId ? { ...si, selectedLotId: lotId } : si
    ));
  };

  const totalCost = selectedIngredients.reduce((sum, si) => sum + (si.price * si.quantity), 0);
  const costWithOverhead = totalCost * (1 + (overheadPercent / 100));
  const costPerUnit = batchYield > 0 ? costWithOverhead / batchYield : 0;

  async function handleSave() {
    if (!name || selectedIngredients.length === 0) {
      toast.error('Completa i campi obbligatori');
      return;
    }

    try {
      setIsSaving(true);
      const recipeData: Record<string, any> = {
        name,
        resaBatch: batchYield,
        unitaResa: yieldUnit,
        overheadPercent,
        costoIngredienti: totalCost,
        costoOverhead: costWithOverhead,
        costoPerUnita: costPerUnit,
      };
      // Solo se prodottoId è un ID valido (non vuoto), lo includiamo
      // altrimenti la FK constraint fallisce
      if (recipe?.prodottoId) {
        recipeData.prodottoId = recipe.prodottoId;
      }

      let recipeId = recipe?.id;

      if (recipe) {
        await blink.db.ricette.update(recipe.id, recipeData);
        await logAudit('update', 'ricette', recipe.id, recipeData);
      } else {
        const res = await blink.db.ricette.create(recipeData);
        recipeId = res.id;
        await logAudit('create', 'ricette', res.id, recipeData);
      }

      // Handle ingredients - delete existing, then recreate all
      if (recipe) {
        const existing = await blink.db.ricetta_ingredienti.list({ where: { ricettaId: recipe.id } });
        for (const e of existing) {
          await blink.db.ricetta_ingredienti.delete(e.id);
        }
      }

      await Promise.all(selectedIngredients.map(si => 
        blink.db.ricetta_ingredienti.create({
          ricettaId: recipeId,
          ingredienteId: si.ingredientId,
          quantita: si.quantity,
          unitaMisura: si.unit
        })
      ));

      toast.success('Ricetta salvata con successo');
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Errore nel salvataggio');
    } finally {
      setIsSaving(false);
    }
  }

  const filteredAvailable = availableIngredients.filter(ing =>
    safe(ing.name).toLowerCase().includes(ingredientSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-3xl font-serif">{recipe ? 'Modifica Ricetta' : 'Nuova Ricetta'}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-elegant">
            <CardHeader>
              <CardTitle>Dettagli Base</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Ricetta</Label>
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="es. Gelato al Pistacchio"
                  className="h-12 text-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Resa Batch</Label>
                  <Input 
                    type="number" 
                    value={batchYield} 
                    onChange={(e) => setBatchYield(Number(e.target.value))} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unità Resa</Label>
                  <Input 
                    value={yieldUnit} 
                    onChange={(e) => setYieldUnit(e.target.value)} 
                    placeholder="kg, porzioni..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overhead % (energia, ecc.)</Label>
                  <Input 
                    type="number" 
                    value={overheadPercent} 
                    onChange={(e) => setOverheadPercent(Number(e.target.value))} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-elegant overflow-hidden">
            <CardHeader className="bg-secondary/30">
              <CardTitle>Ingredienti Selezionati</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-secondary/10">
                  <tr>
                    <th className="px-6 py-3 text-left">Ingrediente</th>
                    <th className="px-6 py-3 text-left">Lotto</th>
                    <th className="px-6 py-3 text-left">Quantità</th>
                    <th className="px-6 py-3 text-right">Costo Unit.</th>
                    <th className="px-6 py-3 text-right">Totale</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedIngredients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground italic">
                        Nessun ingrediente aggiunto. Selezionane uno dalla lista a destra.
                      </td>
                    </tr>
                  ) : (
                    selectedIngredients.map((si) => {
                      const lots = ingredientLots[si.ingredientId] || [];
                      const selectedLot = lots.find(l => l.id === si.selectedLotId);
                      return (
                        <tr key={si.ingredientId} className="hover:bg-secondary/5 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold">{safe(si.name)}</p>
                            <p className="text-xs text-muted-foreground">per {safe(si.unit)}</p>
                          </td>
                          <td className="px-6 py-4">
                            {lots.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">Nessun lotto</span>
                            ) : lots.length === 1 ? (
                              <div className="text-xs">
                                <Badge variant="outline" className="gap-1">
                                  <Package className="h-3 w-3" />
                                  {lots[0].lotNumber}
                                </Badge>
                                {lots[0].expiryDate && (
                                  <p className="text-muted-foreground mt-1">
                                    Scad: {new Date(lots[0].expiryDate).toLocaleDateString('it-IT')}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div>
                                <select
                                  value={si.selectedLotId}
                                  onChange={(e) => updateSelectedLot(si.ingredientId, e.target.value)}
                                  className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs"
                                >
                                  <option value="">Seleziona lotto...</option>
                                  {lots.map(l => (
                                    <option key={l.id} value={l.id}>
                                      {l.lotNumber} — Scad: {l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('it-IT') : 'N/D'} ({l.quantity} {l.unit})
                                    </option>
                                  ))}
                                </select>
                                {selectedLot && (
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Disponibile: {selectedLot.quantity} {selectedLot.unit}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 max-w-[120px]">
                              <Input 
                                type="number" 
                                value={si.quantity} 
                                onChange={(e) => updateQuantity(si.ingredientId, Number(e.target.value))}
                                className="h-8"
                              />
                              <span className="text-xs font-medium">{safe(si.unit)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right text-sm">€ {Number(si.price ?? 0).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right font-bold">€ {(Number(si.price ?? 0) * Number(si.quantity ?? 0)).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive h-8 w-8"
                              onClick={() => removeIngredient(si.ingredientId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="border-none shadow-elegant bg-primary text-primary-foreground overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2">
                <Calculator className="h-5 w-5" /> Riepilogo Costi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-white/70 uppercase">Costo Ingredienti</p>
                <p className="text-2xl font-bold italic">€ {totalCost.toFixed(2)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-white/70 uppercase">Costo con Overhead ({overheadPercent}%)</p>
                <p className="text-xl font-bold italic text-accent">€ {costWithOverhead.toFixed(2)}</p>
              </div>
              <div className="pt-4 border-t border-white/20">
                <p className="text-xs text-white/70 uppercase">Costo per {yieldUnit}</p>
                <p className="text-3xl font-black italic">€ {costPerUnit.toFixed(2)}</p>
              </div>
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="w-full bg-white text-primary hover:bg-white/90 gap-2 h-12 text-lg shadow-lg mt-4"
              >
                <Save className="h-5 w-5" /> {isSaving ? 'Salvataggio...' : 'Salva Ricetta'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-none shadow-elegant h-[400px] flex flex-col">
            <CardHeader className="shrink-0">
              <CardTitle className="text-lg">Aggiungi Ingredienti</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Cerca..." 
                  className="pl-8 h-9 text-xs" 
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pt-0">
              <div className="space-y-1">
                {filteredAvailable.map((ing) => {
                  const lots = ingredientLots[ing.id] || [];
                  const latestLot = lots[0];
                  return (
                    <button
                      key={ing.id}
                      onClick={() => addIngredient(ing)}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 text-left transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-bold group-hover:text-primary transition-colors">{safe(ing.name)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">€ {Number(ing.latestPrice ?? 0).toFixed(2)} / {safe(ing.unit)}</p>
                        {latestLot && (
                          <p className="text-[10px] text-primary/70 flex items-center gap-1 mt-0.5">
                            <Package className="h-2.5 w-2.5" />
                            Lotto: {latestLot.lotNumber}
                            {latestLot.expiryDate && ` — Scad: ${new Date(latestLot.expiryDate).toLocaleDateString('it-IT')}`}
                          </p>
                        )}
                      </div>
                      <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
