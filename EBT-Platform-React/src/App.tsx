import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Dashboard from './pages/Dashboard';
import ComparativeAnalysis from './pages/ComparativeAnalysis';
import IndividualProfile from './pages/IndividualProfile';
import SmartComments from './pages/SmartComments';
import OBAnalysis from './pages/OBAnalysis';
import ExaminerAnalysis from './pages/ExaminerAnalysis';
import MatrixAnalysis from './pages/MatrixAnalysis';
import { useData } from './hooks/useData';

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 由布局统一监听顶栏筛选条件，避免页面组件重复请求。
  useData({ autoFetch: true });

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden bg-slate-50">
        <TopHeader sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main className="w-full mx-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/comparative" element={<ComparativeAnalysis />} />
          <Route path="/profile" element={<IndividualProfile />} />
          <Route path="/comments" element={<SmartComments />} />
          <Route path="/ob-analysis" element={<OBAnalysis />} />
          <Route path="/examiner" element={<ExaminerAnalysis />} />
          <Route path="/matrix" element={<MatrixAnalysis />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
