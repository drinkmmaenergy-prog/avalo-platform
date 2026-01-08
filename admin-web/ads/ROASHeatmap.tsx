/**
 * PACK 356 - ROAS Heatmap
 * Visualizes ROAS performance by country and campaign
 */

import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Grid } from '@mui/material';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface CountryPerformance {
  countryCode: string;
  totalSpend: number;
  totalRevenue: number;
  activeCampaigns: number;
  roas: number;
}

const ROASHeatmap: React.FC = () => {
  const [countryData, setCountryData] = useState<CountryPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const functions = getFunctions();

  useEffect(() => {
    loadCountryPerformance();
  }, []);

  const loadCountryPerformance = async () => {
    try {
      const { getFirestore, collection, getDocs } = await import('firebase/firestore');
      const db = getFirestore();
      
      const snapshot = await getDocs(collection(db, 'adCountryPerformance'));
      const data = snapshot.docs.map(doc => doc.data()) as CountryPerformance[];
      
      setCountryData(data);
    } catch (error) {
      console.error('Error loading country performance:', error);
    }
    setLoading(false);
  };

  const getROASColor = (roas: number): string => {
    if (roas >= 2.0) return '#4caf50'; // Green
    if (roas >= 1.2) return '#2196f3'; // Blue
    if (roas >= 0.9) return '#ff9800'; // Orange
    return '#f44336'; // Red
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        ROAS by Country
      </Typography>
      
      <Grid container spacing={2}>
        {countryData
          .sort((a, b) => b.roas - a.roas)
          .map((country) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={country.countryCode}>
              <Card
                sx={{
                  background: `linear-gradient(135deg, ${getROASColor(country.roas)} 0%, ${getROASColor(country.roas)}99 100%)`,
                  color: 'white',
                }}
              >
                <CardContent>
                  <Typography variant="h6">{country.countryCode}</Typography>
                  <Typography variant="h4">{country.roas.toFixed(2)}x</Typography>
                  <Typography variant="body2">
                    {country.activeCampaigns} campaigns
                  </Typography>
                  <Typography variant="caption">
                    Spend: ${country.totalSpend.toFixed(0)} | Revenue: ${country.totalRevenue.toFixed(0)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
      </Grid>
    </Box>
  );
};

export default ROASHeatmap;
