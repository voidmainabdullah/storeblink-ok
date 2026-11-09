import { AuthGuard } from "@/platform/auth";

export const ProtectedRoute = ({ children }: { children: JSX.Element }) => (
  <AuthGuard>{children}</AuthGuard>
);
