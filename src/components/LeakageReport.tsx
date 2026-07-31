import type { ReactNode } from 'react';
import { Clock, Cpu, MapPin, Terminal, UserRound } from 'lucide-react';
import type { ParsedPhotoData } from '../types/exif';
import { useTranslation } from 'react-i18next';

interface LeakageReportProps { photo: ParsedPhotoData; }

const icons: Record<string, ReactNode> = {
  location: <MapPin className="h-4 w-4" />,
  hardware: <Cpu className="h-4 w-4" />,
  identity: <UserRound className="h-4 w-4" />,
  timestamp: <Clock className="h-4 w-4" />,
  software: <Terminal className="h-4 w-4" />,
};

export function LeakageReport({ photo }: LeakageReportProps) {
  const { t } = useTranslation();
  const { leakage } = photo;
  return (
    <div>
      <div className="border-b border-border pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-serif text-xl font-bold text-foreground">{t('leakage.title')}</h3>
          <span className="font-mono text-xs text-gold">{t('leakage.observed', { count: leakage.detectedCount })}</span>
        </div>
      </div>

      <div>
        {leakage.findings.map((item) => (
          <div key={item.id} className="flex gap-3 border-b border-border py-4">
            <span className={`mt-0.5 ${item.detected ? 'text-gold' : 'text-muted-foreground'}`}>{icons[item.category]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-sans text-sm font-semibold text-foreground">{item.title}</h4>
                <span className={`font-mono text-[10px] uppercase ${item.detected ? 'text-gold' : 'text-muted-foreground'}`}>
                  {item.detected ? t('leakage.detected', { significance: item.significance }) : t('leakage.notObserved')}
                </span>
              </div>
              <p className="mt-1 font-sans text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              {item.value && <p className="mt-2 break-all border-l border-gold/50 pl-3 font-mono text-xs text-foreground">{item.value}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
