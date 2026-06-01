import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  style?: React.CSSProperties;
}

export default function Card({ title, children, action, style }: CardProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
      ...style,
    }}>
      {title && (
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {title}
          </span>
          {action}
        </div>
      )}
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
