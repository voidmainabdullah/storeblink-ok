import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

export type ThemeMobileMenuRuntime = {
  open: boolean;
  panelId: string | undefined;
  toggle: () => void;
  close: () => void;
};

const ThemeMobileMenuContext = createContext<ThemeMobileMenuRuntime | null>(null);

export const ThemeMobileMenuProvider = ({
  value,
  children,
}: PropsWithChildren<{ value: ThemeMobileMenuRuntime }>) => (
  <ThemeMobileMenuContext.Provider value={value}>
    {children}
  </ThemeMobileMenuContext.Provider>
);

export const useThemeMobileMenuRuntime = (): ThemeMobileMenuRuntime | null =>
  useContext(ThemeMobileMenuContext);
