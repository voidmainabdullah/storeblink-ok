import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, Settings, Palette, HelpCircle, BookOpen, Users, Home, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const ProfilePopover = () => {
  const { user, bootstrap, signOut } = useAuth();
  const navigate = useNavigate();
  const name = bootstrap?.profile.fullName || bootstrap?.profile.businessName || "";

  const initial = (name || user?.email || "U").charAt(0).toUpperCase();

  const Item = ({ icon: Icon, label, onClick, suffix }: any) => (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-200 hover:bg-white/5 transition-colors text-left">
      <Icon size={16} className="text-zinc-400" />
      <span className="flex-1">{label}</span>
      {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label="Open account menu" className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-white text-sm font-semibold hover:scale-105 transition-transform">
          {initial}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={8}
        className="w-64 p-2 bg-zinc-900 border-white/10 text-zinc-100">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-white font-semibold">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{name || "User"}</div>
            <div className="text-xs text-zinc-400 truncate">{user?.email}</div>
          </div>
        </div>
        <div className="h-px bg-white/10 my-1" />
        <Item icon={User} label="Profile" onClick={() => navigate("/dashboard/store")} />
        <Item icon={Settings} label="Settings" suffix="Ctrl ." onClick={() => navigate("/dashboard/store")} />
        <Item icon={Palette} label="Appearance" />
        <Item icon={HelpCircle} label="Support" />
        <Item icon={BookOpen} label="Documentation" />
        <Item icon={Users} label="Community" />
        <Item icon={Home} label="Home" onClick={() => navigate("/")} />
        <div className="h-px bg-white/10 my-1" />
        <Item icon={LogOut} label="Sign out" onClick={async () => { await signOut(); navigate("/"); }} />
      </PopoverContent>
    </Popover>
  );
};
