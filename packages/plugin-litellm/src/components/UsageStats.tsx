import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
} from '@mui/material';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DateRange, UsageMetrics, ModelInfo } from '../types';

interface UsageStatsProps {
  usage: UsageMetrics | null;
  models: ModelInfo[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  loading: boolean;
}

type DatePreset = 'today' | '7d' | '30d';

export const UsageStats: React.FC<UsageStatsProps> = ({
  usage,
  models,
  dateRange,
  onDateRangeChange,
  loading,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('7d');
  const [selectedModel, setSelectedModel] = useState<string>('all');

  const handlePresetChange = (preset: DatePreset) => {
    setSelectedPreset(preset);
    const end = new Date();
    const start = new Date();
    if (preset === 'today') start.setHours(0, 0, 0, 0);
    else if (preset === '7d') start.setDate(start.getDate() - 7);
    else if (preset === '30d') start.setDate(start.getDate() - 30);
    onDateRangeChange({ start, end });
  };

  if (loading) {
    return (
      <Paper sx={{ p: 2 }}>
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  const dailyData =
    usage?.daily_usage?.map((d) => ({
      date: d.date,
      spend: d.spend,
      promptTokens: d.prompt_tokens,
      completionTokens: d.completion_tokens,
      totalTokens: d.total_tokens,
    })) || [];

  const usageByModelData = Object.entries(usage?.usage_by_model || {}).map(([model, data]) => ({
    model,
    spend: data.total_spend,
    promptTokens: data.prompt_tokens,
    completionTokens: data.completion_tokens,
  }));

  const filteredModelData =
    selectedModel === 'all'
      ? usageByModelData
      : usageByModelData.filter((d) => d.model === selectedModel);

  return (
    <Paper sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">Usage Analytics</Typography>
        <Box display="flex" gap={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={selectedPreset}
              label="Period"
              onChange={(e) => handlePresetChange(e.target.value as DatePreset)}
            >
              <MenuItem value="today">Today</MenuItem>
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Model</InputLabel>
            <Select
              value={selectedModel}
              label="Model"
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <MenuItem value="all">All Models</MenuItem>
              {models.map((m) => (
                <MenuItem key={m.model_name} value={m.model_name}>
                  {m.model_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Daily Spend
          </Typography>
          <Box height={250}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Spend']} />
                <Area type="monotone" dataKey="spend" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Token Usage by Model
          </Typography>
          <Box height={250}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredModelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="model" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="promptTokens" name="Prompt Tokens" fill="#8884d8" stackId="a" />
                <Bar dataKey="completionTokens" name="Completion Tokens" fill="#82ca9d" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Box display="flex" gap={4} flexWrap="wrap">
            <Box>
              <Typography variant="body2" color="text.secondary">Total Spend</Typography>
              <Typography variant="h5">${usage?.total_spend?.toFixed(4) || '0.00'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Total Tokens</Typography>
              <Typography variant="h5">{usage?.total_tokens?.toLocaleString() || '0'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Prompt Tokens</Typography>
              <Typography variant="h5">{usage?.prompt_tokens?.toLocaleString() || '0'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Completion Tokens</Typography>
              <Typography variant="h5">{usage?.completion_tokens?.toLocaleString() || '0'}</Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};
