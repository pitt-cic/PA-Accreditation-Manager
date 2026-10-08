import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';

export default function LogoutPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    logout();
  }, [logout]);

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-4">
            <svg
              className="w-8 h-8 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">You've been signed out</h1>
          <p className="text-gray-600 mb-6">
            Thank you for using our application. You have been successfully logged out.
          </p>

          <Button onClick={() => navigate('/login')}>Back to Sign in</Button>
        </Card>
      </div>
    </div>
  );
}
