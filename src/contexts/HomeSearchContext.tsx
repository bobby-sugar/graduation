import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

type HomeSearchContextValue = {
  query: string;
  setQuery: (q: string) => void;
  debouncedQuery: string;
  clearQuery: () => void;
};

const HomeSearchContext = createContext<HomeSearchContextValue | null>(null);

export function HomeSearchProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 320);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (location.pathname !== "/") {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [location.pathname]);

  const clearQuery = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const value = useMemo(
    () => ({ query, setQuery, debouncedQuery, clearQuery }),
    [query, debouncedQuery, clearQuery],
  );

  return <HomeSearchContext.Provider value={value}>{children}</HomeSearchContext.Provider>;
}

export function useHomeSearch(): HomeSearchContextValue {
  const ctx = useContext(HomeSearchContext);
  if (!ctx) throw new Error("useHomeSearch must be used within HomeSearchProvider");
  return ctx;
}
