import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ensureBuiltInThemePackages } from "@/themes/registerBuiltInThemePackages";

ensureBuiltInThemePackages();
createRoot(document.getElementById("root")!).render(<App />);
