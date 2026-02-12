import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  History, 
  Plus,
  AlertTriangle,
  ChevronRight,
  Boxes
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { BatchManagement } from './BatchManagement';
import { cn } from '../lib/utils';

interface StockLevel {
  id: string;
  name: string;
  nome?: string;
  unit: string;
  scortaMinima: number;
  currentQuantity: number;
}

export function WarehousePage() {
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isBatchOpen, setIsBatchOpen] = useState(false);

  useEffect(() => {
    fetchStock();
  }, []);

  async function fetchStock() {
    try {
      setLoading(true);
      // 1. Fetch ingredients
      const ingredients = await blink.db.ingredienti.list() as any[];
      
      // 2. Fetch all inventory movements
      const movements = await blink.db.movimenti_magazzino.list() as any[];

      // 3. Calculate current quantity for each
      const calculated = ingredients.map(ing => {
        const ingMovements = movements.filter(m => m.ingredienteId === ing.id);
        const qty = ingMovements.reduce((sum, m) => {
          return m.tipo === 'carico' ? sum + m.quantita : sum - m.quantita;
        }, 0);

        return {
          id: ing.id,
          name: ing.nome,
          unit: ing.unitaMisura,
          scortaMinima: ing.scortaMinima || 0,
          currentQuantity: qty
        };
      });

      setStock(calculated);
    } catch (error) {
      toast.error('Errore nel caricamento del magazzino');
    } finally {
      setLoading(false);
    }
  }

  const filteredStock = stock.filter(s => 
    (s.name ?? s.nome ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (isBatchOpen) {
    return <BatchManagement onClose={() => { setIsBatchOpen(false); fetchStock(); }} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Magazzino e Giacenze</h1>
          <p className="text-muted-foreground">Monitora le scorte e gestisci i carichi di merce.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsBatchOpen(true)} className="gap-2">
            <Plus className="h-5 w-5" /> Gestisci Lotti/Carichi
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          placeholder="Cerca ingrediente in magazzino..." 
          className="pl-10 h-12" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 glass rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredStock.map((item) => (
            <Card key={item.id} className="border-none shadow-elegant overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-3 rounded-2xl shadow-sm",
                      item.currentQuantity <= item.scortaMinima ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
                    )}>
                      <Package className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{item.name}</h3>
                      <div className="flex items-center gap-2">
                        {item.currentQuantity <= item.scortaMinima && (
                          <Badge variant="destructive" className="text-[10px] uppercase">Scorta Bassa</Badge>
                        )}
                        <p className="text-sm text-muted-foreground">Scorta minima: {item.scortaMinima} {item.unit}</p>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Giacenza Attuale</p>
                    <p className={cn(
                      "text-3xl font-black italic",
                      item.currentQuantity <= item.scortaMinima ? "text-rose-500" : "text-primary"
                    )}>
                      {item.currentQuantity.toFixed(2)} <span className="text-base font-normal not-italic">{item.unit}</span>
                    </p>
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
