/**
 * Debug Dashboard for Local Development
 * Accessible at localhost:7777/debug
 */

import React, { useState, useEffect } from 'react';

interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  port?: number;
  latency?: number;
}

interface EmulatorStatus {
  name: string;
  port: number;
  running: boolean;
}

export function DebugDashboard() {
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([]);
  const [emulators, setEmulators] = useState<EmulatorStatus[]>([]);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  useEffect(() => {
    checkHealth();
    checkEmulators();
    loadEnvVars();
    
    const interval = setInterval(() => {
      checkHealth();
      checkEmulators();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    const services = [
      { name: 'Mock AI', url: 'http://localhost:7001/health' },
      { name: 'Mock Payments', url: 'http://localhost:7002/health' },
      { name: 'Mock Wallet', url: 'http://localhost:7003/health' },
    ];

    const statuses = await Promise.all(
      services.map(async (service) => {
        try {
          const start = Date.now();
          const response = await fetch(service.url);
          const latency = Date.now() - start;
          const data = await response.json();
          
          return {
            service: service.name,
            status: data.status === 'ok' ? 'healthy' : 'degraded',
            port: data.port,
            latency,
          } as HealthStatus;
        } catch (error) {
          return {
            service: service.name,
            status: 'down',
          } as HealthStatus;
        }
      })
    );

    setHealthStatuses(statuses);
  };

  const checkEmulators = async () => {
    try {
      const response = await fetch('http://localhost:4400/emulators');
      const data = await response.json();
      
      setEmulators([
        { name: 'Auth', port: 9099, running: !!data.auth },
        { name: 'Firestore', port: 8080, running: !!data.firestore },
        { name: 'Functions', port: 5001, running: !!data.functions },
        { name: 'Storage', port: 9199, running: !!data.storage },
      ]);
    } catch (error) {
      setEmulators([
        { name: 'Auth', port: 9099, running: false },
        { name: 'Firestore', port: 8080, running: false },
        { name: 'Functions', port: 5001, running: false },
        { name: 'Storage', port: 9199, running: false },
      ]);
    }
  };

  const loadEnvVars = () => {
    // Sanitized environment variables
    setEnvVars({
      NODE_ENV: process.env.NODE_ENV || 'development',
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'avalo-dev',
      API_ENDPOINT: process.env.API_ENDPOINT || 'http://localhost:5001',
    });
  };

  return (
    <div style={{ fontFamily: 'system-ui', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🔧 Avalo Debug Dashboard</h1>
      
      {/* Health Status */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Service Health</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
          {healthStatuses.map((status) => (
            <div
              key={status.service}
              style={{
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                backgroundColor: 
                  status.status === 'healthy' ? '#d4edda' :
                  status.status === 'degraded' ? '#fff3cd' :
                  '#f8d7da',
              }}
            >
              <h3 style={{ margin: '0 0 10px 0' }}>{status.service}</h3>
              <p style={{ margin: '5px 0' }}>
                Status: <strong>{status.status.toUpperCase()}</strong>
              </p>
              {status.port && <p style={{ margin: '5px 0' }}>Port: {status.port}</p>}
              {status.latency && <p style={{ margin: '5px 0' }}>Latency: {status.latency}ms</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Emulator Status */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Firebase Emulators</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '10px', textAlign: 'left' }}>Emulator</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Port</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {emulators.map((emulator) => (
              <tr key={emulator.name} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '10px' }}>{emulator.name}</td>
                <td style={{ padding: '10px' }}>{emulator.port}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '4px',
                    backgroundColor: emulator.running ? '#d4edda' : '#f8d7da',
                    color: emulator.running ? '#155724' : '#721c24',
                  }}>
                    {emulator.running ? '✓ Running' : '✗ Stopped'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Environment Variables */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Environment Variables</h2>
        <pre style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '15px', 
          borderRadius: '8px',
          overflow: 'auto',
        }}>
          {JSON.stringify(envVars, null, 2)}
        </pre>
      </section>

      {/* Quick Actions */}
      <section>
        <h2>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.open('http://localhost:4000', '_blank')}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            🔥 Open Emulator UI
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            🔄 Refresh Status
          </button>
          <button
            onClick={() => window.open('http://localhost:5001', '_blank')}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            ⚡ Functions Logs
          </button>
        </div>
      </section>
    </div>
  );
}

export default DebugDashboard;