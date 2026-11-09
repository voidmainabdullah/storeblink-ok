REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.items FROM anon;
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.items TO anon;
GRANT INSERT ON public.orders TO anon;
GRANT INSERT ON public.order_items TO anon;

REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.notifications FROM anon;