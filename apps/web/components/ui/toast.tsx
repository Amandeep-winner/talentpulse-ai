import * as React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'default';
}

export interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  addToast: (options: ToastOptions) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = React.useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast],
  );

  const addToast = React.useCallback(
    ({ title, description, variant }: ToastOptions) => {
      const type: 'success' | 'error' | 'info' =
        variant === 'danger' || variant === 'warning' ? 'error' : variant === 'info' ? 'info' : 'success';
      const message = title
        ? description
          ? `${title}: ${description}`
          : title
        : description || '';
      showToast(type, message);
    },
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => {
          const icons = {
            success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
            error: <AlertCircle className="h-4 w-4 text-rose-400" />,
            info: <Info className="h-4 w-4 text-blue-400" />,
          };
          return (
            <div
              key={toast.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/95 p-3.5 shadow-xl backdrop-blur',
                'animate-in fade-in slide-in-from-bottom-2 duration-200 text-sm text-gray-200 min-w-[280px]',
              )}
            >
              {icons[toast.type]}
              <span className="flex-1 text-xs">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      showToast: () => {},
      addToast: () => {},
      removeToast: () => {},
    };
  }
  return context;
}
