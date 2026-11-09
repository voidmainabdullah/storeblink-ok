import { Outlet } from "react-router-dom";
import { AuthProvider } from "./AuthProvider";
import { AuthRuntimeErrorBoundary } from "./AuthRuntimeErrorBoundary";

const AuthBoundary = () => (
  <AuthRuntimeErrorBoundary>
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  </AuthRuntimeErrorBoundary>
);

export default AuthBoundary;
