import {
  AuthenticationDetails,
  CognitoUser,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { type ReactNode, createContext, useCallback, useContext, useState, useEffect } from 'react';
import { userPool } from '../config/cognito';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  cognitoUser: CognitoUser | null;
  userAttributes: Record<string, string>;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  completeNewPasswordChallenge: (
    newPassword: string,
    attributes?: { givenName?: string; familyName?: string },
  ) => Promise<void>;
  clearError: () => void;
  getToken: () => Promise<string>;
  getUserEmail: () => string | null;
}

type LoginResult =
  | { status: 'success'; session: CognitoUserSession }
  | { status: 'newPasswordRequired'; userAttributes: Record<string, string> };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Start with true to check session
  const [error, setError] = useState<string | null>(null);
  const [cognitoUser, setCognitoUser] = useState<CognitoUser | null>(null);
  const [userAttributes, setUserAttributes] = useState<Record<string, string>>({});

  // Check for existing session on mount and fetch user attributes
  useEffect(() => {
    const user = userPool.getCurrentUser();
    if (user) {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          setIsAuthenticated(false);
          setIsLoading(false);
        } else {
          setIsAuthenticated(true);
          setCognitoUser(user);
          user.getUserAttributes((attrErr, attributes) => {
            if (!attrErr && attributes) {
              const attrs: Record<string, string> = {};
              attributes.forEach((attr) => {
                attrs[attr.getName()] = attr.getValue();
              });
              setUserAttributes(attrs);
            }
            setIsLoading(false);
          });
        }
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);
    setError(null);

    const user = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    return new Promise((resolve, reject) => {
      user.authenticateUser(authDetails, {
        onSuccess: (session) => {
          setIsAuthenticated(true);
          setCognitoUser(user);
          user.getUserAttributes((attrErr, attributes) => {
            if (!attrErr && attributes) {
              const attrs: Record<string, string> = {};
              attributes.forEach((attr) => {
                attrs[attr.getName()] = attr.getValue();
              });
              setUserAttributes(attrs);
            }
            setIsLoading(false);
            resolve({ status: 'success', session });
          });
        },
        onFailure: (err) => {
          setIsLoading(false);
          const message = err.message || 'Authentication failed';
          setError(message);
          reject(new Error(message));
        },
        newPasswordRequired: (attrs) => {
          setCognitoUser(user);
          setUserAttributes(attrs);
          setIsLoading(false);
          resolve({ status: 'newPasswordRequired', userAttributes: attrs });
        },
      });
    });
  }, []);

  const completeNewPasswordChallenge = useCallback(
    async (
      newPassword: string,
      attributes?: { givenName?: string; familyName?: string },
    ): Promise<void> => {
      if (!cognitoUser) {
        throw new Error('No user session found');
      }

      setIsLoading(true);
      setError(null);

      const requiredAttributes: Record<string, string> = {};
      if (attributes?.givenName) {
        requiredAttributes.given_name = attributes.givenName;
      }
      if (attributes?.familyName) {
        requiredAttributes.family_name = attributes.familyName;
      }

      return new Promise((resolve, reject) => {
        cognitoUser.completeNewPasswordChallenge(newPassword, requiredAttributes, {
          onSuccess: () => {
            setIsAuthenticated(true);
            setIsLoading(false);
            resolve();
          },
          onFailure: (err) => {
            setIsLoading(false);
            const message = err.message || 'Password change failed';
            setError(message);
            reject(new Error(message));
          },
        });
      });
    },
    [cognitoUser],
  );

  const logout = useCallback(() => {
    const user = userPool.getCurrentUser();
    if (user) {
      user.signOut();
    }
    setIsAuthenticated(false);
    setCognitoUser(null);
    setUserAttributes({});
    setError(null);
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const user = userPool.getCurrentUser();
    if (!user) {
      throw new Error('No user session');
    }

    return new Promise((resolve, reject) => {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          reject(new Error('Failed to get session'));
          return;
        }
        resolve(session.getIdToken().getJwtToken());
      });
    });
  }, []);

  const getUserEmail = useCallback((): string | null => {
    const user = userPool.getCurrentUser();
    return user?.getUsername() ?? null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        error,
        cognitoUser,
        userAttributes,
        login,
        logout,
        completeNewPasswordChallenge,
        clearError,
        getToken,
        getUserEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
