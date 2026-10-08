import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './contexts/ToastContext';
import { AuditYearProvider } from './contexts/AuditYearContext';
import DashboardPage from './pages/DashboardPage';
import StandardDetailPage from './pages/StandardDetailPage';
import CourseDetailPage from './pages/CourseDetailPage';
import ForceChangePasswordPage from './pages/ForceChangePasswordPage';
import LoginPage from './pages/LoginPage';
import LogoutPage from './pages/LogoutPage';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuditYearProvider>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/standards/:id" element={<StandardDetailPage />} />
            <Route path="/courses/:code" element={<CourseDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/logout" element={<LogoutPage />} />
            <Route path="/change-password" element={<ForceChangePasswordPage />} />
          </Routes>
        </AuditYearProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
