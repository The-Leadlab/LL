import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Toaster as ShadcnToaster } from '@/components/ui/Toaster';
import { useAuthStore } from './store/auth';
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme } from "./theme";
import { router } from './router';
import { DarkModeProvider } from './components/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Prefer cached data on navigation so pages don't flash full-screen loaders (B19/B41)
      staleTime: 30_000,
    },
  },
});

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <DarkModeProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Suspense fallback={<div>Loading...</div>}>
            <RouterProvider router={router} />
          </Suspense>
        </ThemeProvider>
        <Toaster position="top-right" />
        <ShadcnToaster />
      </QueryClientProvider>
    </DarkModeProvider>
  );
}

export default App;