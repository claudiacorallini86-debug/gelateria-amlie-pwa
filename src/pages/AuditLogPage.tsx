import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  User, 
  Database, 
  Clock,
  ArrowRight
} from 'lucide-react';
import { blink } from '../blink/client';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';

interface AuditLog {
  id: string;
  azione: string;
  tabella: string;
  recordId: string;
  dettagli: string;
  dataOra: string;
  userId: string;
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      const data = await blink.db.auditLog.list({
        orderBy: { dataOra: 'desc' },
        limit: 100
      });
      setLogs(data as any[]);
    } catch (error) {
      toast.error('Errore nel caricamento dell\'audit log');
    } finally {
      setLoading(false);
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-emerald-500/10 text-emerald-500';
      case 'update': return 'bg-amber-500/10 text-amber-500';
      case 'delete': return 'bg-rose-500/10 text-rose-500';
      case 'cancel': return 'bg-orange-500/10 text-orange-500';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const filteredLogs = logs.filter(log => 
    (log.tabella ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (log.azione ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif">Audit Log</h1>
        <p className="text-muted-foreground">Cronologia completa delle attività e modifiche nel sistema.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          placeholder="Cerca per attività o entità..." 
          className="pl-10 h-12" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 glass rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((log) => (
            <Card key={log.id} className="border-none shadow-elegant">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${getActionColor(log.azione)}`}>
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{log.azione}</Badge>
                      <span className="font-bold">{log.tabella}</span>
                      <span className="text-xs text-muted-foreground">ID: {log.recordId.slice(-6)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(log.dataOra).toLocaleString('it-IT')}</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {log.userId.slice(-6)}</span>
                    </div>
                  </div>
                </div>

                {log.dettagli && (
                  <div className="text-xs font-mono bg-secondary/30 p-2 rounded-lg max-w-md overflow-hidden truncate">
                    {log.dettagli}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
