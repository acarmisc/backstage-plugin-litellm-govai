import { FC, ReactNode } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

/**
 * MUI theme for component tests. jsdom fires focus events synchronously, so
 * nested modals (a confirm dialog inside another dialog) fight over focus
 * forever, and exit transitions add needless waiting. Turn both off for
 * dialogs and popovers; behaviour under test is unchanged.
 */
const testTheme = createTheme({
  transitions: { create: () => 'none' },
  components: {
    MuiDialog: {
      defaultProps: {
        disableEnforceFocus: true,
        disableAutoFocus: true,
        disableRestoreFocus: true,
        transitionDuration: 0,
      },
    },
    MuiModal: {
      defaultProps: { disableEnforceFocus: true, disableAutoFocus: true, disableRestoreFocus: true },
    },
  },
});

export const TestTheme: FC<{ children?: ReactNode }> = ({ children }) => (
  <ThemeProvider theme={testTheme}>{children}</ThemeProvider>
);
