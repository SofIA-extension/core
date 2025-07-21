
interface TrackingActionsProps {
  onExportData: () => void;
  onClearData: () => void;
  onViewConsole: () => void;
}

const TrackingActions: React.FC<TrackingActionsProps> = ({
  onExportData,
  onClearData,
  onViewConsole
}) => {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>🔧 Actions</span>
      </div>
      <div style={styles.actionsGrid}>
        <button onClick={onExportData} style={styles.actionButton}>
          <span style={styles.actionIcon}>📤</span>
          <span style={styles.actionText}>Exporter données</span>
        </button>
        <button onClick={onViewConsole} style={styles.actionButton}>
          <span style={styles.actionIcon}>🔍</span>
          <span style={styles.actionText}>Voir console</span>
        </button>
        <button onClick={onClearData} style={styles.dangerButton}>
          <span style={styles.actionIcon}>🗑️</span>
          <span style={styles.actionText}>Effacer données</span>
        </button>
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
  actionsGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontSize: '13px',
    fontWeight: '500',
    color: '#495057',
    ':hover': {
      backgroundColor: '#e9ecef',
      borderColor: '#adb5bd'
    }
  },
  dangerButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: '#fff5f5',
    border: '1px solid #f5c6cb',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontSize: '13px',
    fontWeight: '500',
    color: '#721c24',
    ':hover': {
      backgroundColor: '#f8d7da',
      borderColor: '#f5c6cb'
    }
  },
  actionIcon: {
    fontSize: '14px',
    minWidth: '16px'
  },
  actionText: {
    flex: '1',
    textAlign: 'left' as const
  }
};

export default TrackingActions;