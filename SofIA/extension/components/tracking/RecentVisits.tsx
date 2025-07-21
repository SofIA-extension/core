import type { VisitData } from "~types/history";



interface RecentVisitsProps {
  visits: VisitData[];
  maxItems?: number;
}

const RecentVisits = ({ visits, maxItems = 5 }: RecentVisitsProps) => {
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'À l\'instant';
    if (diffMinutes < 60) return `${diffMinutes}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}j`;
    
    return date.toLocaleDateString('fr-FR', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatUrl = (url: string): string => {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return url;
    }
  };

  const formatTitle = (title: string): string => {
    return title.length > 30 ? `${title.slice(0, 30)}...` : title;
  };

  const recentVisits = visits.slice(0, maxItems);

  if (recentVisits.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>🕒 Visites récentes</span>
        </div>
        <div style={styles.emptyState}>
          <span style={styles.emptyText}>Aucune visite récente</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>🕒 Visites récentes</span>
      </div>
      <div style={styles.visitsList}>
        {recentVisits.map((visit, index) => (
          <div key={`${visit.url}-${index}`} style={styles.visitItem}>
            <div style={styles.visitContent}>
              <div style={styles.visitTitle}>{formatTitle(visit.title)}</div>
              <div style={styles.visitUrl}>{formatUrl(visit.url)}</div>
            </div>
            <div style={styles.visitMeta}>
              <div style={styles.visitCount}>{visit.visitCount}x</div>
              <div style={styles.visitTime}>{formatTimestamp(visit.lastVisitTime)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
    marginBottom: '16px'
  },
  header: {
    marginBottom: '12px',
    borderBottom: '1px solid #e9ecef',
    paddingBottom: '8px'
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#495057'
  },
  visitsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  },
  visitItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    gap: '8px'
  },
  visitContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: '1',
    minWidth: '0'
  },
  visitTitle: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#212529',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  },
  visitUrl: {
    fontSize: '11px',
    color: '#6c757d',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  },
  visitMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: '2px',
    minWidth: '40px'
  },
  visitCount: {
    fontSize: '11px',
    color: '#198754',
    fontWeight: '600'
  },
  visitTime: {
    fontSize: '10px',
    color: '#6c757d'
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '20px'
  },
  emptyText: {
    fontSize: '12px',
    color: '#6c757d',
    fontStyle: 'italic'
  }
};

export default RecentVisits;