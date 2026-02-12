import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Calculator, 
  Euro, 
  Save,
  Search,
  CheckCircle2
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';
import type { Recipe, RecipeIngredient } from './RecipesPage';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  latestPrice?: number;
}

export function RecipeBuilder({ recipe, onClose }: { recipe: Recipe | null, onClose: () => void }) {
  const [name, setName] = useState(recipe?.name || '');
  const [batchYield, setBatchYield] = useState(recipe?.batchYield || 1);
  const [yieldUnit, setYieldUnit] = useState(recipe?.yieldUnit || 'kg');
  const [overheadPercent, setOverheadPercent] = useState(recipe?.overheadPercent || 0);
  
  const [selectedIngredients, setSelectedIngredients] = useState<any[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // 1. Fetch all ingredients
      const ings = await blink.db.ingredienti.list() as any[];
      
      // 2. For each ingredient, get latest price
      const ingsWithPrices = await Promise.all(ings.map(async (ing) => {
        const prices = await blink.db.prezzi_storico.list({
          where: { ingredienteId: ing.id },
          orderBy: { dataAcquisto: 'desc' },
          limit: 1
        });
        return {
          ...ing,
          name: ing.nome,
          unit: ing.unitaMisura,
          latestPrice: prices[0]?.prezzoPerUnita || 0
        };
      }));
      setAvailableIngredients(ingsWithPrices);

      // 3. If editing, fetch recipe ingredients
      if (recipe) {
        const recipeIngs = await blink.db.ricetta_ingredienti.list({
          where: { ricettaId: recipe.id }
        });
        const mapped = recipeIngs.map((ri: any) => {
          const ing = ingsWithPrices.find(i => i.id === ri.ingredienteId);
          return {
            id: ri.id,
            ingredientId: ri.ingredienteId,
            quantity: ri.quantita,
            name: ing?.name || 'Sconosciuto',
            unit: ri.unitaMisura || ing?.unit || '?',
            price: ing?.latestPrice || 0
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
    setSelectedIngredients([...selectedIngredients, {
      ingredientId: ing.id,
      quantity: 1,
      name: ing.name,
      unit: ing.unit,
      price: ing.latestPrice || 0
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
      const recipeData = {
        name,
        resaBatch: batchYield,
        unitaResa: yieldUnit,
        overheadPercent,
        prodottoId: recipe?.prodottoId || '' // We should ideally select a product
      };

      let recipeId = recipe?.id;

      if (recipe) {
        await blink.db.ricette.update(recipe.id, recipeData);
        await logAudit('update', 'recipe', recipe.id, recipeData);
      } else {
        const res = await blink.db.ricette.create(recipeData);
        recipeId = res.id;
        await logAudit('create', 'recipe', res.id, recipeData);
      }

      // Handle ingredients (Simple way: delete and recreate)
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
      toast.error('Errore nel salvataggio');
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
                    <th className="px-6 py-3 text-left">Quantità</th>
                    <th className="px-6 py-3 text-right">Costo Unitario</th>
                    <th className="px-6 py-3 text-right">Totale</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedIngredients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic">
                        Nessun ingrediente aggiunto. Selezionane uno dalla lista a destra.
                      </td>
                    </tr>
                  ) : (
                    selectedIngredients.map((si) => (
                      <tr key={si.ingredientId} className="hover:bg-secondary/5 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold">{si.name}</p>
                          <p className="text-xs text-muted-foreground">per {si.unit}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 max-w-[120px]">
                            <Input 
                              type="number" 
                              value={si.quantity} 
                              onChange={(e) => updateQuantity(si.ingredientId, Number(e.target.value))}
                              className="h-8"
                            />
                            <span className="text-xs font-medium">{si.unit}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm">€ {si.price.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right font-bold">€ {(si.price * si.quantity).toFixed(2)}</td>
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
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Calculator & Add Ingredients */}
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
                <Input placeholder="Cerca..." className="pl-8 h-9 text-xs" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pt-0">
              <div className="space-y-1">
                {availableIngredients.map((ing) => (
                  <button
                    key={ing.id}
                    onClick={() => addIngredient(ing)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 text-left transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-bold group-hover:text-primary transition-colors">{ing.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">€ {ing.latestPrice?.toFixed(2)} / {ing.unit}</p>
                    </div>
                    <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
