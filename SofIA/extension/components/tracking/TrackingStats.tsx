

interface TrackingStatsProps {
  totalPages: number;
  totalVisits: number;
  totalTime: number;
  mostVisitedUrl: string | null;
}

const TrackingStats: React.FC<TrackingStatsProps> = ({
  totalPages,
  totalVisits,
  totalTime,
  mostVisitedUrl
}) => {
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const formatUrl = (url: string | null): string => {
    if (!url) return 'N/A';
    try {
      const domain = new URL(url).hostname;
      return domain.length > 25 ? `${domain.slice(0, 25)}...` : domain;
    } catch {
      return url.length > 25 ? `${url.slice(0, 25)}...` : url;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>📊 Statistiques de navigation</span>
      </div>
      <div style={styles.statsGrid}>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>🌐</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{totalPages}</div>
            <div style={styles.statLabel}>Pages visitées</div>
          </div>
        </div>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>👁️</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{totalVisits}</div>
            <div style={styles.statLabel}>Visites totales</div>
          </div>
        </div>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>⏱️</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{formatDuration(totalTime)}</div>
            <div style={styles.statLabel}>Temps total</div>
          </div>
        </div>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>🥇</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{formatUrl(mostVisitedUrl)}</div>
            <div style={styles.statLabel}>Plus visitée</div>
          </div>
        </div>
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
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px'
  },
  statIcon: {
    fontSize: '16px',
    minWidth: '20px'
  },
  statContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: '0',
    flex: '1'
  },
  statValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#212529',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  },
  statLabel: {
    fontSize: '11px',
    color: '#6c757d',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  }
};

export default TrackingStats;