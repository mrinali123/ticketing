import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import OrganiserRoute from './components/OrganiserRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import EventsPage from './pages/EventsPage.jsx';
import EventDetailPage from './pages/EventDetailPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import MyBookingsPage from './pages/MyBookingsPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import OrganiserPage from './pages/OrganiserPage.jsx';
import EventFormPage from './pages/EventFormPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      {/* Every page shares the navbar + footer from Layout */}
      <Route element={<Layout />}>
        <Route index element={<EventsPage />} />
        <Route path="events" element={<Navigate to="/" replace />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        {/* Logged-in users only */}
        <Route element={<ProtectedRoute />}>
          <Route path="bookings/:id" element={<CheckoutPage />} />
          <Route path="my-bookings" element={<MyBookingsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="bookings" element={<Navigate to="/my-bookings" replace />} />
        </Route>

        {/* Organisers only */}
        <Route element={<OrganiserRoute />}>
          <Route path="organiser" element={<OrganiserPage />} />
          <Route path="organiser/new" element={<EventFormPage />} />
          <Route path="organiser/events/:id/edit" element={<EventFormPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
