'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MapOptions } from 'ts-maps';
import { VectorMap as TSVectorMap } from 'ts-maps';

// Simple VectorMap component wrapper
interface VectorMapProps {
  options: Omit<MapOptions, 'selector'>;
  mapName: string;
  height?: string;
  onRegionClick?: (event: MouseEvent, code: string) => void;
  onMarkerClick?: (event: MouseEvent, index: string) => void;
  onLoaded?: () => void;
  children?: React.ReactNode;
}

function VectorMap({ options, mapName, height = '400px', onRegionClick, onMarkerClick, onLoaded, children }: VectorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<TSVectorMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !mounted) return;

    // Generate a stable ID that won't cause hydration issues
    const id = `ts-maps-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    containerRef.current.id = id;

    const map = new TSVectorMap({
      ...options,
      map: {
        ...options.map,
        name: mapName,
      },
      selector: `#${id}`,
      onRegionClick: (event: MouseEvent, code: string) => {
        onRegionClick?.(event, code);
      },
      onMarkerClick: (event: MouseEvent, index: string) => {
        onMarkerClick?.(event, index);
      },
      onLoaded: () => {
        setLoading(false);
        onLoaded?.();
      },
    });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current = null;
      }
    };
  }, [options, mapName, mounted, onRegionClick, onMarkerClick, onLoaded]);

  if (!mounted) {
    return (
      <div
        style={{
          height,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
        }}
      >
        <div style={{
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#666',
        }}>
          {children || 'Loading map...'}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height,
        position: 'relative',
      }}
    >
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#666',
        }}>
          {children || 'Loading map...'}
        </div>
      )}
    </div>
  );
}

type MapName = 'world' | 'world-merc' | 'us-merc' | 'us-mill' | 'us-lcc' | 'us-aea' | 'spain' | 'italy' | 'canada' | 'brasil';

interface EventData {
  type: string;
  code?: string;
  marker?: any;
  time: string;
}

const mapOptions = [
  { value: 'world', label: 'World Map', projection: 'miller' },
  { value: 'world-merc', label: 'World (Mercator)', projection: 'mercator' },
  { value: 'us-merc', label: 'USA (Mercator)', projection: 'mercator' },
  { value: 'us-mill', label: 'USA (Miller)', projection: 'miller' },
  { value: 'us-lcc', label: 'USA (Lambert)', projection: 'lambert' },
  { value: 'us-aea', label: 'USA (Albers)', projection: 'albers' },
  { value: 'spain', label: 'Spain', projection: 'mercator' },
  { value: 'italy', label: 'Italy', projection: 'mercator' },
  { value: 'canada', label: 'Canada', projection: 'mercator' },
  { value: 'brasil', label: 'Brasil', projection: 'mercator' },
];

export default function Home() {
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [lastEvent, setLastEvent] = useState<EventData | null>(null);
  const [currentMap, setCurrentMap] = useState<MapName>('world');

  const [options, setOptions] = useState<Omit<MapOptions, 'selector'>>({
    map: {
      name: 'world',
      projection: 'miller',
    },
    backgroundColor: '#ffffff',
    zoomOnScroll: true,
    zoomButtons: true,
    regionsSelectable: true,
    markersSelectable: true,
    regionStyle: {
      initial: {
        fill: '#e4e4e4',
        stroke: '#ffffff',
        strokeWidth: 0.5,
      },
      hover: {
        fill: '#2ca25f',
      },
      selected: {
        fill: '#1a9850',
      },
    },
    visualizeData: {
      scale: ['#C8EEFF', '#0071A4'],
      values: {
        US: 100,
        GB: 75,
        FR: 80,
        DE: 85,
        IT: 60,
        ES: 65,
      },
    },
    markers: [
      {
        name: 'Sample Marker',
        coords: [40.7128, -74.0060],
        style: {
          fill: '#ff0000',
          stroke: '#ffffff',
          r: 5,
        },
      },
    ],
  });

  const currentProjection = mapOptions.find(map => map.value === currentMap)?.projection || 'unknown';

  // Update map name and projection when currentMap changes
  useEffect(() => {
    setOptions(prev => ({
      ...prev,
      map: {
        name: currentMap,
        projection: currentProjection as 'mercator' | 'miller',
      },
    }));
  }, [currentMap, currentProjection]);

  const toggleTheme = useCallback(() => {
    const newTheme = !isDarkTheme;
    setIsDarkTheme(newTheme);
    
    setOptions(prev => ({
      ...prev,
      backgroundColor: newTheme ? '#2c3e50' : '#ffffff',
      regionStyle: {
        ...prev.regionStyle,
        initial: {
          ...prev.regionStyle?.initial,
          fill: newTheme ? '#34495e' : '#e4e4e4',
          stroke: newTheme ? '#1a1a1a' : '#ffffff',
        },
      },
    }));
  }, [isDarkTheme]);

  const addRandomMarker = useCallback(() => {
    const lat = Math.random() * 180 - 90;
    const lng = Math.random() * 360 - 180;
    const marker = {
      name: `Marker ${(options.markers?.length ?? 0) + 1}`,
      coords: [lat, lng] as [number, number],
      style: {
        fill: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        stroke: '#ffffff',
        r: 5,
      },
    };
    
    setOptions(prev => ({
      ...prev,
      markers: [...(prev.markers || []), marker],
    }));
  }, [options.markers?.length]);

  const toggleZoom = useCallback(() => {
    setOptions(prev => ({
      ...prev,
      zoomOnScroll: !prev.zoomOnScroll,
    }));
  }, [options.zoomOnScroll]);

  const handleRegionClick = useCallback((event: MouseEvent, code: string) => {
    setLastEvent({
      type: 'Region Click',
      code,
      time: new Date().toLocaleTimeString(),
    });
  }, []);

  const handleMarkerClick = useCallback((event: MouseEvent, index: string) => {
    const markerIndex = parseInt(index, 10);
    setLastEvent({
      type: 'Marker Click',
      marker: options.markers?.[markerIndex],
      time: new Date().toLocaleTimeString(),
    });
  }, [options.markers]);

  const handleLoaded = useCallback(() => {
    setOptions(prev => ({
      ...prev,
      projection: currentProjection,
    }));
    setLastEvent({
      type: 'Map Loaded',
      time: new Date().toLocaleTimeString(),
    });
  }, [currentProjection]);

  return (
    <div className="container">
      <h1>Vector Map Example</h1>

      <div className="controls">
        <div className="control-group">
          <label htmlFor="map-select">Select Map:</label>
          <select 
            id="map-select" 
            value={currentMap} 
            onChange={(e) => setCurrentMap(e.target.value as MapName)}
          >
            {mapOptions.map((map) => (
              <option key={map.value} value={map.value}>
                {map.label} ({map.projection})
              </option>
            ))}
          </select>
        </div>

        <div className="control-info">
          Current Projection: <strong>{currentProjection}</strong>
        </div>

        <button onClick={toggleTheme}>
          Toggle Theme
        </button>
        <button onClick={addRandomMarker}>
          Add Random Marker
        </button>
        <button onClick={toggleZoom}>
          {options.zoomOnScroll ? 'Disable' : 'Enable'} Zoom
        </button>
      </div>

      <div className="map-container">
        <VectorMap
          options={options}
          mapName={currentMap}
          height="500px"
          onRegionClick={handleRegionClick}
          onMarkerClick={handleMarkerClick}
          onLoaded={handleLoaded}
        >
          <div className="custom-loading">
            Loading your beautiful map...
          </div>
        </VectorMap>
      </div>

      <div className="components-showcase">
        <h2>Individual Map Components</h2>
        <p>Individual map components showcase will be available once the ts-maps-react package is properly built and installed.</p>
        <p>For now, you can use the main VectorMap component above with different map names and projections.</p>
      </div>

      {lastEvent && (
        <div className="info-panel">
          <h3>Last Event</h3>
          <pre>{JSON.stringify(lastEvent, null, 2)}</pre>
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .controls {
          margin: 20px 0;
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          align-items: center;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .control-group label {
          font-weight: 500;
        }

        .control-group select {
          padding: 8px;
          border-radius: 4px;
          border: 1px solid #ddd;
          background: white;
          min-width: 200px;
        }

        .controls button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          background: #2ca25f;
          color: white;
          cursor: pointer;
        }

        .controls button:hover {
          background: #1a9850;
        }

        .map-container {
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
        }

        .info-panel {
          margin-top: 20px;
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
        }

        .info-panel pre {
          background: white;
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
        }

        .custom-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 500px;
          background: #f5f5f5;
          font-size: 1.2em;
          color: #666;
        }

        .components-showcase {
          margin-top: 40px;
        }

        .components-showcase h2 {
          color: #333;
          margin-bottom: 10px;
        }

        .components-showcase p {
          color: #666;
          margin-bottom: 30px;
        }

        .maps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
      `}</style>
    </div>
  );
}
