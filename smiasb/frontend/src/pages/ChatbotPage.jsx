import { useState, useEffect, useRef } from 'react'
import { chatbotAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const SUGGESTIONS = [
  'Apa itu HOTS?',
  'Jelaskan instrumen Literasi',
  'Apa itu Numerasi?',
  'Contoh soal HOTS Matematika',
  'Cara membuat instrumen penilaian',
  'Bedanya HOTS, Literasi, dan Numerasi',
]

export default function ChatbotPage() {
  const { user } = useAuth()
  const namaSekolah = user?.nama_sekolah || user?.school_name || user?.sekolah || null
  const roleLabel = ['admin', 'admin_sekolah', 'super_admin'].includes(user?.peran)
    ? 'admin'
    : user?.peran || user?.role || 'pengguna'
  const welcomeText = namaSekolah
    ? `Halo, ${roleLabel}! Saya ASB, Asisten Belajar ${namaSekolah}. Saya siap membantu Anda memahami instrumen penilaian HOTS, Literasi, dan Numerasi, serta penggunaan sistem ini.`
    : `Halo, pengguna! Saya ASB, Asisten Belajar Sekolah. Saya siap membantu Anda memahami instrumen penilaian HOTS, Literasi, dan Numerasi, serta penggunaan sistem ini.`

  const [messages, setMessages] = useState([
    {
      id: 1,
      dari: 'bot',
      teks: welcomeText,
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Load riwayat chat dari server
  useEffect(() => {
    chatbotAPI.getHistory()
      .then(res => {
        if (res.data.data.length > 0) {
          const history = res.data.data.flatMap(h => [
            { id: h.id + '_u', dari: 'user', teks: h.pesan },
            { id: h.id + '_b', dari: 'bot', teks: h.balasan },
          ])
          setMessages(prev => [prev[0], ...history])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (user && messages.length === 1) {
      setMessages([{ id: 1, dari: 'bot', teks: welcomeText }])
    }
  }, [user, welcomeText])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { id: Date.now(), dari: 'user', teks: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Kirim history untuk konteks
    const history = messages.slice(-10).map(m => ({ dari: m.dari, teks: m.teks }))

    try {
      const res = await chatbotAPI.send(msg, history)
      const botMsg = { id: Date.now() + 1, dari: 'bot', teks: res.data.data.balasan }
      setMessages(prev => [...prev, botMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, dari: 'bot',
        teks: 'Maaf, saya sedang tidak bisa merespons. Silakan coba lagi.'
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleClear = async () => {
    if (!window.confirm('Hapus semua riwayat chat?')) return
    setClearing(true)
    try {
      await chatbotAPI.clearHistory()
      setMessages([{
        id: Date.now(), dari: 'bot',
        teks: welcomeText,
      }])
    } catch {} finally { setClearing(false) }
  }

  // Render teks dengan markdown sederhana (bold)
  const renderText = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g)
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part
    )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 56px - 48px)'}}>
      {/* Header chatbot */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:38,height:38,borderRadius:'50%',background:'var(--blue-600)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>
            
          </div>
          <div>
            <div style={{fontWeight:600,fontSize:14}}>ASB - Asisten Belajar Sekolah</div>
            <div style={{fontSize:12,color:'var(--gray-600)'}}>Powered by Gemini AI - Selalu siap membantu</div>
          </div>
        </div>
        <button className="btn btn-sm" onClick={handleClear} disabled={clearing} title="Hapus riwayat chat">
          {clearing ? <span className="spinner spinner-dark" style={{width:14,height:14}} /> : 'Hapus riwayat'}
        </button>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map(s => (
            <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" style={{flex:1}}>
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble ${m.dari}`}>
            {renderText(m.teks)}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble bot" style={{display:'flex',alignItems:'center',gap:4,paddingTop:12,paddingBottom:12}}>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions saat percakapan berlangsung */}
      {messages.length > 2 && (
        <div className="chat-suggestions" style={{marginBottom:8}}>
          {['Contoh soal lainnya','Jelaskan lebih detail','Apa hubungannya dengan kurikulum Merdeka?'].map(s => (
            <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-area">
        <input
          ref={inputRef}
          className="input"
          placeholder="Ketik pertanyaan Anda..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={loading}
          style={{flex:1}}
        />
        <button
          className="btn btn-primary"
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{flexShrink:0}}
        >
          {loading ? <span className="spinner" /> : 'Kirim'}
        </button>
      </div>
    </div>
  )
}
