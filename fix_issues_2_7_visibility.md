# Fix for Issues #2 & #7: Key and Model Visibility (White-on-White)
# Files: packages/plugin-litellm/src/components/KeysTable.tsx, UsageStats.tsx

## Problem
The model/key text appears with white color on white/light background, making it invisible.

## Root Cause Analysis
Looking at the code, the issue is likely:
1. **CSS theme context** - When components render outside a proper MUI theme context
2. **Color token usage** - Using `color="text.primary"` on light backgrounds
3. **Typography component** - Missing explicit color or using theme incorrectly

## Issue #2: Generated Key Display (KeysTable.tsx, lines 273-280)
```tsx
<Box
  display="flex"
  alignItems="center"
  gap={1}
  mt={2}
  p={2}
  sx={{
    backgroundColor: 'grey.100',  // ← Light background
    borderRadius: 1,
  }}
>
  <Typography
    component="code"
    color="text.primary"  // ← May be white on light bg
    sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}
  >
    {newKeyValue}
  </Typography>
  <IconButton onClick={() => copyToClipboard(newKeyValue)}>
    <ContentCopy />
  </IconButton>
</Box>
```

## Issue #7: Model List Visibility (UsageStats.tsx, lines 205-209)
```tsx
{models.map(m => (
  <MenuItem key={m.model_name} value={m.model_name}>
    {m.model_name}  // ← Text might not contrast with background
  </MenuItem>
))}
```

## Comprehensive Fixes

### Fix 1: Key Display (KeysTable.tsx)
```tsx
<Box
  display="flex"
  alignItems="center"
  gap={1}
  mt={2}
  p={2}
  sx={{
    backgroundColor: 'action.hover',  // Use theme-aware hover color
    borderRadius: 1,
  }}
>
  <Typography
    component="code"
    color="primary.contrastText"  // High contrast text
    sx={{ 
      fontFamily: 'monospace', 
      wordBreak: 'break-all', 
      flex: 1,
      backgroundColor: 'background.paper', // Ensure contrast
      px: 1,
      py: 0.5,
      borderRadius: 1,
    }}
  >
    {newKeyValue}
  </Typography>
  <IconButton 
    onClick={() => copyToClipboard(newKeyValue)}
    sx={{ backgroundColor: 'background.paper' }}
  >
    <ContentCopy />
  </IconButton>
</Box>
```

### Fix 2: Model Dropdown Items (UsageStats.tsx)
```tsx
{models.map(m => (
  <MenuItem 
    key={m.model_name} 
    value={m.model_name}
    sx={{
      '&:hover': {
        backgroundColor: 'action.hover',
      },
    }}
  >
    <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
      {m.model_name}
    </Typography>
  </MenuItem>
))}
```

### Fix 3: Keys in Table (KeysTable.tsx, lines 206-213)
```tsx
<TableCell>
  <Box display="flex" alignItems="center" gap={0.5}>
    <Typography 
      variant="body2" 
      component="code" 
      color="primary"
      sx={{ 
        fontFamily: 'monospace', 
        backgroundColor: 'background.default', 
        px: 1, 
        py: 0.5, 
        borderRadius: 1,
        width: '100%',
      }}
    >
      {showKeyValue === key.key ? key.key : maskKey(key.key)}
    </Typography>
    {/* ... rest of buttons */}
  </Box>
</TableCell>
```

### Fix 4: Autocomplete Render Input (KeysTable.tsx, lines 316-323)
```tsx
<Autocomplete
  options={teams}
  getOptionLabel={t => t.team_alias || t.team_id}
  value={selectedTeam}
  onChange={(_e, team) =>
    setFormData({ ...formData, team_id: team?.team_id })
  }
  renderInput={params => (
    <TextField
      {...params}
      label="Team"
      helperText="Optional: bind this key to a specific team"
      fullWidth
      variant="outlined"  // Ensure outlined variant for visibility
      size="small"
      slotProps={{
        inputLabel: {
          shrink: true,
        },
        input: {
          sx: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'divider',
            },
          },
        },
      }}
    />
  )}
/>
```

## Alternative: Global Theme Fix (Recommended)
Add to Backstage app's theme configuration:

```typescript
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  components: {
    MuiChip: {
      styleOverrides: {
        root: {
          '& .MuiChip-label': {
            color: 'text.primary',  // Ensure chip text is visible
            backgroundColor: 'action.selected',  // Ensure contrast
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          '& .MuiTypography-root': {
            color: 'text.secondary',
          },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        code: {
          backgroundColor: 'background.default',
          px: 1,
          py: 0.5,
          borderRadius: 1,
        },
      },
    },
  },
});
```