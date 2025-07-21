
import { useStorage } from "@plasmohq/storage/hook";

interface TrackingStatusProps {
  isEnabled: boolean;
  onToggle: () => void;
}

const TrackingStatus: React.FC<TrackingStatusProps> = ({ isEnabled, onToggle }) => {
  return (
    <div style={styles.container}>
      <div style={styles.statusRow}>
        <div style={styles.statusInfo}>
          <div style={styles.statusIcon}>
            {isEnabled ? '🟢' : '🔴'}
          </div>
          <div style={styles.statusText}>
            <span style={styles.statusLabel}>Tracking</span>
            <span style={isEnabled ? styles.statusActiveValue : styles.statusInactiveValue}>
              {isEnabled ? 'Activé' : 'Désactivé'}
            </span>
          </div>
        </div>
        <button
          onClick={onToggle}
          style={isEnabled ? styles.toggleButtonActive : styles.toggleButtonInactive}
        >
          {isEnabled ? 'Désactiver' : 'Activer'}
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
    marginBottom: '16px'
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statusInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  statusIcon: {
    fontSize: '16px'
  },
  statusText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px'
  },
  statusLabel: {
    fontSize: '12px',
    color: '#6c757d',
    fontWeight: '500'
  },
  statusActiveValue: {
    fontSize: '14px',
    color: '#198754',
    fontWeight: '600'
  },
  statusInactiveValue: {
    fontSize: '14px',
    color: '#dc3545',
    fontWeight: '600'
  },
  toggleButtonActive: {
    padding: '6px 12px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: '#c82333'
    }
  },
  toggleButtonInactive: {
    padding: '6px 12px',
    backgroundColor: '#198754',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: '#157347'
    }
  }
};

export default TrackingStatus;