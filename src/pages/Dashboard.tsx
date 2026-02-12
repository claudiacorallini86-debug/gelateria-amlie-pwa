import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  PackageCheck, 
  Calendar,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { blink } from '../blink/client';
import { Badge } from '../components/ui/badge';
import { useNavigate } from 'react-router-dom';

export function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { label: 'Produzione Oggi', value: '...', icon: TrendingUp, color: 'text-blue-500' },
    { label: 'Scorte Basse', value: '...', icon: AlertTriangle, color: 'text-amber-500' },
    { label: 'Lotti in Scadenza', value: '...', icon: Calendar, color: 'text-rose-500' },
    { label: 'HACCP Oggi', value: '...', icon: PackageCheck, color: 'text-emerald-500' },
  ]);
  const [recentProduction, setRecentProduction] = useState<any[]>([]);
  const [expiringLots, setExpiringLots] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // 1. Production Today
      const productionToday = await blink.db.lotti_produzione.count({
        where: { dataProduzione: { gte: today } }
      });

      // 2. Low Stock
      const ingredients = await blink.db.ingredienti.list();
      const movements = await blink.db.movimenti_magazzino.list();
      
      let lowStockCount = 0;
      ingredients.forEach(ing => {
        const qty = movements
          .filter(m => m.ingredienteId === ing.id)
          .reduce((sum, m) => m.tipo === 'carico' ? sum + m.quantita : sum - m.quantita, 0);
        if (qty <= (ing.scortaMinima || 0)) lowStockCount++;
      });

      // 3. Expiring Lots (next 7 days)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekIso = nextWeek.toISOString().split('T')[0];
      
      const lotsExpiring = await blink.db.lotti_ingredienti.list({
        where: { 
          AND: [
            { dataScadenza: { lte: nextWeekIso } },
            { quantitaAttuale: { gt: 0 } }
          ]
        },
        limit: 5
      });

      // 4. HACCP Today
      const haccpCount = await blink.db.haccp_temperature.count({
        where: { dataOra: { gte: today } }
      });

      setStats([
        { label: 'Produzione Oggi', value: `${productionToday} Batch`, icon: TrendingUp, color: 'text-blue-500' },
        { label: 'Scorte Basse', value: `${lowStockCount} Ingredienti`, icon: AlertTriangle, color: 'text-amber-500' },
        { label: 'Lotti in Scadenza', value: `${lotsExpiring.length} Lotti`, icon: Calendar, color: 'text-rose-500' },
        { label: 'HACCP Oggi', value: haccpCount > 0 ? 'Registrato' : 'Da fare', icon: PackageCheck, color: haccpCount > 0 ? 'text-emerald-500' : 'text-rose-500' },
      ]);

      // Recent Production
      const recent = await blink.db.lotti_produzione.list({
        orderBy: { dataProduzione: 'desc' },
        limit: 3
      });
      const products = await blink.db.prodotti.list();
      setRecentProduction(recent.map(r => ({
        ...r,
        product: products.find(p => p.id === r.prodottoId)
      })));

      setExpiringLots(lotsExpiring.map(l => ({
        ...l,
        ingredient: ingredients.find(i => i.id === l.ingredienteId)
      })));

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl">Benvenuto, Amélie</h1>
        <p className="text-muted-foreground">Ecco una panoramica della tua gelateria oggi.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-none shadow-elegant bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={`p-3 rounded-2xl bg-background shadow-sm ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-none shadow-elegant">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Produzione Recente</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/produzione')}>
              Vedi tutto <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentProduction.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">Nessuna produzione recente</p>
              ) : (
                recentProduction.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center">🍦</div>
                      <div>
                        <p className="font-medium text-sm">{batch.product?.nome || 'Sconosciuto'}</p>
                        <p className="text-xs text-muted-foreground">Lotto #{batch.id.slice(-6).toUpperCase()}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold">{batch.quantita_prodotta} {batch.unita_resa}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-elegant">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Scadenze Magazzino</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/magazzino')}>
              Vedi tutto <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {expiringLots.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">Nessun lotto in scadenza</p>
              ) : (
                expiringLots.map((lot) => (
                  <div key={lot.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border-l-4 border-rose-500">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center">📦</div>
                      <div>
                        <p className="font-medium text-sm">{lot.ingredient?.nome || 'Sconosciuto'}</p>
                        <p className="text-xs text-muted-foreground">Scade il {new Date(lot.data_scadenza).toLocaleDateString('it-IT')}</p>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-rose-500 uppercase tracking-wider">Urgente</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
