import toast from 'react-hot-toast'
import ActionIcon from '../components/ActionIcon'

export function confirmToast(message, options = {}) {
  const {
    title = 'Konfirmasi',
    confirmText = 'Lanjutkan',
    cancelText = 'Batal',
    tone = 'danger',
  } = options

  return new Promise(resolve => {
    toast.custom((t) => (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          background: '#FFFFFF',
          color: '#111827',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          boxShadow: '0 18px 45px rgba(15, 23, 42, 0.22)',
          padding: 16,
          opacity: t.visible ? 1 : 0,
          transform: t.visible ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'opacity 160ms ease, transform 160ms ease'
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.5, marginBottom: 16 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id)
              resolve(false)
            }}
            style={{
              border: '1px solid #D1D5DB',
              background: '#FFFFFF',
              color: '#374151',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <ActionIcon name="cancel" size={14} />
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id)
              resolve(true)
            }}
            style={{
              border: '1px solid',
              borderColor: tone === 'danger' ? '#DC2626' : '#2563EB',
              background: tone === 'danger' ? '#DC2626' : '#2563EB',
              color: '#FFFFFF',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <ActionIcon name={tone === 'danger' ? 'delete' : 'check'} size={14} />
            {confirmText}
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
      position: 'top-center',
    })
  })
}

export { toast }
