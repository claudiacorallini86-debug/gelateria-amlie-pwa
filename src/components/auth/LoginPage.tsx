import React from 'react';
import { blink } from '../../blink/client';
import { IceCream } from 'lucide-react';
import { Button } from '../ui/button';

export function LoginPage() {
  const handleLogin = () => {
    blink.auth.login(window.location.origin);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md p-8 space-y-8 glass rounded-2xl shadow-elegant text-center">
        <div className="flex justify-center">
          <div className="p-4 bg-primary/10 rounded-full">
            <IceCream className="h-12 w-12 text-primary" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-serif">Gelateria Amélie</h1>
          <p className="text-muted-foreground">Gestione completa della tua gelateria</p>
        </div>

        <Button 
          onClick={handleLogin}
          className="w-full py-6 text-lg font-medium shadow-elegant"
        >
          Accedi al sistema
        </Button>

        <p className="text-xs text-muted-foreground">
          Accedi per gestire ingredienti, ricette, magazzino e HACCP.
        </p>
      </div>
    </div>
  );
}
