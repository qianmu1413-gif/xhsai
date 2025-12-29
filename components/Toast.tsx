
import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastState {
  show: boolean;
  message: string;
  type: ToastType;
}

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose, duration = 3000 }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const styles = {
    success: 'bg-slate-900 text-white shadow-slate-200/50',
    error: 'bg-red-500 text-white shadow-red-200/50',
    info: 'bg-blue-500 text-white shadow-blue-200/50'
  };

  const Icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info
  };

  const Icon = Icons[type];

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl animate-fade-in ${styles[type]} min-w-[200px] max-w-[90vw] justify-center backdrop-blur-md`}>
      <Icon size={18} className="shrink-0" />
      <span className="text-sm font-bold truncate">{message}</span>
    </div>
  );
};

export default Toast;
