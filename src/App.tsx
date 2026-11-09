import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isPlatformHostname } from "@/storefront/domains/PublicDomainResolver";

const Auth = lazy(() => import("./pages/Auth.tsx"));
const AuthBoundary = lazy(() => import("./platform/auth/AuthBoundary.tsx"));
const AuthGuard = lazy(() => import("./platform/auth/AuthGuard.tsx").then((module) => ({
  default: module.AuthGuard,
})));
const OnboardingGate = lazy(() => import("./components/OnboardingGate.tsx").then((module) => ({
  default: module.OnboardingGate,
})));
const AuthCallback = lazy(() => import("./pages/AuthCallback.tsx"));
const Mfa = lazy(() => import("./pages/Mfa.tsx"));
const MainAdmin = lazy(() => import("./pages/admin/MainAdmin.tsx"));
const PlatformAdminGuard = lazy(() => import("./platform/admin/PlatformAdminGuard.tsx").then((module) => ({
  default: module.PlatformAdminGuard,
})));
const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout.tsx"));
const DomainConnectLayout = lazy(() => import("./pages/domain/DomainConnectLayout.tsx"));
const DomainOverviewPage = lazy(() => import("./pages/domain/DomainOverviewPage.tsx"));
const ConnectExistingDomainPage = lazy(() => import("./pages/domain/ConnectExistingDomainPage.tsx"));
const DomainSearchPage = lazy(() => import("./pages/domain/DomainSearchPage.tsx"));
const DomainTransferPage = lazy(() => import("./pages/domain/DomainTransferPage.tsx"));
const GoogleSearchPage = lazy(() => import("./pages/domain/GoogleSearchPage.tsx"));
const SeoDashboardPage = lazy(() => import("./pages/domain/SeoDashboardPage.tsx"));
const GoogleOAuthCallbackPage = lazy(() => import("./pages/domain/GoogleOAuthCallbackPage.tsx"));
const DomainStatusPage = lazy(() => import("./pages/domain/DomainStatusPage.tsx"));
const DashCustomers = lazy(() => import("./pages/dashboard/Customers.tsx"));
const DashItems = lazy(() => import("./pages/dashboard/Items.tsx"));
const Orders = lazy(() => import("./pages/dashboard/Orders.tsx"));
const Overview = lazy(() => import("./pages/dashboard/Overview.tsx"));
const DashPayments = lazy(() => import("./pages/dashboard/Payments.tsx"));
const MyStore = lazy(() => import("./pages/dashboard/MyStore.tsx"));
const StorefrontPreview = lazy(() => import("./pages/dashboard/StorefrontPreview.tsx"));
const ThemeStudioRoute = lazy(() => import("./pages/dashboard/ThemeStudioRoute.tsx"));
const Hardware = lazy(() => import("./pages/Hardware.tsx"));
const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Online = lazy(() => import("./pages/Online.tsx"));
const Payments = lazy(() => import("./pages/Payments.tsx"));
const PointOfSale = lazy(() => import("./pages/PointOfSale.tsx"));
const Pricing = lazy(() => import("./pages/Pricing.tsx"));
const ProductDetail = lazy(() => import("./pages/ProductDetail.tsx"));
const Splash = lazy(() => import("./pages/Splash.tsx"));
const Store = lazy(() => import("./pages/Store.tsx"));
const StoreIndex = lazy(() => import("./pages/StoreIndex.tsx"));
const HostAwareStorefrontRoute = lazy(() => import("./storefront/domains/HostAwareStorefrontRoute.tsx").then((module) => ({
  default: module.HostAwareStorefrontRoute,
})));
const HostAwareProductRoute = lazy(() => import("./storefront/domains/HostAwareStorefrontRoute.tsx").then((module) => ({
  default: module.HostAwareProductRoute,
})));
const HostAwareStorefrontNotFoundRoute = lazy(() => import("./storefront/domains/HostAwareStorefrontRoute.tsx").then((module) => ({
  default: module.HostAwareStorefrontNotFoundRoute,
})));

const queryClient = new QueryClient();
const platformRuntime = isPlatformHostname(window.location.hostname);

const RouteFallback = () => (
  <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
    Loading...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {platformRuntime ? (
              <>
              <Route path="/" element={<HostAwareStorefrontRoute page="home" platformElement={<Index />} />} />
              <Route path="/point-of-sale" element={<PointOfSale />} />
              <Route path="/online" element={<Online />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/hardware" element={<Hardware />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/splash" element={<Splash />} />
              <Route path="/store" element={<StoreIndex />} />
              <Route path="/store/:slug" element={<Store page="home" />} />
              <Route path="/store/:slug/home" element={<Store page="home" />} />
              <Route path="/store/:slug/products" element={<Store page="products" />} />
              <Route path="/store/:slug/collections/:collectionHandle" element={<Store page="collection" />} />
              <Route path="/store/:slug/about" element={<Store page="about" />} />
              <Route path="/store/:slug/contact" element={<Store page="contact" />} />
              <Route path="/store/:slug/pages/:pageSlug" element={<Store page="custom" />} />
              <Route path="/store/:slug/blog/:pageSlug" element={<Store page="blog" />} />
              <Route path="/store/:slug/cart" element={<Store page="cart" />} />
              <Route path="/store/:slug/search" element={<Store page="search" />} />
              <Route path="/store/:slug/product/:id" element={<ProductDetail />} />
              <Route path="/store/:slug/products/:handle" element={<ProductDetail />} />
              <Route path="/store/:slug/*" element={<Store page="404" />} />
              <Route path="/home" element={<HostAwareStorefrontRoute page="home" />} />
              <Route path="/products" element={<HostAwareStorefrontRoute page="products" />} />
              <Route path="/collections/:collectionHandle" element={<HostAwareStorefrontRoute page="collection" />} />
              <Route path="/about" element={<HostAwareStorefrontRoute page="about" />} />
              <Route path="/contact" element={<HostAwareStorefrontRoute page="contact" />} />
              <Route path="/pages/:pageSlug" element={<HostAwareStorefrontRoute page="custom" />} />
              <Route path="/blog/:pageSlug" element={<HostAwareStorefrontRoute page="blog" />} />
              <Route path="/cart" element={<HostAwareStorefrontRoute page="cart" />} />
              <Route path="/search" element={<HostAwareStorefrontRoute page="search" />} />
              <Route path="/product/:id" element={<HostAwareProductRoute />} />
              <Route path="/products/:handle" element={<HostAwareProductRoute />} />

              <Route element={<AuthBoundary />}>
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/auth/mfa" element={<AuthGuard><Mfa /></AuthGuard>} />
                <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
                <Route
                  path="/main-admin"
                  element={(
                    <AuthGuard requireAal2>
                      <PlatformAdminGuard><MainAdmin /></PlatformAdminGuard>
                    </AuthGuard>
                  )}
                />
                <Route path="/dashboard" element={<OnboardingGate><Overview /></OnboardingGate>} />
                <Route
                  path="/dashboard/store"
                  element={(
                    <OnboardingGate>
                      <AuthGuard capabilities={["theme.read"]} requireStore><MyStore /></AuthGuard>
                    </OnboardingGate>
                  )}
                />
                <Route
                  path="/dashboard/store/preview"
                  element={(
                    <OnboardingGate>
                      <AuthGuard capabilities={["theme.read"]} requireStore>
                        <StorefrontPreview />
                      </AuthGuard>
                    </OnboardingGate>
                  )}
                />
                <Route path="/dashboard" element={<OnboardingGate><DashboardLayout /></OnboardingGate>}>
                  <Route path="payments" element={<AuthGuard capabilities={["billing.manage"]} requireStore requireAal2><DashPayments /></AuthGuard>} />
                  <Route path="items" element={<AuthGuard capabilities={["catalog.read"]} requireStore><DashItems /></AuthGuard>} />
                  <Route path="orders" element={<AuthGuard capabilities={["orders.read"]} requireStore><Orders /></AuthGuard>} />
                  <Route path="customers" element={<AuthGuard capabilities={["orders.read"]} requireStore><DashCustomers /></AuthGuard>} />
                  <Route path="theme-studio" element={<ThemeStudioRoute />} />
                </Route>
                <Route
                  path="/domain/connect"
                  element={(
                    <OnboardingGate>
                      <AuthGuard capabilities={["domains.manage"]} requireStore requireAal2>
                        <DomainConnectLayout />
                      </AuthGuard>
                    </OnboardingGate>
                  )}
                >
                  <Route index element={<DomainOverviewPage />} />
                  <Route path="existing" element={<ConnectExistingDomainPage />} />
                  <Route path="search" element={<DomainSearchPage />} />
                  <Route path="transfer" element={<DomainTransferPage />} />
                  <Route path="google" element={<GoogleSearchPage />} />
                  <Route path="google/callback" element={<GoogleOAuthCallbackPage />} />
                  <Route path="seo" element={<SeoDashboardPage />} />
                  <Route path="status" element={<DomainStatusPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
              </>
            ) : (
              <>
                <Route path="/" element={<HostAwareStorefrontRoute page="home" />} />
                <Route path="/home" element={<HostAwareStorefrontRoute page="home" />} />
                <Route path="/products" element={<HostAwareStorefrontRoute page="products" />} />
                <Route path="/collections/:collectionHandle" element={<HostAwareStorefrontRoute page="collection" />} />
                <Route path="/about" element={<HostAwareStorefrontRoute page="about" />} />
                <Route path="/contact" element={<HostAwareStorefrontRoute page="contact" />} />
                <Route path="/pages/:pageSlug" element={<HostAwareStorefrontRoute page="custom" />} />
                <Route path="/blog/:pageSlug" element={<HostAwareStorefrontRoute page="blog" />} />
                <Route path="/cart" element={<HostAwareStorefrontRoute page="cart" />} />
                <Route path="/search" element={<HostAwareStorefrontRoute page="search" />} />
                <Route path="/product/:id" element={<HostAwareProductRoute />} />
                <Route path="/products/:handle" element={<HostAwareProductRoute />} />
                <Route path="*" element={<HostAwareStorefrontNotFoundRoute />} />
              </>
            )}
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
