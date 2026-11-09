import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export const OnboardingGate = ({ children }: { children: JSX.Element }) => {
  const { user, bootstrap, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading...</div>;
  }
  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (!bootstrap?.profile.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
};
