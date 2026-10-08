import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function getInitials(givenName: string | undefined, familyName: string | undefined, email: string | undefined): string {
  if (givenName && familyName) {
    return (givenName[0] + familyName[0]).toUpperCase();
  }
  if (givenName) {
    return givenName.slice(0, 2).toUpperCase();
  }
  if (email) {
    const username = email.split('@')[0];
    return username.slice(0, 2).toUpperCase();
  }
  return '?';
}

export function UserMenu() {
  const navigate = useNavigate();
  const { logout, userAttributes } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const givenName = userAttributes['given_name'];
  const familyName = userAttributes['family_name'];
  const email = userAttributes['email'];
  const displayName = givenName && familyName ? `${givenName} ${familyName}` : email;
  const initials = getInitials(givenName, familyName, email);

  const handleLogout = () => {
    logout();
    navigate('/logout');
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {initials}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-border py-1 z-50 animate-slideDown">
          {displayName && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-text-primary truncate">{displayName}</p>
              {email && displayName !== email && (
                <p className="text-xs text-text-muted truncate mt-0.5">{email}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-bg-secondary hover:text-accent transition-colors"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
