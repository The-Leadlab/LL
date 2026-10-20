import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Toaster as ShadcnToaster } from '@/components/ui/Toaster';
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme } from "./theme";
import { router } from './router';
import { DarkModeProvider } from './components/ThemeProvider';
import { queryClient } from './lib/queryClient';

function App() {
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