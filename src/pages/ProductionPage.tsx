import React, { useState, useEffect } from 'react';
import { 
  Factory, 
  Plus, 
  Search, 
  Calendar, 
  History, 
  ChevronRight, 
  FileDown,
  Calculator,
  IceCream,
  Trash2,
  Layout,
  Settings
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { NewProductionBatch } from './NewProductionBatch';
import { ProductionTemplatesPage } from './ProductionTemplatesPage';
import { ApplyTemplateModal } from '../components/ApplyTemplateModal';
import { logAudit } from '../lib/audit';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface ProductionBatch {
  id: string;
  prodotto_id: string;
  data_produzione: string;
  quantita_prodotta: number;
  unita_resa: string;
  costo_totale_batch: number;
  costo_unitario: number;
  generato_da_template_id?: string;
  product?: {
    nome: string;
    tipo: string;
  }
}

export function ProductionPage() {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewBatchOpen, setIsNewBatchOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<any>(null);

  useEffect(() => {
    fetchBatches();
  }, []);

  async function fetchBatches() {
    try {
      setLoading(true);
      const data = await blink.db.lotti_produzione.list({
        orderBy: { data_produzione: 'desc' }
      });
      
      const products = await blink.db.prodotti.list();
      
      const mapped = data.map((b: any) => ({
        ...b,
        product: products.find(p => p.id === b.prodotto_id)
      }));

      setBatches(mapped);
    } catch (error) {
      toast.error('Errore nel caricamento delle produzioni');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBatch(id: string) {
    if (!confirm('Sei sicuro di voler eliminare questo lotto di produzione?')) return;
    try {
      // Delete details first
      const details = await blink.db.lotti_produzione_dettagli.list({ where: { lotto_produzione_id: id } });
      for (const d of details) {
        await blink.db.lotti_produzione_dettagli.delete(d.id);
      }
      
      await blink.db.lotti_produzione.delete(id);
      await logAudit('delete', 'lotto_produzione', id);
      toast.success('Lotto eliminato');
      fetchBatches();
    } catch (error) {
      toast.error('Errore nell\'eliminazione');
    }
  }

  async function fetchBatchDetails(id: string) {
    try {
      const details = await blink.db.lotti_produzione_dettagli.list({
        where: { lotto_produzione_id: id }
      });
      
      const ingredients = await Promise.all(details.map(async (d: any) => {
        const lot = d.lotto_ingrediente_id ? await blink.db.lotti_ingredienti.get(d.lotto_ingrediente_id) : null;
        const ing = await blink.db.ingredienti.get(d.ingrediente_id);
        return {
          ...d,
          batchCode: lot?.codice_lotto || 'N/D',
          ingredientName: ing?.nome || 'Sconosciuto'
        };
      }));
      
      setSelectedBatchDetails(ingredients);
    } catch (error) {
      toast.error('Errore nel caricamento dei dettagli');
    }
  }

  const exportTraceabilityPDF = async (batch: ProductionBatch) => {
    const doc = new jsPDF() as any;
    
    // Header
    doc.setFontSize(20);
    doc.text('Report Tracciabilità Lotto Produzione', 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Prodotto: ${batch.product?.nome || 'N/D'}`, 14, 30);
    doc.text(`Lotto Produzione: ${batch.id.slice(-6).toUpperCase()}`, 14, 37);
    doc.text(`Data Produzione: ${new Date(batch.data_produzione).toLocaleDateString('it-IT')}`, 14, 44);
    doc.text(`Resa: ${batch.quantita_prodotta} ${batch.unita_resa}`, 14, 51);
    doc.text(`Costo Unitario: € ${batch.costo_unitario?.toFixed(2)}`, 14, 58);

    // Fetch details for the PDF
    const details = await blink.db.lotti_produzione_dettagli.list({
      where: { lotto_produzione_id: batch.id }
    });
    
    const rows = await Promise.all(details.map(async (d: any) => {
      const ing = await blink.db.ingredienti.get(d.ingrediente_id);
      const lot = d.lotto_ingrediente_id ? await blink.db.lotti_ingredienti.get(d.lotto_ingrediente_id) : null;
      return [
        ing?.nome || 'Sconosciuto',
        lot?.codice_lotto || 'N/D',
        `${d.quantita_usata} ${d.unita_misura}`,
        `€ ${d.prezzo_congelato.toFixed(2)}`,
        `€ ${d.costo_riga.toFixed(2)}`
      ];
    }));

    doc.autoTable({
      head: [['Ingrediente', 'Lotto Origine', 'Quantità', 'Prezzo Un.', 'Costo Riga']],
      body: rows,
      startY: 70,
      theme: 'striped',
      headStyles: { fillColor: [217, 119, 6] }
    });

    doc.save(`tracciabilita_${batch.id.slice(-6).toUpperCase()}.pdf`);
  };

  if (isNewBatchOpen) {
    return <NewProductionBatch onClose={() => { setIsNewBatchOpen(false); fetchBatches(); }} />;
  }

  if (isTemplatesOpen) {
    return <ProductionTemplatesPage onClose={() => { setIsTemplatesOpen(false); fetchBatches(); }} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Produzione e Tracciabilità</h1>
          <p className="text-muted-foreground">Registra i lotti di produzione e congela i costi.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsTemplatesOpen(true)} className="gap-2">
            <Layout className="h-4 w-4" /> Gestisci Template
          </Button>
          <Button variant="outline" onClick={() => setIsApplyModalOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" /> Applica Template
          </Button>
          <Button onClick={() => setIsNewBatchOpen(true)} className="gap-2">
            <Plus className="h-5 w-5" /> Nuova Produzione
          </Button>
        </div>
      </div>

      {isApplyModalOpen && (
        <ApplyTemplateModal 
          onClose={() => setIsApplyModalOpen(false)} 
          onSuccess={() => { setIsApplyModalOpen(false); fetchBatches(); }} 
        />
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 glass rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {batches.length === 0 ? (
            <div className="text-center py-20 glass rounded-2xl border-dashed">
              <IceCream className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nessun lotto di produzione registrato.</p>
            </div>
          ) : (
            batches.map((batch) => (
              <Card key={batch.id} className="border-none shadow-elegant overflow-hidden group">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                        <Factory className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-lg">{batch.product?.nome || 'Prodotto Sconosciuto'}</h3>
                          <Badge variant="secondary" className="text-[10px] uppercase">{batch.product?.tipo}</Badge>
                          {batch.generato_da_template_id && (
                            <Badge variant="outline" className="text-[10px] uppercase bg-primary/5 text-primary border-primary/20">Template</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(batch.data_produzione).toLocaleDateString('it-IT')}</span>
                          <span className="font-medium text-foreground">Lotto #{batch.id.slice(-6).toUpperCase()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resa Effettiva</p>
                        <p className="text-xl font-black italic text-primary">
                          {batch.quantita_prodotta.toFixed(2)} <span className="text-sm font-normal not-italic">{batch.unita_resa}</span>
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Costo Unitario</p>
                        <p className="font-bold text-primary">
                          € {batch.costo_unitario?.toFixed(2)}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => fetchBatchDetails(batch.id)}>
                          <History className="h-4 w-4" /> Dettagli
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => exportTraceabilityPDF(batch)}>
                          <FileDown className="h-4 w-4" /> PDF
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteBatch(batch.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Batch Details Dialog */}
      <Dialog open={!!selectedBatchDetails} onOpenChange={() => setSelectedBatchDetails(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tracciabilità Lotto Produzione</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              <p className="text-sm font-medium border-b pb-2">Ingredienti Utilizzati:</p>
              {selectedBatchDetails?.map((d: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border">
                  <div>
                    <p className="font-bold text-sm">{d.ingredientName}</p>
                    <p className="text-[10px] text-primary uppercase font-medium">Lotto: {d.batchCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black italic">{d.quantityUsed} {d.unit}</p>
                  </div>
                </div>
              ))}
              {selectedBatchDetails?.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm italic">
                  Nessun dettaglio tracciabilità trovato per questo lotto.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setSelectedBatchDetails(null)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
