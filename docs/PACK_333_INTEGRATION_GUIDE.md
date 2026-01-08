# PACK 333 - Integration Guide

## Overview

PACK 333 provides orchestration and coordination for all system packs. This guide explains how to integrate the orchestration layer into your application.

## Quick Start

### 1. Import the Orchestrator

```typescript
import { PackOrchestrator } from '@/lib/orchestration/pack-orchestrator';
```

### 2. Initialize at App Startup

```typescript
// In your app entry point (e.g., app/_layout.tsx or App.tsx)
async function initializeApp() {
  try {
    await PackOrchestrator.initialize();
    console.log('✅ Orchestration initialized');
  } catch (error) {
    console.error('❌ Orchestration failed:', error);
    throw error;
  }
}
```

### 3. Check Health Status

```typescript
const isHealthy = await PackOrchestrator.isHealthy();
const packStatuses = PackOrchestrator.getPackStatuses();
```

## Components

### Pack Orchestrator
Main coordination engine that manages pack lifecycle.

**Key Methods:**
- `PackOrchestrator.initialize()` - Initialize orchestration
- `PackOrchestrator.isHealthy()` - Check system health
- `PackOrchestrator.getPackStatuses()` - Get all pack statuses
- `PackOrchestrator.getDependencyGraph()` - Get dependency information

### Dependency Graph
Manages pack dependencies and initialization order.

**Features:**
- Topological sorting for initialization
- Circular dependency detection
- Dependency validation

### Health Checker
Monitors pack health continuously.

**Features:**
- Continuous health monitoring (30-second intervals)
- Per-pack health checks
- Aggregate health status

### Feature Flags
Controls pack activation and rollout.

**Usage:**
```typescript
import { FeatureFlags } from '@/lib/orchestration/feature-flags';

const flags = new FeatureFlags();

// Check if pack is enabled
if (flags.isEnabled('326')) {
  // Use pack 326 features
}

// Gradual rollout
flags.setRolloutPercentage('326', 50); // 50% rollout
```

### Event Bus
Inter-pack communication system.

**Usage:**
```typescript
import { EventBus, PackEvents } from '@/lib/orchestration/contracts/event-bus';

const bus = EventBus.getInstance();

// Subscribe to events
bus.on(PackEvents.INITIALIZED, (data) => {
  console.log('Pack initialized:', data);
});

// Emit events
await bus.emit(PackEvents.INITIALIZED, 'pack-300', { version: '1.0' });
```

### Guards

**Config Validator:**
Validates system configuration at startup.

**Dependency Guard:**
Enforces dependency requirements.

### Telemetry & Logging

**Pack Telemetry:**
```typescript
import { PackTelemetry } from '@/lib/orchestration/monitoring/pack-telemetry';

const telemetry = PackTelemetry.getInstance();
telemetry.recordMetric('pack-300', 'requests', 1);
```

**Orchestration Logger:**
```typescript
import { OrchestrationLogger, LogLevel } from '@/lib/orchestration/monitoring/orchestration-logs';

const logger = OrchestrationLogger.getInstance();
logger.info('Pack started', '300');
logger.error('Pack failed', '326', { error: 'timeout' });
```

## Pack Contract

To make your pack compatible with PACK 333, implement the `PackContract` interface:

```typescript
import { PackContract, PackStatus } from '@/lib/orchestration/contracts/pack-contract.interface';

export class MyPack implements PackContract {
  readonly id = '400';
  readonly name = 'My Pack';
  readonly version = '1.0.0';
  readonly dependencies = ['300', '301'];

  async initialize(): Promise<void> {
    // Initialize your pack
  }

  async healthCheck(): Promise<boolean> {
    // Return true if healthy
    return true;
  }

  async shutdown(): Promise<void> {
    // Clean up resources
  }

  getStatus(): PackStatus {
    return {
      id: this.id,
      initialized: true,
      healthy: true,
      lastHealthCheck: new Date()
    };
  }
}
```

## Configuration

Edit [`config/pack-dependencies.json`](../config/pack-dependencies.json) to configure packs:

```json
{
  "packs": {
    "400": {
      "name": "My Pack",
      "deps": ["300", "301"],
      "critical": true,
      "description": "My custom pack"
    }
  }
}
```

## Health Check Endpoints

If you're running an API server, you can expose health check endpoints:

```typescript
// Example Express.js routes
app.get('/health/orchestration', async (req, res) => {
  const healthy = await PackOrchestrator.isHealthy();
  res.status(healthy ? 200 : 503).json({ healthy });
});

app.get('/health/packs', (req, res) => {
  const statuses = PackOrchestrator.getPackStatuses();
  res.json(statuses);
});

app.get('/health/dependencies', (req, res) => {
  const graph = PackOrchestrator.getDependencyGraph();
  res.json({
    initOrder: graph.getInitOrder(),
    packs: graph.getAllPacks()
  });
});
```

## Troubleshooting

### Circular Dependencies
If initialization fails with circular dependency error:
1. Check [`config/pack-dependencies.json`](../config/pack-dependencies.json)
2. Review pack dependencies
3. Break circular references

### Pack Not Initializing
1. Check feature flags - pack might be disabled
2. Verify dependencies are satisfied
3. Check health status of dependency packs
4. Review logs with `OrchestrationLogger`

### Health Checks Failing
1. Check individual pack health with `healthChecker.checkPack(packId)`
2. Review error logs
3. Verify external services are accessible
4. Check resource availability (memory, connections)

## Best Practices

1. **Initialize Early**: Call `PackOrchestrator.initialize()` as early as possible in your app lifecycle.

2. **Handle Failures**: Always wrap initialization in try-catch and handle errors gracefully.

3. **Monitor Health**: Set up alerts based on health check results.

4. **Use Feature Flags**: Roll out new packs gradually using feature flags.

5. **Event-Driven**: Use the event bus for loose coupling between packs.

6. **Log Appropriately**: Use structured logging with pack IDs for easier debugging.

7. **Test Dependencies**: Validate dependency order in tests before deploying.

## Migration from Direct Pack Usage

**Before (without PACK 333):**
```typescript
import { Pack300 } from './packs/300';
import { Pack301 } from './packs/301';

// Manual initialization
await Pack300.init();
await Pack301.init();
```

**After (with PACK 333):**
```typescript
import { PackOrchestrator } from '@/lib/orchestration/pack-orchestrator';

// Automatic initialization in correct order
await PackOrchestrator.initialize();
```

## Support

For issues or questions about PACK 333:
1. Check this integration guide
2. Review [`PACK_333_ORCHESTRATION_LAYER.md`](../PACK_333_ORCHESTRATION_LAYER.md)
3. Check logs with `OrchestrationLogger`
4. Verify configuration in `config/pack-dependencies.json`

## Version History

- **v1.0**: Initial release with core orchestration features