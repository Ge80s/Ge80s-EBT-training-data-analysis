import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BarChart2, 
  UserSquare2, 
  MessageSquareText, 
  ActivitySquare, 
  GraduationCap,
  ChevronLeft,
  Plane,
  Grid3X3
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const navItems = [
  { path: '/dashboard', name: '仪表板', icon: LayoutDashboard },
  { path: '/comparative', name: '对标分析', icon: BarChart2 },
  { path: '/profile', name: '飞行员档案', icon: UserSquare2 },
  { path: '/comments', name: '智能评论', icon: MessageSquareText },
  { path: '/ob-analysis', name: 'OB 分析', icon: ActivitySquare },
  { path: '/matrix', name: '矩阵分析', icon: Grid3X3 },
  { path: '/examiner', name: '教员分析', icon: GraduationCap },
];

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  return (
    <aside 
      className={`${isOpen ? 'w-64' : 'w-20'} 
        transition-all duration-300 ease-in-out bg-slate-900 text-slate-300 h-screen flex flex-col shadow-xl z-20 shrink-0`}
    >
      {/* Logo & Toggle */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        <div className={`flex items-center ${!isOpen ? 'justify-center w-full' : ''}`}>
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/50">
            <Plane className="text-white w-6 h-6" />
          </div>
          {isOpen && (
            <span className="ml-3 font-bold text-white text-lg tracking-wide whitespace-nowrap">
              EBT 分析平台
            </span>
          )}
        </div>
        
        {isOpen && (
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center px-3 py-3 rounded-lg transition-colors group
              ${isActive 
                ? 'bg-blue-600/20 text-blue-400 font-medium' 
                : 'hover:bg-slate-800 hover:text-white'}
              ${!isOpen ? 'justify-center' : ''}
            `}
            title={!isOpen ? item.name : undefined}
          >
            <item.icon className={`w-5 h-5 shrink-0 ${isOpen ? 'mr-3' : ''}`} />
            {isOpen && <span className="whitespace-nowrap">{item.name}</span>}
          </NavLink>
        ))}
      </nav>
      
      {/* Footer Info */}
      {isOpen && (
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
          <p>v1.0.0 Alpha</p>
        </div>
      )}
    </aside>
  );
}

