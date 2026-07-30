import React, { useEffect, useRef, useState } from 'react';
import type { LocationData } from '../types/exif';
import { fetchNominatimAddress } from '../utils/nominatim';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, ExternalLink, Navigation, Globe, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MapLocationProps {
  location: LocationData;
}

export const MapLocation: React.FC<MapLocationProps> = ({ location }) => {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [allowedMapKey, setAllowedMapKey] = useState<string | null>(null);
  const [addressResult, setAddressResult] = useState<{ key: string; value: string } | null>(null);
  const [fetchingAddressKey, setFetchingAddressKey] = useState<string | null>(null);

  const hasGps = location.latitude !== undefined && location.longitude !== undefined;
  const lat = location.latitude ?? 0;
  const lng = location.longitude ?? 0;
  const locationKey = hasGps ? `${lat},${lng}` : '';
  const networkMapAllowed = allowedMapKey === locationKey;
  const address = addressResult?.key === locationKey ? addressResult.value : null;
  const fetchingAddress = fetchingAddressKey === locationKey;

  useEffect(() => {
    if (!hasGps || !networkMapAllowed || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);

    // Custom SVG Gold Marker Icon
    const goldPinHtml = `
      <div style="
        width: 32px;
        height: 32px;
        background: oklch(0.72 0.09 75);
        border: 2px solid oklch(0.11 0.012 55);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 10px;
          height: 10px;
          background: oklch(0.11 0.012 55);
          border-radius: 50%;
        "></div>
      </div>
    `;

    const customIcon = L.divIcon({
      html: goldPinHtml,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family: var(--font-sans); font-size: 12px;">
        <strong style="color: var(--gold);">${t('map.photoLocation')}</strong><br/>
        ${lat.toFixed(6)}°, ${lng.toFixed(6)}°<br/>
        ${location.altitude !== undefined ? t('map.altitude', { value: Math.round(location.altitude) }) : ''}
      </div>
    `).openPopup();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [hasGps, lat, lng, location.altitude, networkMapAllowed, t]);

  // Reverse geocoding optional fetch
  const handleFetchAddress = async () => {
    if (!hasGps) return;
    const requestKey = locationKey;
    setFetchingAddressKey(requestKey);
    try {
      const displayName = await fetchNominatimAddress(lat, lng);
      if (displayName) {
        setAddressResult({ key: requestKey, value: displayName });
      }
    } catch (e) {
      console.warn('Geocoding error:', e);
    } finally {
      setFetchingAddressKey((current) => current === requestKey ? null : current);
    }
  };

  if (!hasGps) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-card/30 p-10 text-center">

        <h3 className="mt-3 font-serif text-lg font-bold text-foreground">
          {t('map.noGps')}
        </h3>
        <p className="mt-1 max-w-sm font-sans text-xs text-muted-foreground">
          {t('map.noGpsDescription')}
        </p>
      </div>
    );
  }

  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const appleMapsUrl = `https://maps.apple.com/?q=${lat},${lng}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-xl font-bold tracking-tight text-foreground">
            {t('map.title')}
          </h3>
          <p className="font-sans text-xs text-muted-foreground">
            {t('map.description')}
          </p>
        </div>
        <span className="font-mono text-xs font-bold text-rose-400 uppercase">
          {t('map.exposed')}
        </span>
      </div>

      {/* Interactive Map Box */}
      <div className="relative overflow-hidden rounded-2xl border border-border shadow-xl">
        {networkMapAllowed ? (
          <div ref={mapContainerRef} className="h-72 w-full" />
        ) : (
          <div className="flex h-72 flex-col items-center justify-center bg-card/40 p-6 text-center">
            <ShieldAlert className="h-7 w-7 text-amber-400" />
            <strong className="mt-3 font-serif text-sm text-foreground">{t('map.paused')}</strong>
            <p className="mt-2 max-w-md font-sans text-xs leading-relaxed text-muted-foreground">
              {t('map.privacyNote')}
            </p>
            <button
              type="button"
              onClick={() => setAllowedMapKey(locationKey)}
              className="mt-4 border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-sans text-xs font-semibold text-amber-300 hover:border-amber-400"
            >
              {t('map.load')}
            </button>
          </div>
        )}
      </div>

      {/* Coordinates & External Map Links */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 font-sans text-xs">
        {/* Coordinates summary */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
          <div className="flex items-center gap-2 font-serif text-sm font-bold text-foreground">
            <MapPin className="h-4 w-4 text-gold" />
            <span>{t('map.coordinates')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono">
            <div className="rounded-lg border border-border bg-background p-2">
              <span className="text-[10px] text-muted-foreground block">{t('map.latitude')}</span>
              <span className="text-gold font-bold">{lat.toFixed(6)}°</span>
            </div>
            <div className="rounded-lg border border-border bg-background p-2">
              <span className="text-[10px] text-muted-foreground block">{t('map.longitude')}</span>
              <span className="text-gold font-bold">{lng.toFixed(6)}°</span>
            </div>
          </div>
          {location.altitude && (
            <div className="text-[11px] text-muted-foreground font-mono">
              <span className="text-foreground font-semibold">{t('map.altitude', { value: Math.round(location.altitude) })}</span>
            </div>
          )}
        </div>

        {/* Geocoding & Links */}
        <div className="rounded-xl border border-border bg-card/50 p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-serif text-sm font-bold text-foreground">{t('map.reverseGeocoding')}</span>
              {!address && (
                <button
                  type="button"
                  onClick={handleFetchAddress}
                  disabled={fetchingAddress}
                  className="text-[10px] font-medium text-gold hover:underline"
                >
                  {fetchingAddress ? t('map.fetching') : t('map.fetchAddress')}
                </button>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">
              {address ? address : fetchingAddress ? t('map.fetchingDetails') : t('map.fetchPrompt')}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              <a className="underline hover:text-foreground" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t('map.addressCredit')}</a>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
            <p className="w-full text-[10px] leading-relaxed text-muted-foreground">
              {t('map.providerNotice')}
            </p>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 font-sans text-xs text-foreground hover:border-gold/50"
            >
              <Globe className="h-3 w-3 text-gold" />
              <span>Google Maps</span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
            </a>
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 font-sans text-xs text-foreground hover:border-gold/50"
            >
              <Navigation className="h-3 w-3 text-cyan-400" />
              <span>Apple Maps</span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
            </a>
            <a
              href={osmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 font-sans text-xs text-foreground hover:border-gold/50"
            >
              <Globe className="h-3 w-3 text-emerald-400" />
              <span>OpenStreetMap</span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
