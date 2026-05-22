import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import PhoneFrame from './components/PhoneFrame';
import WorkSelect from './pages/WorkSelect';
import Calendar from './pages/Calendar';
import DateDetail from './pages/DateDetail';
import PostCreate from './pages/PostCreate';
import Customize from './pages/Customize';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <ThemeProvider>
      <PhoneFrame>
        <Routes>
          <Route path="/" element={<WorkSelect />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/calendar/:workId" element={<Calendar />} />
          <Route path="/calendar/:workId/date/:date" element={<DateDetail />} />
          <Route path="/calendar/:workId/post" element={<PostCreate />} />
          <Route path="/customize" element={<Customize />} />
        </Routes>
      </PhoneFrame>
      </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
