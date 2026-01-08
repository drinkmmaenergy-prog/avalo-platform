/**
 * PACK 367 — ASO, Reviews, Reputation & Store Defense Engine
 * ASO Manager UI
 * 
 * Admin interface for managing app store listings, metadata, and localization.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Grid,
  Alert,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  LinearProgress,
} from "@mui/material";
import {
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
  Visibility as PreviewIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";

// Types
interface StoreLocaleConfig {
  locale: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  keywords?: string[];
  promoText?: string;
}

interface StoreListingConfig {
  platform: "android" | "ios";
  country: string;
  locales: StoreLocaleConfig[];
  screenshots: string[];
  videoUrl?: string;
  lastUpdatedAt: number;
  lastUpdatedBy: string;
  a_b_testGroup?: "A" | "B";
  status: "draft" | "active" | "archived";
}

interface PolicyViolation {
  field: string;
  violationType: string;
  severity: "warning" | "blocking";
  message: string;
  suggestedFix?: string;
}

export function ASOManager() {
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [country, setCountry] = useState<string>("PL");
  const [listing, setListing] = useState<StoreListingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [violations, setViolations] = useState<PolicyViolation[]>([]);
  const [currentLocaleIndex, setCurrentLocaleIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Common countries for quick access
  const countries = ["PL", "US", "GB", "DE", "FR", "ES", "IT", "BR", "JP"];
  
  // Load listing on platform/country change
  useEffect(() => {
    loadListing();
  }, [platform, country]);

  const loadListing = async () => {
    setLoading(true);
    try {
      // Call backend API to get listing
      const response = await fetch(
        `/api/admin/store/listings?platform=${platform}&country=${country}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setListing(data);
      } else {
        // Create new listing if doesn't exist
        setListing({
          platform,
          country,
          locales: [{
            locale: `${country.toLowerCase()}-${country}`,
            title: "",
            shortDescription: "",
            fullDescription: "",
            keywords: [],
            promoText: "",
          }],
          screenshots: [],
          status: "draft",
          lastUpdatedAt: Date.now(),
          lastUpdatedBy: "",
        });
      }
    } catch (error) {
      console.error("Failed to load listing:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateListing = async () => {
    if (!listing) return;
    
    try {
      const response = await fetch("/api/admin/store/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing }),
      });
      
      const result = await response.json();
      setViolations(result.violations || []);
      
      return result.valid;
    } catch (error) {
      console.error("Validation failed:", error);
      return false;
    }
  };

  const saveListing = async () => {
    if (!listing) return;
    
    setSaving(true);
    try {
      // Validate first
      const isValid = await validateListing();
      
      if (!isValid && violations.some(v => v.severity === "blocking")) {
        alert("Cannot save: Blocking violations detected. Please fix them first.");
        setSaving(false);
        return;
      }
      
      // Save listing
      const response = await fetch("/api/admin/store/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          country,
          config: listing,
        }),
      });
      
      if (response.ok) {
        alert("Listing saved successfully!");
        await loadListing(); // Reload to get updated timestamps
      } else {
        throw new Error("Save failed");
      }
    } catch (error) {
      console.error("Failed to save listing:", error);
      alert("Failed to save listing. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateLocale = (index: number, field: keyof StoreLocaleConfig, value: any) => {
    if (!listing) return;
    
    const newLocales = [...listing.locales];
    newLocales[index] = { ...newLocales[index], [field]: value };
    setListing({ ...listing, locales: newLocales });
  };

  const addLocale = () => {
    if (!listing) return;
    
    setListing({
      ...listing,
      locales: [
        ...listing.locales,
        {
          locale: "",
          title: "",
          shortDescription: "",
          fullDescription: "",
          keywords: [],
        },
      ],
    });
  };

  const removeLocale = (index: number) => {
    if (!listing || listing.locales.length <= 1) return;
    
    const newLocales = listing.locales.filter((_, i) => i !== index);
    setListing({ ...listing, locales: newLocales });
    setCurrentLocaleIndex(Math.max(0, Math.min(currentLocaleIndex, newLocales.length - 1)));
  };

  const currentLocale = listing?.locales[currentLocaleIndex];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        ASO Manager
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Manage app store listings, metadata, and localization
      </Typography>

      {/* Platform & Country Selector */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Platform</InputLabel>
                <Select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as "android" | "ios")}
                  label="Platform"
                >
                  <MenuItem value="android">Android (Google Play)</MenuItem>
                  <MenuItem value="ios">iOS (App Store)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Country</InputLabel>
                <Select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  label="Country"
                >
                  {countries.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={3}>
              <Chip
                label={listing?.status || "Unknown"}
                color={
                  listing?.status === "active" ? "success" :
                  listing?.status === "draft" ? "warning" : "default"
                }
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <IconButton onClick={() => setShowHistory(true)} title="View History">
                  <HistoryIcon />
                </IconButton>
                <IconButton onClick={() => setShowPreview(true)} title="Preview">
                  <PreviewIcon />
                </IconButton>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading && <LinearProgress />}

      {/* Violations Alert */}
      {violations.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }} icon={<WarningIcon />}>
          <Typography variant="subtitle2" gutterBottom>
            Policy Violations Detected ({violations.length})
          </Typography>
          {violations.map((v, i) => (
            <Box key={i} sx={{ mb: 1 }}>
              <Typography variant="caption" component="div">
                <strong>{v.field}:</strong> {v.message}
                {v.suggestedFix && ` (${v.suggestedFix})`}
              </Typography>
            </Box>
          ))}
        </Alert>
      )}

      {/* Locale Tabs */}
      {listing && listing.locales.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Locales
              </Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={addLocale}
                variant="outlined"
                size="small"
              >
                Add Locale
              </Button>
            </Box>

            <Tabs
              value={currentLocaleIndex}
              onChange={(_, v) => setCurrentLocaleIndex(v)}
              sx={{ mb: 2 }}
            >
              {listing.locales.map((locale, i) => (
                <Tab
                  key={i}
                  label={locale.locale || `Locale ${i + 1}`}
                  icon={
                    listing.locales.length > 1 ? (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLocale(i);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    ) : undefined
                  }
                  iconPosition="end"
                />
              ))}
            </Tabs>

            {/* Locale Editor */}
            {currentLocale && (
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Locale Code"
                    value={currentLocale.locale}
                    onChange={(e) => updateLocale(currentLocaleIndex, "locale", e.target.value)}
                    placeholder="e.g., en-US, pl-PL"
                    helperText="Language-Country code"
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="App Title"
                    value={currentLocale.title}
                    onChange={(e) => updateLocale(currentLocaleIndex, "title", e.target.value)}
                    inputProps={{ maxLength: platform === "android" ? 50 : 30 }}
                    helperText={`${currentLocale.title.length}/${platform === "android" ? 50 : 30} characters`}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Short Description"
                    value={currentLocale.shortDescription}
                    onChange={(e) => updateLocale(currentLocaleIndex, "shortDescription", e.target.value)}
                    multiline
                    rows={2}
                    inputProps={{ maxLength: platform === "android" ? 80 : 170 }}
                    helperText={`${currentLocale.shortDescription.length}/${platform === "android" ? 80 : 170} characters`}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Full Description"
                    value={currentLocale.fullDescription}
                    onChange={(e) => updateLocale(currentLocaleIndex, "fullDescription", e.target.value)}
                    multiline
                    rows={8}
                    inputProps={{ maxLength: 4000 }}
                    helperText={`${currentLocale.fullDescription.length}/4000 characters`}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Keywords"
                    value={currentLocale.keywords?.join(", ") || ""}
                    onChange={(e) => updateLocale(
                      currentLocaleIndex,
                      "keywords",
                      e.target.value.split(",").map(k => k.trim()).filter(k => k)
                    )}
                    helperText="Comma-separated keywords"
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Promotional Text"
                    value={currentLocale.promoText || ""}
                    onChange={(e) => updateLocale(currentLocaleIndex, "promoText", e.target.value)}
                    multiline
                    rows={2}
                  />
                </Grid>
              </Grid>
            )}
          </CardContent>
        </Card>
      )}

      {/* Screenshots & Media */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Screenshots & Media
          </Typography>
          <TextField
            fullWidth
            label="Screenshot URLs (one per line)"
            value={listing?.screenshots.join("\n") || ""}
            onChange={(e) =>
              listing && setListing({
                ...listing,
                screenshots: e.target.value.split("\n").filter(u => u.trim())
              })
            }
            multiline
            rows={4}
            helperText="Storage URLs or CDN paths"
          />
          <TextField
            fullWidth
            label="Preview Video URL"
            value={listing?.videoUrl || ""}
            onChange={(e) =>
              listing && setListing({ ...listing, videoUrl: e.target.value })
            }
            sx={{ mt: 2 }}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
        <Button
          variant="outlined"
          onClick={() => validateListing()}
        >
          Validate Only
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={saveListing}
          disabled={saving || loading}
        >
          {saving ? "Saving..." : "Save Listing"}
        </Button>
      </Box>

      {/* History Dialog */}
      <Dialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Change History</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            History feature coming soon...
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHistory(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Store Listing Preview</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Preview feature coming soon...
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPreview(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ASOManager;
