import { useCallback, useEffect, useState } from "react";
import { Inbox, Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type Notif = {
  id: string; title: string; body: string | null; image_url: string | null;
  kind: string; is_read: boolean; link_url: string | null; created_at: string;
};

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
};

export const NotificationsPopover = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<"inbox" | "whats_new">("inbox");
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications")
      .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    const list = (data ?? []) as Notif[];
    setItems(list);
    setUnread(list.filter(n => !n.is_read).length);

    // Seed welcome rows once if empty
    if (list.length === 0) {
      const seed = [
        { user_id: user.id, kind: "inbox", title: "Welcome to your dashboard",
          body: "Describe your store idea below and we'll set up a complete theme in seconds.", is_read: false },
        { user_id: user.id, kind: "changelog", title: "Theme presets are here",
          body: "Daraz, Apple, Editorial, Dark Luxury and Pastel — one-click apply and tweak.", is_read: false },
        { user_id: user.id, kind: "changelog", title: "Shopify-style visual editor",
          body: "Click any element to edit colours, padding, shadow and size live.", is_read: false },
      ];
      await supabase.from("notifications").insert(seed);
      window.setTimeout(() => void load(), 0);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`notifications-${user.id}-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load);
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setUnread(0);
  }, [user]);

  useEffect(() => { if (open && unread > 0) void markAllRead(); }, [markAllRead, open, unread]);

  const filtered = items.filter(n => tab === "whats_new" ? n.kind === "changelog" : n.kind !== "changelog");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative w-8 h-8 grid place-items-center rounded-md text-zinc-300 hover:bg-white/10 transition-colors">
          <Inbox size={16} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={8}
        className="w-[380px] p-0 bg-zinc-900 border-white/10 text-zinc-100">
        <div className="grid grid-cols-2 border-b border-white/10">
          {([["inbox","Inbox"],["whats_new","What's new"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k as any)}
              className={cn("px-4 py-3 text-sm font-medium transition-colors",
                tab === k ? "bg-white/5 text-white" : "text-zinc-400 hover:text-zinc-200")}>
              {label}
            </button>
          ))}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-sm">
              <Bell className="mx-auto mb-3 opacity-50" size={28} />
              No notifications yet
            </div>
          ) : filtered.map(n => (
            <div key={n.id} className="px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-100">{n.title}</div>
                  {n.body && <div className="text-xs text-zinc-400 mt-1 line-clamp-3">{n.body}</div>}
                  {n.image_url && (
                    <div className="mt-3 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 aspect-[16/9] grid place-items-center text-white font-semibold">
                      <img src={n.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="text-[11px] text-zinc-500 mt-2">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
