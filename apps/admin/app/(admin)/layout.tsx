import { NavLink } from "@/app/nav";
import { Avatar } from "@/app/kit";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/session";
import { APP_URL } from "@/lib/format";
import { Icon, type IconName } from "@/app/icons";
import { MobileNav } from "@/app/mobile-nav";

const NAV: { group: string; items: { href: string; label: string; icon: IconName; exact?: boolean }[] }[] = [
  {
    group: "Run",
    items: [
      { href: "/", label: "Overview", exact: true, icon: "home" },
      { href: "/project", label: "Project", icon: "project" },
      { href: "/tickets", label: "Tickets", icon: "flag" },
      { href: "/wiki", label: "Wiki", icon: "book" },
    ],
  },
  {
    group: "In",
    items: [
      { href: "/agencies", label: "Agencies", icon: "building" },
      { href: "/feeds", label: "Feed log", icon: "inbox" },
      { href: "/listings", label: "Listings", icon: "home2" },
    ],
  },
  {
    group: "Out",
    items: [
      { href: "/partners", label: "Partners", icon: "network" },
      { href: "/deliveries", label: "Deliveries", icon: "repeat" },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/users", label: "Users", icon: "users" },
      { href: "/activity", label: "Activity", icon: "pulse" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  const link = (n: (typeof NAV)[number]["items"][number]) => (
    <NavLink key={n.href} href={n.href} exact={n.exact} className="nav-item flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm">
      <Icon name={n.icon} className="nav-muted h-[18px] w-[18px]" />
      {n.label}
    </NavLink>
  );
  const grouped = NAV.map((g) => (
    <div key={g.group} className="space-y-0.5">
      <p className="nav-group px-2.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em]">{g.group}</p>
      {g.items.map(link)}
    </div>
  ));
  // eslint-disable-next-line @next/next/no-img-element
  const logo = <span className="text-xl font-extrabold tracking-tight text-white">list<span className="text-cyan">gate</span></span>;
  const footer = (
    <>
      <div className="px-2 pb-2">
        <a href={`${APP_URL}/app`} className="nav-item flex items-center justify-between rounded-md px-2.5 py-2 text-sm">
          Open the app
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
        </a>
      </div>
      <div className="nav-rule flex items-center gap-2 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Avatar name={me.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{me.name}</span>
          <span className="nav-muted block truncate text-xs">{me.email}</span>
        </span>
        <form action={logout}>
          <button className="nav-item rounded-md px-2 py-1 text-xs" type="submit">Sign out</button>
        </form>
      </div>
    </>
  );
  return (
    <div className="md:flex">
      {/* Desktop sidebar */}
      <aside className="sidenav sticky top-0 hidden h-screen w-60 shrink-0 flex-col md:flex">
        <div className="px-4 pb-5 pt-5">
          {logo}
          <span className="nav-muted mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em]">Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 [scrollbar-width:none]" aria-label="Admin">{grouped}</nav>
        {footer}
      </aside>
      {/* Phone: hamburger + drawer with the same grouped nav */}
      <MobileNav logo={logo} footer={footer}>{grouped}</MobileNav>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">{children}</div>
      </main>
    </div>
  );
}
