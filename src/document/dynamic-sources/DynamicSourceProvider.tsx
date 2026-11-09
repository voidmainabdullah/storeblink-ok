import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import type { DynamicSourceData } from "./DynamicSourceSystem";

const DynamicSourceContext = createContext<DynamicSourceData>({});

export type DynamicSourceProviderProps = PropsWithChildren<{
  data: DynamicSourceData;
}>;

export const DynamicSourceProvider = ({ data, children }: DynamicSourceProviderProps) => {
  const value = useMemo(
    () => ({
      products: data.products ?? [],
      store: data.store,
      currency: data.currency ?? "USD",
    }),
    [data.currency, data.products, data.store],
  );
  return <DynamicSourceContext.Provider value={value}>{children}</DynamicSourceContext.Provider>;
};

export const useDynamicSourceData = (): DynamicSourceData => useContext(DynamicSourceContext);
