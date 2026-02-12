import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Aggressive reload to clear any corrupted state
    window.location.href = window.location.pathname + '?retry=' + Date.now();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-lg p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-destructive/10 rounded-full">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-foreground mb-2">Ops! Qualcosa è andato storto</h1>
            <p className="text-muted-foreground mb-6">
              Si è verificato un errore imprevisto. Abbiamo registrato l'accaduto e stiamo lavorando per risolvere il problema.
            </p>

            {this.state.error && (
              <div className="mb-6 p-3 bg-muted rounded text-xs font-mono text-left overflow-auto max-h-32 border border-border">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button 
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2"
                variant="default"
              >
                <RefreshCw className="h-4 w-4" />
                Riprova
              </Button>
              <Button 
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-2"
                variant="outline"
              >
                <Home className="h-4 w-4" />
                Torna alla Dashboard
              </Button>
            </div>
            
            <p className="mt-8 text-xs text-muted-foreground italic">
              Gelateria Amélie PWA - Supporto Tecnico
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
