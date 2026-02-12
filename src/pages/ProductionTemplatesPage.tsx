import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Copy, 
  Save, 
  Settings,
  Layout,
  ChevronRight,
  Package,
  History
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';

interface TemplateLine {
  id: string;
  prodottoId: string;
  ricettaId: string;
  quantitaPrevista: number;
  unitaMisura: string;
  note: string;
  product?: any;
  ingredienti?: any[];
}

interface Template {
  id: string;
  nome: string;
  descrizione: string;
  righe: TemplateLine[];
}

export function ProductionTemplatesPage({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const templateData = await blink.db.produzione_templates.list();
      const productsData = await blink.db.prodotti.list();
      const recipesData = await blink.db.ricette.list();
      
      const templatesWithRighe = await Promise.all(templateData.map(async (t: any) => {
        const righe = await blink.db.produzione_template_righe.list({
          where: { template_id: t.id }
        });
        
        const righeWithIngs = await Promise.all(righe.map(async (r: any) => {
          const ings = await blink.db.produzione_template_ingredienti.list({
            where: { riga_template_id: r.id }
          });
          return {
            ...r,
            product: productsData.find(p => p.id === r.prodotto_id),
            ingredienti: ings
          };
        }));

        return {
          ...t,
          righe: righeWithIngs
        };
      }));

      setTemplates(templatesWithRighe);
      setProducts(productsData);
      setRecipes(recipesData);
    } catch (error) {
      toast.error('Errore nel caricamento dei template');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTemplate(template: Partial<Template>) {
    if (!template.nome) {
      toast.error('Il nome del template è obbligatorio');
      return;
    }

    try {
      let templateId = template.id;
      if (templateId) {
        await blink.db.produzione_templates.update(templateId, {
          nome: template.nome,
          descrizione: template.descrizione,
          updated_at: new Date().toISOString()
        });
        
        // Delete old righe and recreate them (simpler than update)
        const oldRighe = await blink.db.produzione_template_righe.list({ where: { template_id: templateId } });
        for (const r of oldRighe) {
          await blink.db.produzione_template_righe.delete(r.id);
        }
      } else {
        const res = await blink.db.produzione_templates.create({
          nome: template.nome,
          descrizione: template.descrizione
        });
        templateId = res.id;
      }

      if (template.righe) {
        for (const r of template.righe) {
          const rigaRes = await blink.db.produzione_template_righe.create({
            templateId: templateId,
            prodottoId: r.prodottoId,
            ricettaId: r.ricettaId,
            quantitaPrevista: r.quantitaPrevista,
            unitaMisura: r.unitaMisura,
            note: r.note
          });

          if (r.ingredienti && r.ingredienti.length > 0) {
            for (const ing of r.ingredienti) {
              await blink.db.produzione_template_ingredienti.create({
                rigaTemplateId: rigaRes.id,
                ingredienteId: ing.ingredienteId,
                lottoIngredienteId: ing.lottoIngredienteId,
                quantitaPrevista: ing.quantitaPrevista
              });
            }
          }
        }
      }

      await logAudit(template.id ? 'update' : 'create', 'produzione_template', templateId);
      toast.success('Template salvato correttamente');
      setEditingTemplate(null);
      fetchData();
    } catch (error) {
      toast.error('Errore nel salvataggio');
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Sei sicuro di voler eliminare questo template?')) return;
    try {
      await blink.db.produzione_templates.delete(id);
      await logAudit('delete', 'produzione_template', id);
      toast.success('Template eliminato');
      fetchData();
    } catch (error) {
      toast.error('Errore nell\'eliminazione');
    }
  }

  async function handleDuplicateTemplate(template: Template) {
    try {
      const newTemplate = await blink.db.produzione_templates.create({
        nome: `${template.nome} (Copia)`,
        descrizione: template.descrizione
      });

      if (template.righe && template.righe.length > 0) {
        for (const r of template.righe) {
          const rigaRes = await blink.db.produzione_template_righe.create({
            templateId: newTemplate.id,
            prodottoId: r.prodottoId,
            ricettaId: r.ricettaId,
            quantitaPrevista: r.quantitaPrevista,
            unitaMisura: r.unitaMisura,
            note: r.note
          });

          if (r.ingredienti && r.ingredienti.length > 0) {
            await blink.db.produzione_template_ingredienti.createMany(
              r.ingredienti.map((ing: any) => ({
                rigaTemplateId: rigaRes.id,
                ingredienteId: ing.ingredienteId,
                lottoIngredienteId: ing.lottoIngredienteId,
                quantitaPrevista: ing.quantitaPrevista
              }))
            );
          }
        }
      }

      await logAudit('create', 'produzione_template', newTemplate.id, { duplicatedFrom: template.id });
      toast.success('Template duplicato');
      fetchData();
    } catch (error) {
      toast.error('Errore nella duplicazione');
    }
  }

  if (editingTemplate) {
    return (
      <TemplateEditor 
        template={editingTemplate} 
        products={products} 
        recipes={recipes}
        onSave={handleSaveTemplate}
        onCancel={() => setEditingTemplate(null)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-left duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-3xl font-serif">Template di Produzione</h1>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">Gestisci i modelli riutilizzabili per la tua produzione giornaliera.</p>
        <Button onClick={() => setEditingTemplate({ id: '', nome: '', descrizione: '', righe: [] })} className="gap-2">
          <Plus className="h-4 w-4" /> Nuovo Template
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-48 glass rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.length === 0 ? (
            <div className="col-span-full text-center py-20 glass rounded-2xl border-dashed">
              <Layout className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nessun template creato.</p>
              <Button variant="outline" className="mt-4" onClick={() => setEditingTemplate({ id: '', nome: '', descrizione: '', righe: [] })}>
                Crea il tuo primo template
              </Button>
            </div>
          ) : (
            templates.map(template => (
              <Card key={template.id} className="border-none shadow-elegant group relative overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl">{template.nome}</CardTitle>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicateTemplate(template)} title="Duplica">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteTemplate(template.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                    {template.descrizione || 'Nessuna descrizione.'}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Settings className="h-4 w-4" /> {template.righe.length} Righe
                    </span>
                    <Button variant="link" size="sm" onClick={() => setEditingTemplate(template)} className="gap-1 p-0">
                      Modifica <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template, products, recipes, onSave, onCancel }: any) {
  const [formData, setFormData] = useState(template);
  const [allIngredients, setAllIngredients] = useState<any[]>([]);
  const [allLotti, setAllLotti] = useState<any[]>([]);
  const [newLine, setNewLine] = useState({
    prodottoId: '',
    ricettaId: '',
    quantitaPrevista: 0,
    unitaMisura: '',
    note: '',
    ingredienti: [] as any[]
  });

  useEffect(() => {
    async function fetchIngredients() {
      const ings = await blink.db.ingredienti.list({ orderBy: { nome: 'asc' } });
      const lotti = await blink.db.lotti_ingredienti.list();
      setAllIngredients(ings);
      setAllLotti(lotti);
    }
    fetchIngredients();
  }, []);

  const addIngredientToLine = () => {
    setNewLine({
      ...newLine,
      ingredienti: [
        ...newLine.ingredienti,
        {
          id: Math.random().toString(36).substr(2, 9),
          ingredienteId: '',
          lottoIngredienteId: '',
          quantitaPrevista: 0
        }
      ]
    });
  };

  const updateIngredient = (index: number, field: string, value: any) => {
    const updated = [...newLine.ingredienti];
    updated[index] = { ...updated[index], [field]: value };
    setNewLine({ ...newLine, ingredienti: updated });
  };

  const removeIngredient = (index: number) => {
    setNewLine({
      ...newLine,
      ingredienti: newLine.ingredienti.filter((_, i) => i !== index)
    });
  };

  const addLine = () => {
    if (!newLine.prodottoId || newLine.quantitaPrevista <= 0) {
      toast.error('Seleziona prodotto e quantità');
      return;
    }

    const product = products.find((p: any) => p.id === newLine.prodottoId);
    setFormData({
      ...formData,
      righe: [
        ...formData.righe,
        {
          ...newLine,
          id: Math.random().toString(36).substr(2, 9),
          product
        }
      ]
    });
    setNewLine({
      prodottoId: '',
      ricettaId: '',
      quantitaPrevista: 0,
      unitaMisura: '',
      note: '',
      ingredienti: []
    });
  };

  const removeLine = (id: string) => {
    setFormData({
      ...formData,
      righe: formData.righe.filter((r: any) => r.id !== id)
    });
  };

  const handleProductChange = (productId: string) => {
    const product = products.find((p: any) => p.id === productId);
    if (product) {
      const recipe = recipes.find((r: any) => r.prodotto_id === product.id);
      setNewLine({
        ...newLine,
        prodottoId: productId,
        ricettaId: recipe?.id || '',
        unitaMisura: product.unita_vendita || '',
        quantitaPrevista: recipe?.resa_batch || 0
      });
    } else {
      setNewLine({ ...newLine, prodottoId: '', ricettaId: '', unitaMisura: '' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-3xl font-serif">{template.id ? 'Modifica Template' : 'Nuovo Template'}</h1>
        </div>
        <Button onClick={() => onSave(formData)} className="gap-2">
          <Save className="h-4 w-4" /> Salva Template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-elegant">
            <CardHeader>
              <CardTitle>Informazioni Base</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Template</Label>
                <Input 
                  value={formData.nome} 
                  onChange={e => setFormData({ ...formData, nome: e.target.value })} 
                  placeholder="es. Produzione Sabato"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrizione</Label>
                <Input 
                  value={formData.descrizione} 
                  onChange={e => setFormData({ ...formData, descrizione: e.target.value })} 
                  placeholder="Opzionale..."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-elegant bg-primary text-primary-foreground">
            <CardContent className="p-6 space-y-2">
              <h3 className="font-bold flex items-center gap-2">
                <Settings className="h-5 w-5" /> Suggerimento
              </h3>
              <p className="text-sm opacity-90">
                Usa i template per i gusti che produci ogni giorno. Risparmierai tempo nella registrazione manuale.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-elegant">
            <CardHeader>
              <CardTitle>Righe di Produzione</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-muted/50 rounded-2xl">
                <div className="md:col-span-5 space-y-2">
                  <Label>Prodotto</Label>
                  <select 
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={newLine.prodottoId}
                    onChange={(e) => handleProductChange(e.target.value)}
                  >
                    <option value="">Scegli prodotto...</option>
                    {products.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <Label>Quantità</Label>
                  <Input 
                    type="number" 
                    value={newLine.quantitaPrevista} 
                    onChange={e => setNewLine({ ...newLine, quantitaPrevista: Number(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-3 space-y-2">
                  <Label>Unità</Label>
                  <Input value={newLine.unitaMisura} readOnly className="bg-muted" />
                </div>
                <div className="md:col-span-12 space-y-2">
                  <Label>Note Riga</Label>
                  <Input 
                    value={newLine.note} 
                    onChange={e => setNewLine({ ...newLine, note: e.target.value })} 
                    placeholder="Note per questa riga di produzione..."
                  />
                </div>
                <div className="md:col-span-1 flex items-end">
                  <Button onClick={addLine} size="icon" className="w-full h-10">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Sub-section for ingredients (optional) */}
                <div className="md:col-span-12 mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase text-muted-foreground font-bold">Lotti Ingredienti Pre-selezionati (Opzionale)</Label>
                    <Button variant="ghost" size="sm" onClick={addIngredientToLine} className="h-6 text-[10px] gap-1">
                      <Plus className="h-3 w-3" /> Aggiungi Ingrediente
                    </Button>
                  </div>
                  {newLine.ingredienti.map((ing, idx) => (
                    <div key={ing.id} className="grid grid-cols-1 md:grid-cols-11 gap-2 p-2 bg-background rounded-lg border">
                      <div className="md:col-span-4">
                        <select 
                          className="w-full h-8 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                          value={ing.ingredienteId}
                          onChange={(e) => updateIngredient(idx, 'ingredienteId', e.target.value)}
                        >
                          <option value="">Ingrediente...</option>
                          {allIngredients.map((i: any) => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-4">
                        <select 
                          className="w-full h-8 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                          value={ing.lottoIngredienteId}
                          onChange={(e) => updateIngredient(idx, 'lottoIngredienteId', e.target.value)}
                          disabled={!ing.ingredienteId}
                        >
                          <option value="">Lotto...</option>
                          {allLotti.filter((l: any) => l.ingrediente_id === ing.ingredienteId || l.ingredienteId === ing.ingredienteId).map((l: any) => (
                            <option key={l.id} value={l.id}>{l.codice_lotto || l.batchCode}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <Input 
                          type="number" 
                          placeholder="Quantità" 
                          className="h-8 text-xs" 
                          value={ing.quantitaPrevista}
                          onChange={(e) => updateIngredient(idx, 'quantitaPrevista', Number(e.target.value))}
                        />
                      </div>
                      <div className="md:col-span-1">
                        <Button variant="ghost" size="icon" className="h-8 w-full text-destructive" onClick={() => removeIngredient(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {formData.righe.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm italic">
                    Aggiungi almeno una riga di produzione al template.
                  </p>
                ) : (
                  formData.righe.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between p-4 glass rounded-xl group">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                          <Package className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold">{r.product?.name}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">{r.product?.type}</p>
                          {r.note && <p className="text-[10px] text-muted-foreground italic mt-0.5">{r.note}</p>}
                          {r.ingredienti && r.ingredienti.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.ingredienti.map((ing: any, i: number) => {
                                const ingredient = allIngredients.find(ai => ai.id === (ing.ingredienteId));
                                const lotto = allLotti.find(al => al.id === (ing.lottoIngredienteId));
                                return (
                                  <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-muted text-muted-foreground">
                                    {ingredient?.name}: {lotto?.codice_lotto || lotto?.batchCode || 'No Lotto'}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Previsto</p>
                          <p className="font-black text-primary">{r.quantitaPrevista} {r.unitaMisura}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeLine(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}