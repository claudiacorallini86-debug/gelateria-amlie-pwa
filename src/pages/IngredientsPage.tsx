import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Euro, 
  Trash2, 
  Edit2,
  Camera,
  FileText,
  AlertCircle,
  Package
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
  DialogTrigger,
  DialogFooter
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';
import { OcrImporter } from '../components/OcrImporter';
import { cn } from '../lib/utils';

interface Ingredient {
  id: string;
  name: string;
  nome?: string; // Add fallback for DB field name
  category: string;
  supplier: string;
  unit: string;
  storageType: string;
  allergens: string; // JSON string array
  scortaMinima: number;
}

interface PriceRecord {
  id: string;
  ingredientId: string;
  date: string;
  supplier: string;
  pricePerUnit: number;
  invoiceRef: string;
}

interface LotRecord {
  id: string;
  codice_lotto: string;
  quantita_attuale: number;
  unita_misura: string;
  data_scadenza: string;
  fornitore: string;
}

export function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tutti');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  
  const [viewingPrices, setViewingPrices] = useState<Ingredient | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceRecord[]>([]);
  
  const [viewingLots, setViewingLots] = useState<Ingredient | null>(null);
  const [lotHistory, setLotHistory] = useState<LotRecord[]>([]);

  const [isPriceAddOpen, setIsPriceAddOpen] = useState(false);
  const [isOcrOpen, setIsOcrOpen] = useState(false);

  useEffect(() => {
    fetchIngredients();
  }, []);

  async function fetchIngredients() {
    try {
      setLoading(true);
      const data = await blink.db.ingredienti.list({
        orderBy: { nome: 'asc' }
      });
      setIngredients(data as any[]);
    } catch (error) {
      toast.error('Errore nel caricamento degli ingredienti');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveIngredient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      nome: formData.get('name') as string,
      categoria: formData.get('category') as string,
      fornitorePredefinito: formData.get('supplier') as string,
      unitaMisura: formData.get('unit') as string,
      conservazione: formData.get('storageType') as string,
      scortaMinima: Number(formData.get('scortaMinima')),
      allergeni: JSON.stringify(formData.get('allergens')?.toString().split(',').map(s => s.trim()) || [])
    };

    try {
      if (editingIngredient) {
        await blink.db.ingredienti.update(editingIngredient.id, data);
        await logAudit('update', 'ingrediente', editingIngredient.id, data);
        toast.success('Ingrediente aggiornato');
      } else {
        const res = await blink.db.ingredienti.create(data);
        await logAudit('create', 'ingrediente', res.id, data);
        toast.success('Ingrediente creato');
      }
      setIsAddOpen(false);
      setEditingIngredient(null);
      fetchIngredients();
    } catch (error) {
      toast.error('Errore nel salvataggio');
    }
  }

  async function handleDeleteIngredient(id: string) {
    if (!confirm('Sei sicuro di voler eliminare questo ingrediente?')) return;
    try {
      await blink.db.ingredienti.delete(id);
      await logAudit('delete', 'ingrediente', id);
      toast.success('Ingrediente eliminato');
      fetchIngredients();
    } catch (error) {
      toast.error('Errore nell\'eliminazione');
    }
  }

  async function fetchPriceHistory(ingredientId: string) {
    try {
      const data = await blink.db.prezzi_storico.list({
        where: { ingredienteId: ingredientId },
        orderBy: { dataAcquisto: 'desc' }
      });
      setPriceHistory(data as any[]);
    } catch (error) {
      toast.error('Errore nel caricamento dello storico prezzi');
    }
  }

  async function fetchLotHistory(ingredientId: string) {
    try {
      const data = await blink.db.lotti_ingredienti.list({
        where: { ingredienteId: ingredientId },
        orderBy: { dataScadenza: 'asc' }
      });
      setLotHistory(data as LotRecord[]);
    } catch (error) {
      toast.error('Errore nel caricamento dei lotti');
    }
  }

  async function handleSavePrice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!viewingPrices) return;

    const formData = new FormData(e.currentTarget);
    const data = {
      ingredienteId: viewingPrices.id,
      dataAcquisto: formData.get('date') as string,
      fornitore: formData.get('supplier') as string,
      prezzoPerUnita: Number(formData.get('pricePerUnit')),
      riferimentoDocumento: formData.get('invoiceRef') as string,
    };

    try {
      const res = await blink.db.prezzi_storico.create(data);
      await logAudit('create', 'prezzo_record', res.id, data);
      toast.success('Prezzo registrato');
      setIsPriceAddOpen(false);
      fetchPriceHistory(viewingPrices.id);
    } catch (error) {
      toast.error('Errore nella registrazione del prezzo');
    }
  }

  const filteredIngredients = ingredients.filter(ing => 
    ing.name.toLowerCase().includes(search.toLowerCase()) &&
    (categoryFilter === 'Tutti' || ing.category === categoryFilter)
  );

  const categories = ['Tutti', ...new Set(ingredients.map(ing => ing.category).filter(Boolean))];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Anagrafica Ingredienti</h1>
          <p className="text-muted-foreground">Gestisci le materie prime e monitora i prezzi.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingIngredient(null); setIsAddOpen(true); }} className="gap-2">
            <Plus className="h-5 w-5" /> Nuovo Ingrediente
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setIsOcrOpen(true)}>
            <Camera className="h-5 w-5" /> Importa da Foto
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input 
            placeholder="Cerca ingrediente..." 
            className="pl-10" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {categories.map(cat => (
            <Badge 
              key={cat}
              variant={categoryFilter === cat ? 'default' : 'outline'}
              className="cursor-pointer px-4 py-2 text-sm"
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 glass rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIngredients.map((ing) => (
            <Card key={ing.id} className="border-none shadow-elegant overflow-hidden group">
              <CardContent className="p-0">
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge variant="secondary" className="mb-2">{ing.category}</Badge>
                      <h3 className="text-xl font-bold">{ing.name}</h3>
                      <p className="text-sm text-muted-foreground">{ing.supplier}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingIngredient(ing); setIsAddOpen(true); }}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteIngredient(ing.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unità</p>
                      <p className="font-medium">{ing.unit}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Conservazione</p>
                      <Badge variant="outline" className="capitalize">{ing.storageType}</Badge>
                    </div>
                  </div>

                  <div className="pt-4 border-t flex items-center justify-between">
                    <div className="flex gap-4">
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 text-primary font-medium gap-1 hover:bg-transparent text-xs"
                        onClick={() => { setViewingPrices(ing); fetchPriceHistory(ing.id); }}
                      >
                        <Euro className="h-3 w-3" /> Prezzi
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 text-primary font-medium gap-1 hover:bg-transparent text-xs"
                        onClick={() => { setViewingLots(ing); fetchLotHistory(ing.id); }}
                      >
                        <Package className="h-3 w-3" /> Lotti
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-bold">
                      Scorta Minima: {ing.scortaMinima} {ing.unit}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Ingredient Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingIngredient ? 'Modifica Ingrediente' : 'Nuovo Ingrediente'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveIngredient} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">Nome Ingrediente</Label>
                <Input id="name" name="name" defaultValue={editingIngredient?.name} required placeholder="es. Pistacchio di Bronte" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Input id="category" name="category" defaultValue={editingIngredient?.category} placeholder="es. Frutta Secca" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier">Fornitore Predefinito</Label>
                <Input id="supplier" name="supplier" defaultValue={editingIngredient?.supplier} placeholder="es. Rossi Srl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unità di Misura</Label>
                <Input id="unit" name="unit" defaultValue={editingIngredient?.unit} required placeholder="kg, L, pz..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storageType">Conservazione</Label>
                <select name="storageType" id="storageType" defaultValue={editingIngredient?.storageType || 'secco'} className="w-full h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm">
                  <option value="secco">Secco (Ambiente)</option>
                  <option value="frigo">Frigo (+4°C)</option>
                  <option value="freezer">Freezer (-18°C)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scortaMinima">Scorta Minima</Label>
                <Input id="scortaMinima" name="scortaMinima" type="number" step="0.01" defaultValue={editingIngredient?.scortaMinima} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allergens">Allergeni (separati da virgola)</Label>
                <Input id="allergens" name="allergens" defaultValue={editingIngredient ? JSON.parse(editingIngredient.allergens).join(', ') : ''} placeholder="es. latte, glutine" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full sm:w-auto">Salva Ingrediente</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={!!viewingPrices} onOpenChange={() => setViewingPrices(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Storico Prezzi: {viewingPrices?.name || viewingPrices?.nome}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h4 className="font-bold">Registrazioni Recenti</h4>
              <Button size="sm" onClick={() => setIsPriceAddOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Aggiungi Prezzo
              </Button>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase">Fornitore</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase">Prezzo/Unità</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase">Rif. Doc</th>
                    <th className="px-2 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nessun record trovato</td>
                    </tr>
                  ) : (
                    priceHistory.map((price: any) => (
                      <tr key={price.id} className="border-t group/row">
                        <td className="px-4 py-3">{new Date(price.data_acquisto).toLocaleDateString('it-IT')}</td>
                        <td className="px-4 py-3 font-medium">{price.fornitore}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary">€ {price.prezzo_per_unita.toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{price.riferimento_documento}</td>
                        <td className="px-2 py-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={async () => {
                            if (!confirm('Eliminare questo record prezzo?')) return;
                            try {
                              await blink.db.prezzi_storico.delete(price.id);
                              await logAudit('delete', 'prezzo_record', price.id);
                              toast.success('Record eliminato');
                              if (viewingPrices) fetchPriceHistory(viewingPrices.id);
                            } catch { toast.error('Errore nell\'eliminazione'); }
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lot History Dialog */}
      <Dialog open={!!viewingLots} onOpenChange={() => setViewingLots(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Lotti in Magazzino: {viewingLots?.name || viewingLots?.nome}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] uppercase">Codice Lotto</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase">Fornitore</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase">Giacenza</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase">Scadenza</th>
                    <th className="px-2 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lotHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nessun lotto trovato</td>
                    </tr>
                  ) : (
                    lotHistory.map((lot) => (
                      <tr key={lot.id} className={cn("border-t", Number(lot.quantita_attuale) === 0 && "opacity-50")}>
                        <td className="px-4 py-3 font-mono font-bold text-primary">{lot.codice_lotto}</td>
                        <td className="px-4 py-3">{lot.fornitore}</td>
                        <td className="px-4 py-3 text-right font-black italic">
                          {Number(lot.quantita_attuale).toFixed(2)} <span className="text-[10px] font-normal not-italic">{lot.unita_misura}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {new Date(lot.data_scadenza).toLocaleDateString('it-IT')}
                            {new Date(lot.data_scadenza) < new Date() && <AlertCircle className="h-3 w-3 text-rose-500" />}
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={async () => {
                            if (!confirm('Eliminare questo lotto?')) return;
                            try {
                              await blink.db.lotti_ingredienti.delete(lot.id);
                              await logAudit('delete', 'lotto_ingrediente', lot.id);
                              toast.success('Lotto eliminato');
                              if (viewingLots) fetchLotHistory(viewingLots.id);
                            } catch { toast.error('Errore nell\'eliminazione'); }
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* OCR Importer */}
      <OcrImporter 
        isOpen={isOcrOpen} 
        onClose={() => setIsOcrOpen(false)} 
        onImported={() => fetchIngredients()} 
      />
    </div>
  );
}
