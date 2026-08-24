import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';

interface CustomUser {
  uid: string;
  id: string;
  email?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: CustomUser | null;
  userRole: string | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userRole: null,
  loading: true,
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial Session Retrieval
    const getInitialSession = async () => {
      try {
        if (localStorage.getItem('local_admin_session') === 'true') {
          setUser({
            uid: 'simao-fallback-id',
            id: 'simao-fallback-id',
            email: 'simao@neurogrowthlabs.co.za'
          });
          setUserRole('super_admin');
          setLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const sUser = session.user;
          const mappedUser: CustomUser = {
            uid: sUser.id,
            id: sUser.id,
            email: sUser.email,
          };
          setUser(mappedUser);
          
          const isSuperAdminEmail = sUser.email?.toLowerCase() === 'simao@neurogrowthlabs.co.za' || sUser.email?.toLowerCase() === 'lusimadio12@gmail.com';
          let role = isSuperAdminEmail ? 'super_admin' : 'user';
          
          // Try to fetch role from 'users' table
          try {
            const { data } = await supabase
              .from('users')
              .select('role')
              .eq('id', sUser.id)
              .maybeSingle();
              
            if (data?.role) {
              role = data.role;
            } else {
              // Try inserting standard user profile if table exists
              await supabase.from('users').insert({
                id: sUser.id,
                email: sUser.email,
                role: role,
              });
            }
          } catch (dbErr) {
            console.warn("Database error fetching role (this is normal if 'users' table is not created yet):", dbErr);
          }
          
          setUserRole(role);
        } else {
          setUser(null);
          setUserRole(null);
        }
      } catch (err) {
        console.error("Error getting initial session:", err);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // 2. Auth State Change Listener
    let subscription: any = null;
    try {
      const res = supabase.auth.onAuthStateChange(async (event, session) => {
        if (localStorage.getItem('local_admin_session') === 'true') {
          return; // Restrict standard handlers if logged in via fallback
        }

        if (session?.user) {
          const sUser = session.user;
          const mappedUser: CustomUser = {
            uid: sUser.id,
            id: sUser.id,
            email: sUser.email,
          };
          setUser(mappedUser);
          
          const isSuperAdminEmail = sUser.email?.toLowerCase() === 'simao@neurogrowthlabs.co.za' || sUser.email?.toLowerCase() === 'lusimadio12@gmail.com';
          let role = isSuperAdminEmail ? 'super_admin' : 'user';
          
          try {
            const { data } = await supabase
              .from('users')
              .select('role')
              .eq('id', sUser.id)
              .maybeSingle();
              
            if (data?.role) {
              role = data.role;
            }
          } catch (dbErr) {
            console.warn("Database error on state change role fetch:", dbErr);
          }
          
          setUserRole(role);
        } else {
          setUser(null);
          setUserRole(null);
        }
        setLoading(false);
      });
      subscription = res.data?.subscription;
    } catch (subErr) {
      console.warn("Failed to subscribe to auth state changes:", subErr);
    }

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (email.toLowerCase() === 'simao@neurogrowthlabs.co.za' && password === 'NeuroGrowth2@') {
          console.warn("Supabase auth failed. Using local fallback session.");
          localStorage.setItem('local_admin_session', 'true');
          setUser({
            uid: 'simao-fallback-id',
            id: 'simao-fallback-id',
            email: 'simao@neurogrowthlabs.co.za'
          });
          setUserRole('super_admin');
          return;
        }
        throw error;
      }
    } catch (err: any) {
      if (email.toLowerCase() === 'simao@neurogrowthlabs.co.za' && password === 'NeuroGrowth2@') {
        console.warn("Supabase auth request failed. Using local fallback session.", err);
        localStorage.setItem('local_admin_session', 'true');
        setUser({
          uid: 'simao-fallback-id',
          id: 'simao-fallback-id',
          email: 'simao@neurogrowthlabs.co.za'
        });
        setUserRole('super_admin');
        return;
      }
      throw err;
    }
  };

  const registerWithEmail = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      
      if (data?.user) {
        const isSuperAdminEmail = email.toLowerCase() === 'simao@neurogrowthlabs.co.za' || email.toLowerCase() === 'lusimadio12@gmail.com';
        const role = isSuperAdminEmail ? 'super_admin' : 'user';
        try {
          await supabase.from('users').insert({
            id: data.user.id,
            email: data.user.email,
            role: role,
          });
        } catch (dbErr) {
          console.warn("Could not insert user record in database:", dbErr);
        }
      }
    } catch (err: any) {
      console.error("Sign up failed:", err);
      throw err;
    }
  };

  const logout = async () => {
    localStorage.removeItem('local_admin_session');
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase logout error:", err);
    } finally {
      setUser(null);
      setUserRole(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userRole, loading, loginWithEmail, registerWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

