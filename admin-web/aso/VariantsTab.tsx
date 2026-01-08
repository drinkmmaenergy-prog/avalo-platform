/**
 * PACK 357 — ASO Variants Management Tab
 * 
 * Create, edit, and manage ASO variants
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Edit, Delete, ContentCopy, PlayArrow, Pause } from '@mui/icons-material';

interface ASOVariant {
  variantId: string;
  platform: 'IOS' | 'ANDROID';
  title: string;
  subtitle: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  trafficAllocation?: number;
  targetCountries?: string[];
}

export default function VariantsTab() {
  const [variants, setVariants] = useState<ASOVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ASOVariant | null>(null);

  // TODO: Replace with actual Firebase calls
  const loadVariants = async () => {
    setLoading(false);
  };

  useEffect(() => {
    loadVariants();
  }, []);

  const handleStatusChange = async (variantId: string, newStatus: 'ACTIVE' | 'PAUSED') => {
    // TODO: Call Firebase function to update variant status
    console.log(`Updating variant ${variantId} to ${newStatus}`);
  };

  const handleClone = async (variantId: string) => {
    // TODO: Call Firebase function to clone variant
    console.log(`Cloning variant ${variantId}`);
  };

  const handleDelete = async (variantId: string) => {
    if (confirm('Are you sure you want to archive this variant?')) {
      // TODO: Call Firebase function to archive variant
      console.log(`Archiving variant ${variantId}`);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Button variant="contained" color="primary" onClick={() => setDialogOpen(true)}>
          Create New Variant
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Platform</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Subtitle</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Traffic %</TableCell>
              <TableCell>Countries</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {variants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No variants found. Create your first variant to get started.
                </TableCell>
              </TableRow>
            ) : (
              variants.map((variant) => (
                <TableRow key={variant.variantId}>
                  <TableCell>
                    <Chip 
                      label={variant.platform} 
                      size="small" 
                      color={variant.platform === 'IOS' ? 'primary' : 'success'}
                    />
                  </TableCell>
                  <TableCell>{variant.title}</TableCell>
                  <TableCell>{variant.subtitle}</TableCell>
                  <TableCell>
                    <Chip 
                      label={variant.status}
                      size="small"
                      color={
                        variant.status === 'ACTIVE' ? 'success' : 
                        variant.status === 'PAUSED' ? 'warning' : 
                        'default'
                      }
                    />
                  </TableCell>
                  <TableCell>{variant.trafficAllocation || 100}%</TableCell>
                  <TableCell>
                    {variant.targetCountries?.join(', ') || 'All'}
                  </TableCell>
                  <TableCell>
                    {variant.status === 'PAUSED' ? (
                      <IconButton
                        size="small"
                        onClick={() => handleStatusChange(variant.variantId, 'ACTIVE')}
                        title="Activate"
                      >
                        <PlayArrow />
                      </IconButton>
                    ) : (
                      <IconButton
                        size="small"
                        onClick={() => handleStatusChange(variant.variantId, 'PAUSED')}
                        title="Pause"
                      >
                        <Pause />
                      </IconButton>
                    )}
                    <IconButton 
                      size="small" 
                      onClick={() => setSelectedVariant(variant)}
                      title="Edit"
                    >
                      <Edit />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={() => handleClone(variant.variantId)}
                      title="Clone"
                    >
                      <ContentCopy />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={() => handleDelete(variant.variantId)}
                      title="Archive"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Variant Create/Edit Dialog */}
      <Dialog open={dialogOpen || !!selectedVariant} onClose={() => {
        setDialogOpen(false);
        setSelectedVariant(null);
      }} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedVariant ? 'Edit Variant' : 'Create New Variant'}
        </DialogTitle>
        <DialogContent>
          {/* Form fields would go here */}
          <Box sx={{ p: 2 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Platform</InputLabel>
              <Select defaultValue="IOS">
                <MenuItem value="IOS">iOS (App Store)</MenuItem>
                <MenuItem value="ANDROID">Android (Google Play)</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              label="Title"
              helperText="iOS: 30 chars max, Android: 50 chars max"
              sx={{ mb: 2 }}
            />
            
            <TextField
              fullWidth
              label="Subtitle"
              helperText="iOS only, 30 chars max"
              sx={{ mb: 2 }}
            />
            
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Description"
              helperText="4000 chars max"
              sx={{ mb: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setDialogOpen(false);
            setSelectedVariant(null);
          }}>
            Cancel
          </Button>
          <Button variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
