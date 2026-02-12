import React, { useState, useEffect } from 'react';
import { 
  Thermometer, 
  Droplets, 
  Plus, 
  FileDown, 
  Calendar,
  CheckCircle2,
  AlertTriangle,
  History,
  Trash2,
  Pencil,
  Check,
  X
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { logAudit } from '../lib/audit';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { cn } from '../lib/utils';
import { HaccpAutoFill } from '../components/HaccpAutoFill';
import { Badge } from '../components/ui/badge';

interface TempLog {
  id: string;
  attrezzatura: string;
  temperatura: number;
  data_ora: string;
  note: string;
  operatore?: string;
  limite_max?: number;
  limite_min?: number;
  stato?: string;
  turno?: string;
  motivoAnnullamento?: string;
}

interface CleanLog {
  id: string;
  area: string;
  compito: string;
  frequenza?: string;
  eseguito: boolean;
  data_ora: string;
  operatore?: string;
  note: string;
  stato?: string;
  turno?: string;
  motivoAnnullamento?: string;
}

export function HaccpPage() {
  const [tempLogs, setTempLogs] = useState<TempLog[]>([]);
  const [cleanLogs, setCleanLogs] = useState<CleanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('temp');
  const [showCancelled, setShowCancelled] = useState(false);
  
  const [isTempOpen, setIsTempOpen] = useState(false);
  const [isCleanOpen, setIsCleanOpen] = useState(false);
  const [editingTemp, setEditingTemp] = useState<TempLog | null>(null);
  const [editingClean, setEditingClean] = useState<CleanLog | null>(null);
  const [annullamentoModal, setAnnullamentoModal] = useState<{ id: string; type: 'temp' | 'clean' } | null>(null);
  const [selectedLog, setSelectedLog] = useState<{ id: string; type: 'temp' | 'clean' } | null>(null);
  const [isAnnullaOpen, setIsAnnullaOpen] = useState(false);
  const [inlineEditingTempId, setInlineEditingTempId] = useState<string | null>(null);
  const [inlineTempValue, setInlineTempValue] = useState<string>("");

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      const temps = await blink.db.haccp_temperature.list({
        orderBy: { data_ora: 'desc' },
        limit: 100
      });
      const cleans = await blink.db.haccp_pulizie.list({
        orderBy: { data_ora: 'desc' },
        limit: 100
      });
      setTempLogs(temps as any[]);
      setCleanLogs(cleans as any[]);
    } catch (error) {
      toast.error('Errore nel caricamento dei registri');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTemp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const user = await blink.auth.me();
    const data = {
      attrezzatura: formData.get('attrezzatura') as string,
      temperatura: Number(formData.get('temperatura')),
      note: formData.get('note') as string,
      operatore: user?.displayName || user?.email,
      data_ora: editingTemp ? editingTemp.data_ora : new Date().toISOString(),
      turno: formData.get('turno') as string,
      stato: editingTemp?.stato || 'registrato'
    };

    try {
      if (editingTemp) {
        await blink.db.haccp_temperature.update(editingTemp.id, data);
        await logAudit('update', 'haccp_temp', editingTemp.id, data);
        toast.success('Temperatura aggiornata');
      } else {
        const res = await blink.db.haccp_temperature.create(data);
        await logAudit('create', 'haccp_temp', res.id, data);
        toast.success('Temperatura registrata');
      }
      setIsTempOpen(false);
      setEditingTemp(null);
      fetchLogs();
    } catch (error) {
      toast.error('Errore nel salvataggio');
    }
  }

  async function handleSaveClean(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const user = await blink.auth.me();
    const data = {
      area: formData.get('area') as string,
      compito: formData.get('compito') as string,
      eseguito: true,
      operatore: user?.displayName || user?.email,
      note: formData.get('note') as string,
      data_ora: editingClean ? editingClean.data_ora : new Date().toISOString(),
      turno: formData.get('turno') as string,
      stato: editingClean?.stato || 'registrato'
    };

    try {
      if (editingClean) {
        await blink.db.haccp_pulizie.update(editingClean.id, data);
        await logAudit('update', 'haccp_clean', editingClean.id, data);
        toast.success('Pulizia aggiornata');
      } else {
        const res = await blink.db.haccp_pulizie.create(data);
        await logAudit('create', 'haccp_clean', res.id, data);
        toast.success('Pulizia registrata');
      }
      setIsCleanOpen(false);
      setEditingClean(null);
      fetchLogs();
    } catch (error) {
      toast.error('Errore nel salvataggio');
    }
  }

  async function handleCancelLog(id: string, type: 'temp' | 'clean') {
    const reason = (document.getElementById('motivo') as HTMLInputElement)?.value;
    if (!reason) {
      toast.error('Inserire un motivo');
      return;
    }
    
    try {
      const data = { stato: 'annullato', motivoAnnullamento: reason };
      if (type === 'temp') {
        await blink.db.haccp_temperature.update(id, data);
      } else {
        await blink.db.haccp_pulizie.update(id, data);
      }
      await logAudit('cancel', `haccp_${type}`, id, data);
      toast.success('Record annullato');
      fetchLogs();
      setIsAnnullaOpen(false);
      setSelectedLog(null);
    } catch (error) {
      toast.error('Errore durante l\'annullamento');
    }
  }

  async function handleInlineTempSave(id: string) {
    const newTemp = parseFloat(inlineTempValue);
    if (isNaN(newTemp)) {
      toast.error("Valore non valido");
      return;
    }
    
    try {
      await blink.db.haccp_temperature.update(id, { temperatura: newTemp });
      await logAudit('update', 'haccp_temp', id, { temperatura: newTemp, note: 'Modifica rapida temperature' });
      toast.success('Temperatura aggiornata');
      setInlineEditingTempId(null);
      fetchLogs();
    } catch (error) {
      toast.error('Errore nel salvataggio');
    }
  }

  const exportPDF = (type: 'temp' | 'clean') => {
    const doc = new jsPDF() as any;
    const title = type === 'temp' ? 'Registro Temperature HACCP' : 'Registro Pulizie HACCP';
    const data = (type === 'temp' ? tempLogs : cleanLogs).filter(l => l.stato !== 'annullato');

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.text(`Gelateria Amélie - Generato il ${new Date().toLocaleDateString('it-IT')}`, 14, 30);

    const columns = type === 'temp' 
      ? ["Data", "Ora", "Turno", "Attrezzatura", "Temp (°C)", "Note"]
      : ["Data", "Ora", "Turno", "Attività", "Area", "Note"];

    const rows = data.map(log => {
      const date = new Date(log.data_ora).toLocaleDateString('it-IT');
      const time = new Date(log.data_ora).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      if (type === 'temp') {
        const t = log as TempLog;
        return [date, time, t.turno || '-', t.attrezzatura, `${t.temperatura.toFixed(1)}°C`, t.note || ''];
      } else {
        const c = log as CleanLog;
        return [date, time, c.turno || '-', c.compito, c.area, c.note || ''];
      }
    });

    doc.autoTable({
      head: [columns],
      body: rows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [217, 119, 6] } // Brand Primary
    });

    doc.save(`haccp_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const groupLogsByDate = (logs: (TempLog | CleanLog)[]) => {
    const groups: { [key: string]: any[] } = {};
    logs.forEach(log => {
      const date = log.data_ora.split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(log);
    });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => ({
      date,
      logs: groups[date]
    }));
  };

  const groupedTemps = groupLogsByDate(tempLogs);
  const groupedCleans = groupLogsByDate(cleanLogs);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Registri HACCP</h1>
          <p className="text-muted-foreground">Monitoraggio obbligatorio temperature e igiene.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-lg border">
            <Label htmlFor="show-cancelled" className="text-xs font-medium cursor-pointer">Mostra Annullati</Label>
            <input 
              id="show-cancelled" 
              type="checkbox" 
              checked={showCancelled} 
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="accent-primary"
            />
          </div>
          <HaccpAutoFill onComplete={fetchLogs} />
        </div>
      </div>

      <Tabs defaultValue="temp" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="temp" className="gap-2"><Thermometer className="h-4 w-4" /> Temperature</TabsTrigger>
          <TabsTrigger value="clean" className="gap-2"><Droplets className="h-4 w-4" /> Pulizie</TabsTrigger>
        </TabsList>

        <TabsContent value="temp" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Log Temperature</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportPDF('temp')} className="gap-2">
                <FileDown className="h-4 w-4" /> Export PDF
              </Button>
              <Button size="sm" onClick={() => { setEditingTemp(null); setIsTempOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" /> Nuova Misura
              </Button>
            </div>
          </div>

          <div className="space-y-8">
            {groupedTemps.map(({ date, logs }) => (
              <div key={date} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {new Date(date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {logs.map((log: TempLog) => (
                    <Card key={log.id} className={cn(
                      "border-none shadow-elegant group relative overflow-hidden",
                      log.stato === 'annullato' && "opacity-60 grayscale bg-muted/50"
                    )}>
                      {log.stato === 'annullato' && (
                        <div className="absolute top-0 right-0 p-1 bg-destructive text-destructive-foreground text-[8px] font-bold uppercase rotate-45 translate-x-3 -translate-y-1 w-20 text-center">
                          Annullato
                        </div>
                      )}
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "p-3 rounded-xl",
                            log.temperatura > 8 ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
                          )}>
                            <Thermometer className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold">{log.attrezzatura}</p>
                              {log.turno && <Badge variant="outline" className="text-[10px] py-0">{log.turno}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(log.data_ora).toLocaleDateString('it-IT')}
                              {" - "}
                              {new Date(log.data_ora).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {log.motivoAnnullamento && (
                              <p className="text-[10px] text-destructive italic mt-1">Annullato: {log.motivoAnnullamento}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right flex items-center gap-2">
                            {inlineEditingTempId === log.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.1"
                                  className="w-24 h-9 font-bold text-lg text-right"
                                  value={inlineTempValue}
                                  onChange={(e) => setInlineTempValue(e.target.value)}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleInlineTempSave(log.id);
                                    if (e.key === 'Escape') setInlineEditingTempId(null);
                                  }}
                                />
                                <div className="flex flex-col gap-0.5">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => handleInlineTempSave(log.id)}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                    onClick={() => setInlineEditingTempId(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <p className={cn(
                                    "text-2xl font-black italic",
                                    log.temperatura > 8 ? "text-rose-500" : "text-primary"
                                  )}>{log.temperatura.toFixed(1)}°C</p>
                                  {log.temperatura > 8 && <p className="text-[10px] text-rose-500 font-bold uppercase tracking-wider">Fuori Range!</p>}
                                </div>
                                {log.stato !== 'annullato' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => {
                                      setInlineEditingTempId(log.id);
                                      setInlineTempValue(log.temperatura.toString());
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                          {log.stato !== 'annullato' && (
                            <div className="flex flex-col gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" 
                                onClick={() => {
                                  setEditingTemp(log);
                                  setIsTempOpen(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 rotate-45" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-destructive hover:text-destructive" 
                                onClick={() => { setSelectedLog({id: log.id, type: 'temp'}); setIsAnnullaOpen(true); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="clean" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Checklist Pulizie</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportPDF('clean')} className="gap-2">
                <FileDown className="h-4 w-4" /> Export PDF
              </Button>
              <Button size="sm" onClick={() => { setEditingClean(null); setIsCleanOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" /> Nuova Pulizia
              </Button>
            </div>
          </div>

          <div className="space-y-8">
            {groupedCleans.map(({ date, logs }) => (
              <div key={date} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {new Date(date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {logs.map((log: CleanLog) => (
                    <Card key={log.id} className={cn(
                      "border-none shadow-elegant group relative overflow-hidden",
                      log.stato === 'annullato' && "opacity-60 grayscale bg-muted/50"
                    )}>
                      {log.stato === 'annullato' && (
                        <div className="absolute top-0 right-0 p-1 bg-destructive text-destructive-foreground text-[8px] font-bold uppercase rotate-45 translate-x-3 -translate-y-1 w-20 text-center">
                          Annullato
                        </div>
                      )}
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold">{log.compito}</p>
                              {log.turno && <Badge variant="outline" className="text-[10px] py-0">{log.turno}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(log.data_ora).toLocaleDateString('it-IT')}
                              {" - "}
                              {new Date(log.data_ora).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {log.motivoAnnullamento && (
                              <p className="text-[10px] text-destructive italic mt-1">Annullato: {log.motivoAnnullamento}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="secondary" className={cn(
                            "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none",
                            log.stato === 'annullato' && "bg-destructive/10 text-destructive"
                          )}>
                            {log.stato === 'annullato' ? 'Annullato' : 'Eseguito'}
                          </Badge>
                          {log.stato !== 'annullato' && (
                            <div className="flex flex-col gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" 
                                onClick={() => {
                                  setEditingClean(log);
                                  setIsCleanOpen(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 rotate-45" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-destructive hover:text-destructive" 
                                onClick={() => { setSelectedLog({id: log.id, type: 'clean'}); setIsAnnullaOpen(true); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Temp Dialog */}
      <Dialog open={isTempOpen} onOpenChange={(open) => {
        setIsTempOpen(open);
        if (!open) setEditingTemp(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemp ? 'Modifica Temperatura' : 'Registra Temperatura'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTemp} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data di Riferimento</Label>
                <Input name="data_ora" type="datetime-local" required defaultValue={editingTemp?.data_ora ? new Date(editingTemp.data_ora).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)} />
              </div>
              <div className="space-y-2">
                <Label>Turno</Label>
                <select name="turno" className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={editingTemp?.turno || 'Mattina'}>
                  <option value="Mattina">Mattina</option>
                  <option value="Pomeriggio">Pomeriggio</option>
                  <option value="Sera">Sera</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Attrezzatura/Vetrina</Label>
              <Input name="attrezzatura" required defaultValue={editingTemp?.attrezzatura} placeholder="es. Pozzetto 1, Vetrina Esposizione..." />
            </div>
            <div className="space-y-2">
              <Label>Temperatura Rilevata (°C)</Label>
              <Input name="temperatura" type="number" step="0.1" required defaultValue={editingTemp?.temperatura} placeholder="0.0" />
            </div>
            <div className="space-y-2">
              <Label>Note / Azioni Correttive</Label>
              <Input name="note" defaultValue={editingTemp?.note} placeholder="es. Chiamato tecnico, sbrinato..." />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">{editingTemp ? 'Aggiorna Misura' : 'Salva Misura'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Clean Dialog */}
      <Dialog open={isCleanOpen} onOpenChange={(open) => {
        setIsCleanOpen(open);
        if (!open) setEditingClean(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClean ? 'Modifica Pulizia' : 'Registra Pulizia'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveClean} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data di Riferimento</Label>
                <Input name="data_ora" type="datetime-local" required defaultValue={editingClean?.data_ora ? new Date(editingClean.data_ora).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)} />
              </div>
              <div className="space-y-2">
                <Label>Turno</Label>
                <select name="turno" className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={editingClean?.turno || 'Mattina'}>
                  <option value="Mattina">Mattina</option>
                  <option value="Pomeriggio">Pomeriggio</option>
                  <option value="Sera">Sera</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Attività di Pulizia</Label>
              <Input name="compito" required defaultValue={editingClean?.compito} placeholder="es. Lavaggio Mantecatore, Sanificazione Superfici..." />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Input name="note" defaultValue={editingClean?.note} placeholder="Eventuali annotazioni..." />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">{editingClean ? 'Aggiorna Pulizia' : 'Conferma Esecuzione'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Annullamento Modal */}
      <Dialog open={isAnnullaOpen} onOpenChange={() => { setIsAnnullaOpen(false); setSelectedLog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annulla Registrazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Per compliance HACCP, i record non possono essere eliminati permanentemente. 
              Verranno contrassegnati come annullati con il motivo specificato.
            </p>
            <div className="space-y-2">
              <Label>Motivo Annullamento</Label>
              <Input 
                id="motivo" 
                placeholder="es. Errore inserimento dati, Sostituito da record successivo..." 
              />
            </div>
            <DialogFooter>
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => {
                  if (!selectedLog) return;
                  handleCancelLog(selectedLog.id, selectedLog.type);
                }}
              >
                Conferma Annullamento
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
