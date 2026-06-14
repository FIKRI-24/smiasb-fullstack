import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);
const SESSION_EXPIRED_MESSAGE = 'Sesi Anda telah berakhir, silakan login kembali.';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('smiasb_token');

    if (token) {
      authAPI.me()
        .then(res => {
          const nextUser = res.data.data;
          setUser(nextUser);
          localStorage.setItem('smiasb_user', JSON.stringify(nextUser));
        })
        .catch(() => {
          localStorage.removeItem('smiasb_token');
          localStorage.removeItem('smiasb_user');
          localStorage.setItem('smiasb_session_message', SESSION_EXPIRED_MESSAGE);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (token, userData = null) => {
    localStorage.setItem('smiasb_token', token);

    if (userData) {
      setUser(userData);
      localStorage.setItem('smiasb_user', JSON.stringify(userData));
    }

    // ambil ulang user dari backend
    return authAPI.me().then(res => {
      const nextUser = res.data.data;
      setUser(nextUser);
      localStorage.setItem('smiasb_user', JSON.stringify(nextUser));
      return nextUser;
    });
  };

  const logout = () => {
    authAPI.logout().catch(() => {});
    localStorage.removeItem('smiasb_token');
    localStorage.removeItem('smiasb_user');
    localStorage.removeItem('smiasb_session_message');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
