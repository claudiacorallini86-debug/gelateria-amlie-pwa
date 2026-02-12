import React, { useState, useEffect } from 'react';
import { 
  IceCream, 
  Plus, 
  Search, 
  Trash2, 
  Edit2,
  ChevronRight,
  Utensils
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';

interface Product {
  id: string;
  name: string;
  type: string;
  saleUnit: string;
  salePrice: number;
  recipeId: string;
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const prodData = await blink.db.prodotti.list({ orderBy: { nome: 'asc' } });
      const recipeData = await blink.db.ricette.list();
      setProducts(prodData as Product[]);
      setRecipes(recipeData);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      nome: formData.get('name') as string,
      tipo: formData.get('type') as string,
      unitaVendita: formData.get('saleUnit') as string,
      prezzoVendita: Number(formData.get('salePrice')),
      recipeId: formData.get('recipeId') as string,
    };

    try {
      if (editingProduct) {
        await blink.db.prodotti.update(editingProduct.id, data);
        await logAudit('update', 'product', editingProduct.id, data);
        toast.success('Prodotto aggiornato');
      } else {
        const res = await blink.db.prodotti.create(data);
        await logAudit('create', 'product', res.id, data);
        toast.success('Prodotto creato');
      }
      setIsAddOpen(false);
      setEditingProduct(null);
      fetchData();
    } catch (error) {
      toast.error('Errore nel salvataggio');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Sei sicuro di voler eliminare questo prodotto?')) return;
    try {
      await blink.db.prodotti.delete(id);
      await logAudit('delete', 'product', id);
      toast.success('Prodotto eliminato');
      fetchData();
    } catch (error) {
      toast.error('Errore nell\'eliminazione');
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Anagrafica Prodotti</h1>
          <p className="text-muted-foreground">Gestisci i prodotti finiti della gelateria.</p>
        </div>
        <Button onClick={() => { setEditingProduct(null); setIsAddOpen(true); }} className="gap-2">
          <Plus className="h-5 w-5" /> Nuovo Prodotto
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 glass rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <Card key={product.id} className="border-none shadow-elegant overflow-hidden group">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-secondary rounded-2xl text-secondary-foreground font-bold italic">
                    {product.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingProduct(product); setIsAddOpen(true); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Badge variant="outline" className="mb-2 uppercase text-[10px] tracking-widest">{product.type}</Badge>
                  <h3 className="text-xl font-bold">{product.name}</h3>
                  <p className="text-sm text-muted-foreground">Unità: {product.saleUnit}</p>
                </div>

                <div className="pt-4 border-t flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Prezzo Vendita: </span>
                    <span className="font-bold text-primary">€ {product.salePrice.toFixed(2)}</span>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Utensils className="h-3 w-3" /> {recipes.find(r => r.id === product.recipeId)?.name || 'Nessuna Ricetta'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Modifica Prodotto' : 'Nuovo Prodotto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Prodotto</Label>
              <Input name="name" defaultValue={editingProduct?.name} required placeholder="es. Gusto Crema" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select name="type" defaultValue={editingProduct?.type || 'Gelato'} className="w-full h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm">
                  <option value="Gelato">Gusto Gelato</option>
                  <option value="Semifreddo">Semifreddo</option>
                  <option value="Torta">Torta</option>
                  <option value="Crepes">Crepes</option>
                  <option value="Topping">Topping</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Unità Vendita</Label>
                <select name="saleUnit" defaultValue={editingProduct?.saleUnit || 'kg'} className="w-full h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm">
                  <option value="kg">al kg</option>
                  <option value="porzione">a porzione</option>
                  <option value="pezzo">a pezzo</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prezzo Vendita (€)</Label>
                <Input name="salePrice" type="number" step="0.01" defaultValue={editingProduct?.salePrice} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Ricetta Collegata</Label>
                <select name="recipeId" defaultValue={editingProduct?.recipeId || ''} className="w-full h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm">
                  <option value="">Seleziona ricetta...</option>
                  {recipes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Salva Prodotto</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
