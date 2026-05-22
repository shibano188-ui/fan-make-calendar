import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import PhoneFrame from './components/PhoneFrame';
import WorkSelect from './pages/WorkSelect';
import Calendar from './pages/Calendar';
import DateDetail from './pages/DateDetail';
import PostCreate from './pages/PostCreate';
import Customize from './pages/Customize';
import WidgetCountdown from './pages/WidgetCountdown';
import WidgetToday from './pages/WidgetToday';
import WidgetMonth from './pages/WidgetMonth';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <ThemeProvider>
        <Routes>
          {/* ウィジェット（PhoneFrameなし） */}
          <Route path="/widget/countdown/:workId" element={<WidgetCountdown />} />
          <Route path="/widget/today/:workId" element={<WidgetToday />} />
          <Route path="/widget/month/:workId" element={<WidgetMonth />} />

          {/* メインアプリ */}
          <Route path="/*" element={
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
          } />
        </Routes>
      </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
