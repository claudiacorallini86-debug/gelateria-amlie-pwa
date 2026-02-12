import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/auth/LoginPage';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { IngredientsPage } from './pages/IngredientsPage';
import { ProductsPage } from './pages/ProductsPage';
import { RecipesPage } from './pages/RecipesPage';
import { WarehousePage } from './pages/WarehousePage';
import { ProductionPage } from './pages/ProductionPage';
import { HaccpPage } from './pages/HaccpPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { Toaster } from './components/ui/sonner';

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />} 
        />
        
        <Route 
          path="/*" 
          element={
            isAuthenticated ? (
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/ingredienti" element={<IngredientsPage />} />
                  <Route path="/prodotti" element={<ProductsPage />} />
                  <Route path="/ricette" element={<RecipesPage />} />
                  <Route path="/magazzino" element={<WarehousePage />} />
                  <Route path="/produzione" element={<ProductionPage />} />
                  <Route path="/haccp" element={<HaccpPage />} />
                  <Route path="/audit" element={<AuditLogPage />} />
                  <Route path="/impostazioni" element={<div>Impostazioni</div>} />
                </Routes>
              </AppLayout>
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
      </Routes>
      <Toaster position="top-center" />
    </Router>
  );
}

export default App;