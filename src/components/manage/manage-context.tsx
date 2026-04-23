"use client";

import { createContext, useContext } from "react";

interface ManageContextValue {
  subscriberId: string;
  siteId: string;
  subscriberName: string | null;
  siteName: string | null;
  plan: string | null;
}

const ManageContext = createContext<ManageContextValue>({
  subscriberId: "all",
  siteId: "all",
  subscriberName: null,
  siteName: null,
  plan: null,
});

export function ManageProvider({
  value,
  children,
}: {
  value: ManageContextValue;
  children: React.ReactNode;
}) {
  return <ManageContext.Provider value={value}>{children}</ManageContext.Provider>;
}

export function useManageContext() {
  return useContext(ManageContext);
}
