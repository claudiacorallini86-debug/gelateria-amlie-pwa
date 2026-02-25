import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ChefHat, 
  Euro, 
  Trash2, 
  Edit2,
  ChevronRight,
  Calculator
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';

import { toast } from 'sonner';
import { RecipeBuilder } from './RecipeBuilder';
import { logAudit } from '../lib/audit';

export interface Recipe {
  id: string;
  name: string;
  nome?: string;
  resaBatch: number;
  batchYield?: number;
  unitaResa: string;
  yieldUnit?: string;
  overheadPercent: number;
  prodottoId: string;
  costoIngredienti?: number;
  costoOverhead?: number;
  costoPerUnita?: number;
}

export interface RecipeIngredient {
  id: string;
  ricettaId: string;
  ingredienteId: string;
  quantita: number;
  unitaMisura: string;
}

export function RecipesPage() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);

  useEffect(() => {
    fetchRecipes();
  }, []);

  async function fetchRecipes() {
    try {
      setLoading(true);
      const data = await blink.db.ricette.list({
        orderBy: { name: 'asc' }
      });
      setRecipes(data);
    } catch (error) {
      toast.error('Errore nel caricamento delle ricette');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteRecipe(id: string) {
    if (!confirm('Sei sicuro di voler eliminare questa ricetta?')) return;
    try {
      // Delete recipe ingredients first (if not handled by DB cascades)
      const ingredients = await blink.db.ricetta_ingredienti.list({ where: { ricettaId: id } });
      for (const ing of ingredients) {
        await blink.db.ricetta_ingredienti.delete(ing.id);
      }
      
      await blink.db.ricette.delete(id);
      await logAudit('delete', 'recipe', id);
      toast.success('Ricetta eliminata');
      fetchRecipes();
    } catch (error) {
      toast.error('Errore nell\'eliminazione');
    }
  }

  const filteredRecipes = recipes.filter(r => 
    ((r.name ?? r.nome ?? '') as string).toLowerCase().includes(search.toLowerCase())
  );

  if (isBuilderOpen) {
    return (
      <RecipeBuilder 
        recipe={editingRecipe} 
        onClose={() => { setIsBuilderOpen(false); setEditingRecipe(null); fetchRecipes(); }} 
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Ricettario e Food Cost</h1>
          <p className="text-muted-foreground">Crea ricette e calcola il costo di produzione.</p>
        </div>
        <Button onClick={() => { setEditingRecipe(null); setIsBuilderOpen(true); }} className="gap-2">
          <Plus className="h-5 w-5" /> Nuova Ricetta
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          placeholder="Cerca ricetta..." 
          className="pl-10 h-12" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 glass rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => (
            <Card key={recipe.id} className="border-none shadow-elegant overflow-hidden group">
              <CardContent className="p-0">
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                      <ChefHat className="h-6 w-6" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingRecipe(recipe); setIsBuilderOpen(true); }}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRecipe(recipe.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold">{recipe.name}</h3>
                    <p className="text-sm text-muted-foreground">Resa: {recipe.resaBatch} {recipe.unitaResa}</p>
                  </div>

                  <div className="pt-4 border-t space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Ingredienti</p>
                        <p className="font-bold">€ {Number(recipe.costoIngredienti ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">+ Overhead</p>
                        <p className="font-bold">€ {Number(recipe.costoOverhead ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">per {recipe.unitaResa}</p>
                        <p className="font-bold text-primary">€ {Number(recipe.costoPerUnita ?? 0).toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Calculator className="h-4 w-4 text-primary" />
                        <span className="font-medium">Food Cost:</span>
                        <span className="text-primary font-bold italic">
                          € {Number(recipe.costoPerUnita ?? 0).toFixed(2)} / {recipe.unitaResa}
                        </span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-primary gap-1 p-0 hover:bg-transparent"
                        onClick={() => { setEditingRecipe(recipe); setIsBuilderOpen(true); }}
                      >
                        Dettagli <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
