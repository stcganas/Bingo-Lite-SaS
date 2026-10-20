import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  autoRetryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    autoRetryCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const errorStr = (error?.message || error?.toString() || '').toLowerCase();
    const isDomOrTranslationError = 
      errorStr.includes('removechild') || 
      errorStr.includes('insertbefore') || 
      errorStr.includes('notfounderror') ||
      errorStr.includes('the node to be removed is not a child');

    if (isDomOrTranslationError) {
      console.warn('[ErrorBoundary] Suppressed transient DOM translation/removeChild error to prevent game disruption:', error);
    }

    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorStr = (error?.message || error?.toString() || '').toLowerCase();
    const isDomOrTranslationError = 
      errorStr.includes('removechild') || 
      errorStr.includes('insertbefore') || 
      errorStr.includes('notfounderror') ||
      errorStr.includes('the node to be removed is not a child');

    // Auto-recover silently from DOM/translation glitches if retry count is low
    if (isDomOrTranslationError && this.state.autoRetryCount < 3) {
      setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: null,
          errorInfo: null,
          autoRetryCount: prev.autoRetryCount + 1,
        }));
      }, 50);
      return;
    }

    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, autoRetryCount: 0 });
    window.location.reload();
  };

  private handleSoftRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, autoRetryCount: 0 });
  };

  public render() {
    if (this.state.hasError) {
      const errorStr = (this.state.error?.message || this.state.error?.toString() || '').toLowerCase();
      const isDomOrTranslationError = 
        errorStr.includes('removechild') || 
        errorStr.includes('insertbefore') || 
        errorStr.includes('notfounderror') ||
        errorStr.includes('the node to be removed is not a child');

      const isChunkLoadError = 
        errorStr.includes('failed to fetch dynamically imported module') ||
        errorStr.includes('error loading dynamically imported module') ||
        errorStr.includes('loading chunk') ||
        errorStr.includes('dynamically imported module') ||
        errorStr.includes('failed to fetch');

      // Auto-recover once from dynamic import / chunk errors
      if (isChunkLoadError && typeof window !== 'undefined') {
        const reloadKey = 'eb_chunk_reload_triggered';
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, 'true');
          setTimeout(() => {
            window.location.reload();
          }, 100);
          return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
              <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl text-center space-y-4">
                <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold animate-pulse">
                  🔄
                </div>
                <h2 className="text-xl font-black text-white">Actualizando aplicación...</h2>
                <p className="text-xs text-slate-300">
                  Se ha detectado una nueva versión en el servidor. Sincronizando la última actualización...
                </p>
              </div>
            </div>
          );
        }
      }

      // If it's a DOM translation error and we're retrying, keep rendering children
      if (isDomOrTranslationError && this.state.autoRetryCount <= 3) {
        return this.props.children;
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
          <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
              {isChunkLoadError ? '🚀' : '⚠️'}
            </div>
            <h2 className="text-xl font-black text-white">
              {isChunkLoadError ? 'Nueva versión disponible' : 'Algo no salió como esperábamos'}
            </h2>
            <p className="text-xs text-slate-300">
              {isChunkLoadError 
                ? 'El servidor se ha actualizado con nuevas mejoras. Por favor recarga para acceder a la última versión.'
                : 'Se ha detectado una desincronización visual temporal en el navegador. Puedes continuar jugando inmediatamente.'
              }
            </p>
            {this.state.error && (
              <div className="p-3 bg-slate-950 rounded-xl text-left text-xs font-mono text-amber-300/90 overflow-x-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              {!isChunkLoadError && (
                <button
                  onClick={this.handleSoftRetry}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-bold rounded-xl text-white transition-all shadow-lg text-xs cursor-pointer"
                >
                  Continuar Jugando ▶️
                </button>
              )}
              <button
                onClick={() => {
                  try { sessionStorage.removeItem('eb_chunk_reload_triggered'); } catch (e) {}
                  this.handleReset();
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl text-white transition-all shadow-lg text-xs cursor-pointer"
              >
                {isChunkLoadError ? 'Cargar última versión 🔄' : 'Recargar página 🔄'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
